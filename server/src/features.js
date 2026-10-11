import express from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PDFDocument } from "pdfkit";
import {
  Report,
  Evidence,
  Staff,
  Session,
  History,
  Privacy,
  Audit,
} from "./models.js";
import {
  Notification,
  Message,
  DraftVersion,
  Assignment,
  Content,
  ContentVersion,
  PublicFeedback,
  AccountToken,
  Setting,
  Job,
  AppError,
  Upload,
  Mail,
  NewsMedia,
} from "./feature-models.js";
import { registerNewsMedia, newsCategories } from "./news-media.js";
import { seal, unseal, hash, randomToken, digest, mac } from "./crypto.js";
import { config } from "./config.js";
import { types, districts } from "./districts.js";
import { scannerHealth } from "./scanner.js";
import {
  publicEligibility,
  serializeCase,
  visibleUpazilas,
  visibleUnions,
} from "./public-cases.js";
import {
  notify,
  notifyAdmins,
  hasPermission,
  permissionNames,
  mailConfigured,
  queueMail,
  savedSettings,
  runJob,
  chunkDirectory,
  cleanupUpload,
  recordSafeError,
} from "./feature-services.js";
const oid = z.string().regex(/^[a-f\d]{24}$/i),
  text = z.string().trim().min(3).max(4000);
const publicId = z.string().regex(/^[\w-]{20,40}$/);
const identifying =
  /(?:[0-9০-৯][\s-]?){10,17}|[\w.+-]+@[\w.-]+\.[a-z]+|https?:\/\//i;
const page = z.enum(["home", "awareness", "safety", "privacy", "all"]);
const chunkSize = 5 * 1024 * 1024;
const xml = (s) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function installFeatures(app, ctx) {
  const {
    parse,
    fail,
    staffAuth,
    csrf,
    allow,
    getReport,
    reporterAccess,
    audit,
    evidenceStorage,
    finishEvidenceUpload,
    uploadCapacity,
    openEvidence,
    transitions,
  } = ctx;
  const pub = express.Router(),
    account = express.Router(),
    reporter = express.Router({ mergeParams: true }),
    staff = express.Router(),
    admin = express.Router();
  const makeLimit = () =>
    rateLimit({
      windowMs: 15 * 60000,
      limit: 15,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    });
  app.use("/api/v1/features/public", pub);
  app.use("/api/v1/features/account", makeLimit(), account);
  app.use("/api/v1/features/reporter/:id", reporter);
  app.use("/api/v1/features/staff", staffAuth, csrf, staff);
  app.use(
    "/api/v1/features/admin",
    staffAuth,
    csrf,
    allow("super_admin"),
    admin,
  );
  const permit = (name) => (req, res, next) => {
    if (!hasPermission(req.staff, name))
      fail(403, "This action is disabled for your account.");
    next();
  };
  async function pubReport(id) {
    parse(publicId, id);
    const r = await Report.findOne({
      ...publicEligibility(),
      "publicEntry.publicId": id,
    });
    if (!r) fail(404, "Public account unavailable.");
    return r;
  }
  pub.get("/content", async (req, res) => {
    const q = parse(
      z
        .object({
          kind: z
            .enum([
              "faq",
              "article",
              "resource",
              "announcement",
              "category",
              "section",
              "news",
            ])
            .optional(),
          page: page.optional(),
        })
        .strict(),
      req.query,
    );
    const filter = {
      state: "published",
      enabled: true,
      $or: [{ publishAt: { $lte: new Date() } }, { publishAt: null }],
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.page ? { page: { $in: [q.page, "all"] } } : {}),
    };
    res.json({
      items: await Content.find(filter)
        .sort({ rank: 1, slug: 1 })
        .limit(200)
        .select("slug kind title titleBn body bodyBn url page rank -_id")
        .lean(),
    });
  });
  const newsEligibility = () => ({
    kind: "news",
    state: "published",
    enabled: true,
    $or: [{ publishAt: { $lte: new Date() } }, { publishAt: null }],
  });
  registerNewsMedia(admin, pub, { fail, audit });
  pub.get("/news", async (req, res) => {
    const q = parse(
      z
        .object({
          page: z.coerce.number().int().min(1).max(1000).default(1),
          featured: z.enum(["true"]).optional(),
          q: z.string().trim().max(100).optional(),
          category: z.enum(newsCategories).optional(),
          district: z
            .string()
            .regex(/^[a-z0-9-]{1,60}$/)
            .optional(),
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
        })
        .strict(),
      req.query,
    );
    const filter = {
      ...newsEligibility(),
      ...(q.featured ? { featured: true } : {}),
      ...(q.category ? { newsCategory: q.category } : {}),
      ...(q.district ? { district: q.district } : {}),
    };
    if (q.q) {
      const escaped = q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$and = [
        {
          $or: [
            { title: { $regex: escaped, $options: "i" } },
            { titleBn: { $regex: escaped, $options: "i" } },
          ],
        },
      ];
    }
    if (q.from || q.to) {
      filter.$expr = {
        $and: [
          ...(q.from
            ? [
                {
                  $gte: [
                    { $ifNull: ["$publishAt", "$updatedAt"] },
                    new Date(q.from),
                  ],
                },
              ]
            : []),
          ...(q.to
            ? [
                {
                  $lt: [
                    { $ifNull: ["$publishAt", "$updatedAt"] },
                    new Date(new Date(q.to).getTime() + 86400000),
                  ],
                },
              ]
            : []),
        ],
      };
    }
    const [items, total] = await Promise.all([
      Content.find(filter)
        .sort({ rank: 1, publishAt: -1, updatedAt: -1, slug: 1 })
        .skip((q.page - 1) * 10)
        .limit(10)
        .select(
          "slug title titleBn body bodyBn url featured publishAt updatedAt newsCategory district coverMediaId videoMediaId -_id",
        )
        .lean(),
      Content.countDocuments(filter),
    ]);
    res.json({ items, page: q.page, total, pages: Math.ceil(total / 10) });
  });
  pub.get("/news/:slug", async (req, res) => {
    const slug = parse(
      z.string().regex(/^[a-z][a-z0-9_-]{2,60}$/),
      req.params.slug,
    );
    const item = await Content.findOne({ ...newsEligibility(), slug })
      .select(
        "slug title titleBn body bodyBn url featured publishAt updatedAt newsCategory district coverMediaId videoMediaId -_id",
      )
      .lean();
    if (!item) fail(404, "News unavailable.");
    const related = await Content.find({
      ...newsEligibility(),
      slug: { $ne: slug },
      newsCategory: item.newsCategory || "important",
    })
      .sort({ rank: 1, publishAt: -1 })
      .limit(4)
      .select(
        "slug title titleBn body bodyBn newsCategory publishAt updatedAt coverMediaId videoMediaId -_id",
      )
      .lean();
    res.json({ item, related });
  });
  pub.get("/summary", async (req, res) => {
    const rows = await Report.aggregate([
      { $match: publicEligibility() },
      { $group: { _id: "$publicEntry.incidentMonth", count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 24 },
    ]);
    res.json({
      months: rows.map((r) => ({
        month: r._id,
        count: r.count >= config.minCount ? r.count : null,
        withheld: r.count < config.minCount,
      })),
      notice:
        "Only consented independently approved public accounts. Small groups are withheld. These are not crime rates.",
    });
  });
  pub.get("/layout", async (_, res) =>
    res.json({
      items: await Content.find({
        kind: "section",
        state: "published",
        page: { $in: ["home", "all"] },
        $or: [{ publishAt: { $lte: new Date() } }, { publishAt: null }],
      })
        .select("slug title titleBn body bodyBn rank enabled -_id")
        .sort({ rank: 1 })
        .lean(),
    }),
  );
  pub.get("/categories", async (_, res) =>
    res.json({
      items: await Content.find({
        kind: "category",
        state: "published",
        $or: [{ publishAt: { $lte: new Date() } }, { publishAt: null }],
      })
        .select("slug title titleBn body bodyBn enabled -_id")
        .lean(),
    }),
  );
  pub.get("/cases/:id/related", async (req, res) => {
    const r = await pubReport(req.params.id),
      rows = await Report.find({
        ...publicEligibility(),
        _id: { $ne: r._id },
        $or: [
          { districtCode: r.districtCode },
          { incidentType: r.incidentType },
        ],
      })
        .sort({ "publicEntry.publishedAt": -1 })
        .limit(4);
    const visible = await visibleUpazilas(),
      safe = await visibleUnions();
    res.json({
      items: rows.map((r) => {
        const x = serializeCase(r, visible, safe);
        delete x.body;
        return x;
      }),
    });
  });
  pub.post("/cases/:id/feedback", makeLimit(), async (req, res) => {
    const r = await pubReport(req.params.id),
      b = parse(
        z
          .object({
            kind: z.enum(["correction", "harmful_content"]),
            description: text,
            website: z.string().max(0).optional(),
          })
          .strict(),
        req.body,
      );
    const f = await PublicFeedback.create({
      publicId: req.params.id,
      reportId: r._id,
      kind: b.kind,
      textEncrypted: seal(b.description),
      dueAt: new Date(Date.now() + 7 * 86400000),
    });
    await notifyAdmins("feedback", "Public feedback requires review", r._id);
    await audit(req, "public.feedback", "publicFeedback", f._id);
    res.status(201).json({ reference: f._id });
  });
  pub.get("/share/:id", async (req, res) => {
    const r = await pubReport(req.params.id),
      url = `${config.origin}/incidents/${encodeURIComponent(req.params.id)}`;
    res
      .type("html")
      .send(
        `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${xml(r.publicEntry.title)} · ChandaWatch BD</title><meta property="og:title" content="${xml(r.publicEntry.title)}"><meta property="og:description" content="${xml(r.publicEntry.summary)}"><meta property="og:type" content="article"><meta property="og:url" content="${xml(url)}"><meta property="og:image" content="${xml(config.origin)}/api/v1/features/public/share-image"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="${xml(url)}"></head><body><main><h1>${xml(r.publicEntry.title)}</h1><p>${xml(r.publicEntry.summary)}</p><p>পরিচয়মুক্ত বিবরণ · স্বাধীন পর্যালোচনা · Original evidence private</p><a href="${xml(url)}">পুরো বিবরণ পড়ুন / Read account</a></main></body></html>`,
      );
  });
  pub.get("/share-image", (_, res) =>
    res
      .type("svg")
      .send(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#155947"/><circle cx="980" cy="315" r="210" fill="#dfebe0"/><text x="80" y="270" font-family="sans-serif" font-size="72" fill="white">ChandaWatch BD</text><text x="80" y="355" font-family="sans-serif" font-size="30" fill="white">Community journal / Independent review</text><text x="80" y="410" font-family="sans-serif" font-size="24" fill="white">Privacy first. Original evidence stays private.</text></svg>',
      ),
  );
  account.get("/status", (_, res) =>
    res.json({ emailDeliveryConfigured: mailConfigured() }),
  );
  account.post("/reset/request", async (req, res) => {
    const b = parse(z.object({ email: z.email().max(200) }).strict(), req.body),
      u = await Staff.findOne({
        email: b.email.toLowerCase(),
        accountStatus: "active",
      });
    if (u && mailConfigured()) {
      const token = randomToken();
      await AccountToken.deleteMany({ staffId: u._id, kind: "reset" });
      await AccountToken.create({
        staffId: u._id,
        kind: "reset",
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 30 * 60000),
      });
      await queueMail(
        u,
        "Password recovery",
        `Reset your ChandaWatch BD password within 30 minutes: ${config.origin}/staff/recovery#token=${token}\nIgnore this email if you did not request it.`,
      );
    }
    res.json({
      ok: true,
      message:
        "If the account exists and email delivery is configured, recovery instructions will be sent.",
    });
  });
  account.post("/reset/complete", async (req, res) => {
    const b = parse(
        z
          .object({
            token: z.string().min(30).max(100),
            password: z.string().min(14).max(200),
          })
          .strict(),
        req.body,
      ),
      t = await AccountToken.findOne({
        tokenHash: digest(b.token),
        kind: "reset",
        expiresAt: { $gt: new Date() },
      });
    if (!t) fail(400, "Recovery link is invalid or expired.");
    const u = await Staff.findOne({ _id: t.staffId, accountStatus: "active" });
    if (!u) fail(400, "Recovery link is invalid or expired.");
    const passwordHash = await hash(b.password),
      claimed = await AccountToken.findOneAndDelete({
        _id: t._id,
        expiresAt: { $gt: new Date() },
      });
    if (!claimed) fail(400, "Recovery link has already been used.");
    await Staff.updateOne(
      { _id: u._id },
      {
        $set: { passwordHash, failedLoginCount: 0 },
        $unset: { lockedUntil: 1 },
      },
    );
    await Session.deleteMany({ staffId: u._id });
    await AccountToken.deleteMany({ staffId: u._id, kind: "reset" });
    req.staff = u;
    await audit(req, "staff.password_reset", "staff", u._id);
    res.json({ ok: true });
  });
  account.post("/verify", async (req, res) => {
    const b = parse(
        z.object({ token: z.string().min(30).max(100) }).strict(),
        req.body,
      ),
      t = await AccountToken.findOneAndDelete({
        tokenHash: digest(b.token),
        kind: "verify",
        expiresAt: { $gt: new Date() },
      });
    if (!t) fail(400, "Verification link is invalid or expired.");
    await Staff.updateOne(
      { _id: t.staffId },
      { $set: { emailVerifiedAt: new Date() } },
    );
    await audit(req, "staff.email_verified", "staff", t.staffId);
    res.json({ ok: true });
  });
  staff.post("/account/verify/request", async (req, res) => {
    if (!mailConfigured()) fail(503, "Email delivery is not configured.");
    const token = randomToken();
    await AccountToken.deleteMany({ staffId: req.staff._id, kind: "verify" });
    await AccountToken.create({
      staffId: req.staff._id,
      kind: "verify",
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 86400000),
    });
    await queueMail(
      req.staff,
      "Email verification",
      `Verify your ChandaWatch BD email within 24 hours: ${config.origin}/staff/verify#token=${token}`,
    );
    res.json({ ok: true });
  });
  staff.get("/account", async (req, res) =>
    res.json({
      emailVerifiedAt: req.staff.emailVerifiedAt,
      available: req.staff.available,
      unavailableUntil: req.staff.unavailableUntil,
      deniedPermissions: req.staff.deniedPermissions || [],
      emailDeliveryConfigured: mailConfigured(),
      sessions: (
        await Session.find({
          staffId: req.staff._id,
          expiresAt: { $gt: new Date() },
          lastSeenAt: { $gte: new Date(Date.now() - 30 * 60000) },
        }).select("deviceLabel createdAt lastSeenAt expiresAt")
      ).map((s) => ({
        ...s.toObject(),
        current: String(s._id) === String(req.session._id),
      })),
      logins: await Audit.find({
        actorId: req.staff._id,
        action: { $in: ["staff.login", "staff.login_locked"] },
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .select("action outcome createdAt -_id"),
    }),
  );
  staff.delete("/sessions/:id", async (req, res) => {
    parse(oid, req.params.id);
    const s = await Session.findOneAndDelete({
      _id: req.params.id,
      staffId: req.staff._id,
    });
    if (!s) fail(404, "Session unavailable.");
    await audit(req, "staff.session_revoke", "session", s._id);
    res.json({ ok: true, current: String(s._id) === String(req.session._id) });
  });
  staff.post("/sessions/revoke-others", async (req, res) => {
    await Session.deleteMany({
      staffId: req.staff._id,
      _id: { $ne: req.session._id },
    });
    await audit(req, "staff.sessions_revoke", "staff", req.staff._id);
    res.json({ ok: true });
  });
  staff.patch("/availability", async (req, res) => {
    const b = parse(
      z
        .object({
          available: z.boolean(),
          unavailableUntil: z.iso.datetime().nullable().optional(),
        })
        .strict(),
      req.body,
    );
    await Staff.updateOne(
      { _id: req.staff._id },
      {
        $set: {
          available: b.available,
          unavailableUntil: b.unavailableUntil
            ? new Date(b.unavailableUntil)
            : null,
        },
      },
    );
    await audit(req, "staff.availability", "staff", req.staff._id);
    res.json({ ok: true });
  });
  staff.get("/notifications", async (req, res) =>
    res.json({
      items: await Notification.find({ staffId: req.staff._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      unread: await Notification.countDocuments({
        staffId: req.staff._id,
        readAt: null,
      }),
    }),
  );
  staff.post("/notifications/read", async (req, res) => {
    const b = parse(
      z.object({ ids: z.array(oid).max(100) }).strict(),
      req.body,
    );
    await Notification.updateMany(
      { _id: { $in: b.ids }, staffId: req.staff._id },
      { $set: { readAt: new Date() } },
    );
    res.json({ ok: true });
  });
  async function serializeMessages(reportId, channel) {
    return (
      await Message.find({ reportId, channel })
        .sort({ createdAt: 1 })
        .limit(200)
    ).map((m) => ({
      id: m._id,
      kind: m.kind,
      text: unseal(m.textEncrypted),
      createdAt: m.createdAt,
      author: m.authorId ? "staff" : "reporter",
      authorId: channel === "internal" ? m.authorId : undefined,
      mentions: channel === "internal" ? m.mentions : undefined,
      evidenceId: channel === "internal" ? m.evidenceId : undefined,
      seconds: m.seconds,
      state: m.state,
      resolution: m.resolutionEncrypted ? unseal(m.resolutionEncrypted) : "",
    }));
  }
  reporter.use(async (req, res, next) => {
    parse(oid, req.params.id);
    req.report = await reporterAccess(req);
    next();
  });
  reporter.get("/messages", async (req, res) =>
    res.json({ items: await serializeMessages(req.report._id, "reporter") }),
  );
  reporter.post("/messages", makeLimit(), async (req, res) => {
    const b = parse(
        z
          .object({
            kind: z.enum(["message", "correction", "supplement", "withdrawal"]),
            text,
          })
          .strict(),
        req.body,
      ),
      r = req.report;
    if (
      (await Message.countDocuments({
        reportId: r._id,
        channel: "reporter",
      })) >= 200
    )
      fail(409, "Message limit reached; contact the privacy review team.");
    const m = await Message.create({
      reportId: r._id,
      channel: "reporter",
      kind: b.kind,
      textEncrypted: seal(b.text),
    });
    if (b.kind !== "message")
      await Report.updateOne(
        { _id: r._id },
        {
          $set: {
            publicationApproved: false,
            reviewState: "needs_review",
            ...(r.publicEntry ? { "publicEntry.approved": false } : {}),
          },
        },
      );
    if (b.kind === "withdrawal")
      await Report.updateOne(
        { _id: r._id },
        { $set: { publicConsent: false } },
      );
    await notify(
      r.assignedTo,
      "reporter",
      "Reporter sent private information",
      r._id,
    );
    await notifyAdmins("reporter", "Reporter request needs review", r._id);
    await audit(req, "reporter.message", "report", r._id);
    res.status(201).json({ id: m._id });
  });
  staff.get("/reports/:id/workspace", async (req, res) => {
    const r = await getReport(req);
    await audit(req, "report.workspace_read", "report", r._id);
    const colleagues = await Staff.find({ accountStatus: "active" }).select(
      "name role available unavailableUntil",
    );
    res.json({
      report: {
        id: r._id,
        updatedAt: r.updatedAt,
        priority: r.priority,
        dueAt: r.dueAt,
        checklist: r.checklist || [],
      },
      messages: await serializeMessages(r._id, "reporter"),
      notes: await serializeMessages(r._id, "internal"),
      versions: (
        await DraftVersion.find({ reportId: r._id })
          .sort({ createdAt: -1 })
          .limit(30)
      ).map((v) => ({
        id: v._id,
        createdAt: v.createdAt,
        authorId: v.authorId,
        snapshot: unseal(v.snapshotEncrypted),
      })),
      assignments: await Assignment.find({ reportId: r._id })
        .sort({ createdAt: -1 })
        .limit(50),
      colleagues,
    });
  });
  staff.post(
    "/reports/:id/messages",
    permit("communicate"),
    async (req, res) => {
      const r = await getReport(req),
        b = parse(
          z
            .object({
              channel: z.enum(["reporter", "internal"]),
              text,
              mentions: z.array(oid).max(10).default([]),
              evidenceId: oid.optional(),
              seconds: z.number().min(0).max(86400).optional(),
            })
            .strict(),
          req.body,
        );
      if (
        b.channel === "reporter" &&
        (b.mentions.length || b.evidenceId || b.seconds !== undefined)
      )
        fail(400, "Internal metadata is not allowed in reporter replies.");
      if (
        b.evidenceId &&
        !(await Evidence.exists({
          _id: b.evidenceId,
          reportId: r._id,
          malwareScanStatus: "clean",
        }))
      )
        fail(400, "Choose clean evidence belonging to this report.");
      if (b.seconds !== undefined && !b.evidenceId)
        fail(400, "Timestamp notes require evidence.");
      for (const mention of b.mentions) {
        const u = await Staff.findById(mention);
        if (
          !u ||
          u.accountStatus !== "active" ||
          (u.role === "moderator" && String(r.assignedTo) !== String(u._id))
        )
          fail(400, "Mentioned staff must have access to this report.");
      }
      const m = await Message.create({
        reportId: r._id,
        authorId: req.staff._id,
        channel: b.channel,
        kind: "message",
        textEncrypted: seal(b.text),
        mentions: b.mentions,
        evidenceId: b.evidenceId,
        seconds: b.seconds,
      });
      for (const u of b.mentions)
        await notify(
          u,
          "mention",
          "You were mentioned in an internal note",
          r._id,
        );
      await audit(req, "staff.message", "report", r._id);
      res.status(201).json({ id: m._id });
    },
  );
  staff.patch(
    "/reports/:id/messages/:messageId",
    permit("communicate"),
    async (req, res) => {
      const r = await getReport(req);
      parse(oid, req.params.messageId);
      const b = parse(
        z
          .object({
            state: z.enum(["in_review", "completed", "denied"]),
            resolution: text,
          })
          .strict(),
        req.body,
      );
      const m = await Message.findOneAndUpdate(
        { _id: req.params.messageId, reportId: r._id, channel: "reporter" },
        { $set: { state: b.state, resolutionEncrypted: seal(b.resolution) } },
        { new: true },
      );
      if (!m) fail(404, "Request unavailable.");
      await audit(req, "reporter.request_resolve", "report", r._id);
      res.json({ ok: true });
    },
  );
  staff.patch("/reports/:id/workflow", permit("workflow"), async (req, res) => {
    const r = await getReport(req),
      b = parse(
        z
          .object({
            updatedAt: z.iso.datetime(),
            priority: z.enum(["normal", "high", "urgent"]),
            dueAt: z.iso.datetime().nullable(),
            checklist: z
              .array(
                z.enum([
                  "duplicates",
                  "sensitive_details",
                  "evidence",
                  "redaction",
                  "consent",
                  "independent_review",
                ]),
              )
              .max(6),
          })
          .strict(),
        req.body,
      );
    const changed = await Report.findOneAndUpdate(
      { _id: r._id, updatedAt: new Date(b.updatedAt) },
      {
        $set: {
          priority: b.priority,
          dueAt: b.dueAt ? new Date(b.dueAt) : null,
          checklist: [...new Set(b.checklist)],
        },
      },
      { new: true },
    );
    if (!changed) fail(409, "Report changed. Refresh before saving.");
    await audit(req, "report.workflow", "report", r._id);
    res.json({ ok: true, updatedAt: changed.updatedAt });
  });
  staff.post(
    "/reports/:id/draft-restore/:versionId",
    permit("draft"),
    async (req, res) => {
      const r = await getReport(req);
      parse(oid, req.params.versionId);
      const b = parse(
          z.object({ updatedAt: z.iso.datetime() }).strict(),
          req.body,
        ),
        v = await DraftVersion.findOne({
          _id: req.params.versionId,
          reportId: r._id,
        });
      if (!v) fail(404, "Draft version unavailable.");
      if (!r.publicConsent) fail(409, "Reporter consent is required.");
      const old = unseal(v.snapshotEncrypted),
        entry = {
          ...old,
          preparedBy: req.staff._id,
          approved: false,
          verificationLevel: "reviewed",
        };
      delete entry.publishedAt;
      delete entry.reviewedAt;
      delete entry.verificationNote;
      const changed = await Report.findOneAndUpdate(
        { _id: r._id, updatedAt: new Date(b.updatedAt) },
        {
          $set: {
            publicEntry: entry,
            publicationApproved: false,
            reviewState: "needs_review",
          },
        },
        { new: true },
      );
      if (!changed) fail(409, "Report changed. Refresh before restoring.");
      await DraftVersion.create({
        reportId: r._id,
        authorId: req.staff._id,
        snapshotEncrypted: seal(entry),
      });
      await audit(req, "report.draft_restore", "report", r._id);
      res.json({ ok: true });
    },
  );
  staff.get("/priority-queue", async (req, res) => {
    const q = parse(
        z
          .object({
            priority: z.enum(["normal", "high", "urgent"]).optional(),
            overdue: z.enum(["true", "false"]).optional(),
          })
          .strict(),
        req.query,
      ),
      filter = {
        ...(req.staff.role === "moderator"
          ? { assignedTo: req.staff._id }
          : {}),
        status: { $nin: ["resolved", "rejected"] },
        ...(q.priority ? { priority: q.priority } : {}),
        ...(q.overdue === "true" ? { dueAt: { $lt: new Date() } } : {}),
      };
    res.json({
      items: await Report.find(filter)
        .sort({ dueAt: 1, createdAt: 1 })
        .limit(100)
        .select("trackingId status priority dueAt assignedTo updatedAt")
        .lean(),
    });
  });
  staff.get("/workload", async (req, res) => {
    const filter =
        req.staff.role === "moderator"
          ? { _id: req.staff._id }
          : { accountStatus: "active" },
      users = await Staff.find(filter).select(
        "name role available unavailableUntil",
      );
    res.json({
      items: await Promise.all(
        users.map(async (u) => ({
          ...u.toObject(),
          pending: await Report.countDocuments({
            assignedTo: u._id,
            status: { $nin: ["resolved", "rejected"] },
          }),
          overdue: await Report.countDocuments({
            assignedTo: u._id,
            dueAt: { $lt: new Date() },
            status: { $nin: ["resolved", "rejected"] },
          }),
        })),
      ),
    });
  });
  async function targetStaff(staffId) {
    const u = await Staff.findOne({ _id: staffId, accountStatus: "active" });
    if (
      !u ||
      (!u.available && (!u.unavailableUntil || u.unavailableUntil > new Date()))
    )
      fail(400, "Choose an available active staff member.");
    return u;
  }
  admin.post("/bulk-assign", async (req, res) => {
    const b = parse(
        z.object({ ids: z.array(oid).min(1).max(50), staffId: oid }).strict(),
        req.body,
      ),
      u = await targetStaff(b.staffId),
      rows = await Report.find({ _id: { $in: b.ids } });
    if (rows.length !== new Set(b.ids).size)
      fail(404, "One or more reports are unavailable.");
    for (const r of rows) {
      const changed = await Report.findOneAndUpdate(
        { _id: r._id, updatedAt: r.updatedAt },
        { $set: { assignedTo: u._id } },
      );
      if (!changed) fail(409, "Assignment conflict; refresh queue.");
      await Assignment.create({
        reportId: r._id,
        fromId: r.assignedTo,
        toId: u._id,
        actorId: req.staff._id,
      });
      await notify(u._id, "assignment", "A report was assigned to you", r._id);
      await audit(req, "report.assign", "report", r._id);
    }
    res.json({ ok: true, count: rows.length });
  });
  admin.post("/bulk-status", async (req, res) => {
    const b = parse(
        z
          .object({
            ids: z.array(oid).min(1).max(50),
            status: z.enum(Object.keys(transitions)),
            message: z.string().trim().min(3).max(500),
          })
          .strict(),
        req.body,
      ),
      rows = await Report.find({ _id: { $in: b.ids } });
    if (rows.length !== new Set(b.ids).size)
      fail(404, "One or more reports are unavailable.");
    if (rows.some((r) => !transitions[r.status].includes(b.status)))
      fail(409, "One or more reports cannot make this transition.");
    for (const r of rows) {
      const changed = await Report.findOneAndUpdate(
        { _id: r._id, status: r.status, updatedAt: r.updatedAt },
        {
          $set: {
            status: b.status,
            lastModerator: req.staff._id,
            publicationApproved: false,
            reviewState:
              b.status === "reviewed" ? "awaiting_senior_review" : "in_review",
            ...(r.publicEntry ? { "publicEntry.approved": false } : {}),
          },
        },
      );
      if (!changed) fail(409, "Status conflict; refresh queue.");
      await History.create({
        reportId: r._id,
        status: b.status,
        message: b.message,
        actorId: req.staff._id,
      });
      await audit(req, "report.status", "report", r._id);
    }
    res.json({ ok: true, count: rows.length });
  });
  admin.patch("/users/:id/access", async (req, res) => {
    parse(oid, req.params.id);
    if (req.params.id === String(req.staff._id))
      fail(
        400,
        "Use account settings for your availability; self-permission changes are blocked.",
      );
    const b = parse(
        z
          .object({
            deniedPermissions: z
              .array(z.enum(permissionNames))
              .max(permissionNames.length),
            available: z.boolean(),
            reason: z.string().trim().min(10).max(500),
          })
          .strict(),
        req.body,
      ),
      u = await Staff.findById(req.params.id);
    if (!u) fail(404, "Staff unavailable.");
    if (u.role === "super_admin" && b.deniedPermissions.length)
      fail(400, "Admin permissions cannot be restricted here.");
    await Staff.updateOne(
      { _id: u._id },
      {
        $set: {
          deniedPermissions: [...new Set(b.deniedPermissions)],
          available: b.available,
          suspensionReasonEncrypted: seal(b.reason),
        },
      },
    );
    await Session.deleteMany({ staffId: u._id });
    await audit(req, "staff.access", "staff", u._id);
    res.json({ ok: true });
  });
  const contentBody = z
    .object({
      slug: z.string().regex(/^[a-z][a-z0-9_-]{2,60}$/),
      kind: z.enum([
        "faq",
        "article",
        "resource",
        "announcement",
        "category",
        "section",
        "news",
      ]),
      title: z.string().trim().min(3).max(150),
      titleBn: z.string().max(150).default(""),
      body: z.string().trim().min(3).max(10000),
      bodyBn: z.string().max(10000).default(""),
      url: z.string().max(1000).default(""),
      page,
      rank: z.number().int().min(0).max(1000),
      enabled: z.boolean(),
      featured: z.boolean().default(false),
      newsCategory: z.enum(newsCategories).default("important"),
      district: z
        .string()
        .max(60)
        .regex(/^[a-z0-9-]*$/)
        .default(""),
      coverMediaId: oid.nullable().default(null),
      videoMediaId: oid.nullable().default(null),
      state: z.enum(["draft", "published"]),
      publishAt: z.iso.datetime().nullable(),
      revision: z.number().int().min(0),
    })
    .strict();
  admin.get("/content", async (_, res) =>
    res.json({
      items: await Content.find().sort({ kind: 1, rank: 1 }).limit(500).lean(),
    }),
  );
  admin.put("/content/:slug", async (req, res) => {
    const b = parse(contentBody, req.body);
    if (b.district && !districts.some((d) => d.code === b.district))
      fail(400, "Invalid district.");
    for (const [field, prefix] of [
      ["coverMediaId", "image/"],
      ["videoMediaId", "video/"],
    ]) {
      if (b[field]) {
        const media = await NewsMedia.findById(b[field]);
        if (b.kind !== "news" || !media || !media.mimeType.startsWith(prefix))
          fail(400, "Invalid news media selection.");
      }
    }
    if (b.slug !== req.params.slug) fail(400, "Slug mismatch.");
    if (
      b.kind === "news" &&
      b.state === "published" &&
      (b.titleBn.trim().length < 3 ||
        b.bodyBn.trim().length < 3 ||
        !/[\u0980-\u09ff]/.test(b.titleBn) ||
        !/[\u0980-\u09ff]/.test(b.bodyBn) ||
        !/[A-Za-z]/.test(b.title) ||
        !/[A-Za-z]/.test(b.body))
    )
      fail(
        400,
        "Published news requires both Bengali and English title and information.",
      );
    if (b.url && !/^https:\/\//i.test(b.url))
      fail(400, "Resource URLs must use HTTPS.");
    if (
      b.state === "published" &&
      identifying.test([b.title, b.titleBn, b.body, b.bodyBn].join(" "))
    )
      fail(
        400,
        "Remove identifying/contact/URL patterns from published text; use the resource URL field for official links.",
      );
    const current = await Content.findOne({ slug: b.slug });
    const { revision, ...data } = b;
    let saved;
    if (current) {
      if (current.state === "trash")
        fail(409, "Restore this content from trash first.");
      saved = await Content.findOneAndUpdate(
        { _id: current._id, revision },
        { $set: data, $inc: { revision: 1 } },
        { new: true },
      );
      if (!saved) fail(409, "Content changed. Reload before saving.");
    } else {
      if (revision !== 0) fail(409, "New content requires revision zero.");
      saved = await Content.create({ ...data, revision: 1 });
    }
    await ContentVersion.create({
      contentId: saved._id,
      actorId: req.staff._id,
      snapshot: saved.toObject(),
    });
    await audit(req, "content.save", "content", saved._id);
    res.json({ item: saved });
  });
  admin.delete("/content/:id", async (req, res) => {
    parse(oid, req.params.id);
    const b = parse(
        z.object({ revision: z.number().int().min(1) }).strict(),
        req.body,
      ),
      c = await Content.findOneAndUpdate(
        { _id: req.params.id, revision: b.revision, state: { $ne: "trash" } },
        {
          $set: { state: "trash", deletedAt: new Date() },
          $inc: { revision: 1 },
        },
        { new: true },
      );
    if (!c) fail(409, "Content changed or unavailable.");
    await audit(req, "content.trash", "content", c._id);
    res.json({ ok: true });
  });
  admin.delete("/content/:id/permanent", async (req, res) => {
    parse(oid, req.params.id);
    const b = parse(
      z
        .object({ slug: z.string(), revision: z.number().int().min(1) })
        .strict(),
      req.body,
    );
    const item = await Content.findOneAndDelete({
      _id: req.params.id,
      slug: b.slug,
      revision: b.revision,
      state: "trash",
    });
    if (!item) fail(409, "Content changed or unavailable.");
    await ContentVersion.deleteMany({ contentId: item._id });
    await audit(req, "content.permanent_delete", "content", item._id);
    res.json({ ok: true });
  });
  admin.get("/work-queue", async (_, res) => {
    const [submitted, review, newsDrafts, scheduled] = await Promise.all([
      Report.countDocuments({ status: "submitted" }),
      Report.countDocuments({
        status: { $in: ["screening", "under_review", "needs_information"] },
      }),
      Content.countDocuments({ kind: "news", state: "draft" }),
      Content.countDocuments({
        kind: "news",
        state: "published",
        enabled: true,
        publishAt: { $gt: new Date() },
      }),
    ]);
    res.json({ submitted, review, newsDrafts, scheduled });
  });
  admin.post("/content/:id/restore", async (req, res) => {
    parse(oid, req.params.id);
    const c = await Content.findOneAndUpdate(
      {
        _id: req.params.id,
        state: "trash",
        deletedAt: { $gt: new Date(Date.now() - 30 * 86400000) },
      },
      { $set: { state: "draft", deletedAt: null }, $inc: { revision: 1 } },
      { new: true },
    );
    if (!c) fail(404, "Recoverable content unavailable.");
    await audit(req, "content.restore", "content", c._id);
    res.json({ ok: true });
  });
  admin.get("/content/:id/versions", async (req, res) => {
    parse(oid, req.params.id);
    res.json({
      items: await ContentVersion.find({ contentId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(50),
    });
  });
  admin.post("/content/:id/versions/:versionId/restore", async (req, res) => {
    parse(oid, req.params.id);
    parse(oid, req.params.versionId);
    const b = parse(
        z.object({ revision: z.number().int().min(1) }).strict(),
        req.body,
      ),
      v = await ContentVersion.findOne({
        _id: req.params.versionId,
        contentId: req.params.id,
      });
    if (!v) fail(404, "Version unavailable.");
    const {
      slug,
      kind,
      title,
      titleBn,
      body,
      bodyBn,
      url,
      page,
      rank,
      enabled,
      featured,
      newsCategory,
      district,
      coverMediaId,
      videoMediaId,
    } = v.snapshot;
    const c = await Content.findOneAndUpdate(
      { _id: req.params.id, revision: b.revision },
      {
        $set: {
          slug,
          kind,
          title,
          titleBn,
          body,
          bodyBn,
          url,
          page,
          rank,
          enabled,
          featured: featured === true,
          newsCategory: newsCategory || "important",
          district: district || "",
          coverMediaId: coverMediaId || null,
          videoMediaId: videoMediaId || null,
          state: "draft",
          publishAt: null,
          deletedAt: null,
        },
        $inc: { revision: 1 },
      },
      { new: true },
    );
    if (!c) fail(409, "Content changed.");
    await ContentVersion.create({
      contentId: c._id,
      actorId: req.staff._id,
      snapshot: c.toObject(),
    });
    await audit(req, "content.version_restore", "content", c._id);
    res.json({ item: c });
  });
  admin.get("/feedback", async (req, res) => {
    await audit(req, "feedback.read", "publicFeedback", "queue");
    res.json({
      items: (
        await PublicFeedback.find().sort({ createdAt: -1 }).limit(100)
      ).map((f) => ({
        id: f._id,
        publicId: f.publicId,
        reportId: f.reportId,
        kind: f.kind,
        state: f.state,
        dueAt: f.dueAt,
        createdAt: f.createdAt,
        description: unseal(f.textEncrypted),
        resolution: f.resolutionEncrypted ? unseal(f.resolutionEncrypted) : "",
      })),
    });
  });
  admin.patch("/feedback/:id", async (req, res) => {
    parse(oid, req.params.id);
    const b = parse(
        z
          .object({
            state: z.enum(["in_review", "completed", "denied"]),
            resolution: text,
            hidePublic: z.boolean().default(false),
          })
          .strict(),
        req.body,
      ),
      f = await PublicFeedback.findById(req.params.id);
    if (!f) fail(404, "Feedback unavailable.");
    if (b.hidePublic)
      await Report.updateOne(
        { _id: f.reportId },
        {
          $set: {
            publicationApproved: false,
            "publicEntry.approved": false,
            reviewState: "needs_review",
          },
        },
      );
    f.state = b.state;
    f.resolutionEncrypted = seal(b.resolution);
    await f.save();
    await audit(req, "feedback.resolve", "publicFeedback", f._id);
    res.json({ ok: true });
  });
  admin.get("/settings", async (_, res) =>
    res.json({
      settings: await savedSettings(),
      emailDeliveryConfigured: mailConfigured(),
      backupConfigured: /^[a-f\d]{64}$/i.test(
        process.env.BACKUP_ENCRYPTION_KEY || "",
      ),
      production: config.production,
      launchApproved: config.launchApproved,
      reportingConfigured: config.reporting,
      scanner: config.scanner,
      scannerHealth:
        config.scanner === "clamav"
          ? await scannerHealth()
          : { ok: false, reason: "quarantine_mode" },
    }),
  );
  admin.put("/settings", async (req, res) => {
    const b = parse(
      z
        .object({
          intakeEnabled: z.boolean(),
          backupEnabled: z.boolean(),
          retentionEnabled: z.boolean(),
          privacyDeadlineDays: z.number().int().min(1).max(90),
        })
        .strict(),
      req.body,
    );
    if (b.backupEnabled && !process.env.BACKUP_ENCRYPTION_KEY)
      fail(409, "Configure the backup key before enabling schedules.");
    for (const [key, value] of Object.entries(b))
      await Setting.findOneAndUpdate(
        { key },
        { $set: { value } },
        { upsert: true },
      );
    await audit(req, "system.settings", "settings", "operational");
    res.json({ ok: true });
  });
  admin.get("/operations", async (req, res) => {
    const evidence = await Evidence.aggregate([
        {
          $group: {
            _id: "$malwareScanStatus",
            count: { $sum: 1 },
            bytes: { $sum: "$fileSize" },
          },
        },
      ]),
      jobs = await Job.find()
        .sort({ createdAt: -1 })
        .limit(30)
        .select("kind state startedAt finishedAt code count");
    let diskBytes = 0;
    for (const file of await fs.readdir(config.storage).catch(() => [])) {
      if (/^[\w-]+$/.test(file)) {
        const stat = await fs.stat(path.join(config.storage, file));
        if (stat.isFile()) diskBytes += stat.size;
      }
    }
    const settings = await savedSettings(),
      deadline = Number(settings.privacyDeadlineDays || 7);
    res.json({
      evidence,
      diskBytes,
      scanner: config.scanner,
      scannerHealth:
        config.scanner === "clamav"
          ? await scannerHealth()
          : { ok: false, reason: "quarantine_mode" },
      scannerHostConfigured: Boolean(process.env.CLAMAV_HOST),
      jobs,
      errors: await AppError.find().sort({ lastAt: -1 }).limit(50),
      scanQueue: await Evidence.find({ malwareScanStatus: { $ne: "clean" } })
        .sort({ createdAt: 1 })
        .limit(100)
        .select("reportId mimeType fileSize malwareScanStatus createdAt"),
      retention: await Report.find({
        expiresAt: { $lt: new Date(Date.now() + 30 * 86400000) },
      })
        .sort({ expiresAt: 1 })
        .limit(100)
        .select("trackingId expiresAt status"),
      privacy: (
        await Privacy.find({ state: { $in: ["pending", "in_review"] } }).select(
          "reference state createdAt",
        )
      ).map((p) => ({
        ...p.toObject(),
        dueAt: new Date(p.createdAt.getTime() + deadline * 86400000),
      })),
      feedbackOverdue: await PublicFeedback.countDocuments({
        state: { $in: ["pending", "in_review"] },
        dueAt: { $lt: new Date() },
      }),
      mail: {
        configured: mailConfigured(),
        queued: await Mail.countDocuments({
          state: { $in: ["queued", "sending"] },
        }),
        failed: await Mail.countDocuments({ state: "failed" }),
      },
      backupConfigured: /^[a-f\d]{64}$/i.test(
        process.env.BACKUP_ENCRYPTION_KEY || "",
      ),
    });
  });
  admin.post("/operations/:kind", async (req, res) => {
    const kind = parse(z.enum(["backup", "retention"]), req.params.kind);
    await audit(req, "operation.request", "job", kind);
    res.json(await runJob(kind));
  });
  app.post("/api/v1/features/public/errors", makeLimit(), async (req, res) => {
    const b = parse(
      z
        .object({
          code: z.enum(["render_error", "network_error"]),
          page: z.enum(["public", "staff"]),
        })
        .strict(),
      req.body,
    );
    await recordSafeError(`client:${b.page}:${b.code}`);
    res.json({ ok: true });
  });
  staff.get("/export", permit("export"), async (req, res) => {
    const q = parse(
        z
          .object({
            format: z.enum(["csv", "pdf"]),
            status: z.enum(Object.keys(transitions)).optional(),
          })
          .strict(),
        req.query,
      ),
      rows = await Report.find({
        ...(req.staff.role === "moderator"
          ? { assignedTo: req.staff._id }
          : {}),
        ...(q.status ? { status: q.status } : {}),
      })
        .sort({ createdAt: -1 })
        .limit(500)
        .select("incidentType districtCode status priority createdAt")
        .lean();
    await audit(req, "report.export", "export", q.format);
    const data = rows.map((r) => [
        r.incidentType,
        r.districtCode,
        r.status,
        r.priority || "normal",
        r.createdAt.toISOString().slice(0, 7),
      ]),
      head = ["Type", "District", "Status", "Priority", "Submitted month"];
    if (q.format === "csv") {
      const quote = (v) =>
        '"' +
        String(v)
          .replace(/^[=+\-@]/, "'")
          .replaceAll('"', '""') +
        '"';
      res
        .type("csv")
        .attachment("chandawatch-safe-export.csv")
        .send([head, ...data].map((r) => r.map(quote).join(",")).join("\r\n"));
    } else {
      res.type("pdf").attachment("chandawatch-safe-export.pdf");
      const doc = new PDFDocument({ size: "A4", margin: 45 });
      doc.pipe(res);
      doc.fontSize(18).text("ChandaWatch BD - Safe operational export");
      doc
        .fontSize(9)
        .text(
          "No narratives, contact, tracking IDs, evidence or precise dates. Maximum 500 rows. Internal report counts are not crime rates.",
        )
        .moveDown();
      doc.fontSize(9).text(head.join(" | "));
      for (const row of data) doc.text(row.join(" | "));
      doc.end();
    }
  });
  staff.get("/evidence/:id/preview", async (req, res) => {
    parse(oid, req.params.id);
    const e = await Evidence.findById(req.params.id);
    if (!e) fail(404, "Evidence unavailable.");
    req.params.id = String(e.reportId);
    await getReport(req);
    if (e.malwareScanStatus !== "clean")
      fail(409, "Evidence requires a clean malware scan.");
    await audit(req, "evidence.preview", "evidence", e._id);
    res.set({
      "Content-Type": e.mimeType,
      "Content-Disposition": 'inline; filename="private-evidence"',
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(e.fileSize),
    });
    await pipeline(
      await openEvidence(
        path.join(config.storage, unseal(e.encryptedStorageKey)),
      ),
      res,
    );
  });
  function installUploads(router, prefix, isAdmin) {
    const load = async (req, res, next) => {
      parse(oid, req.params.id);
      req.report = isAdmin ? await Report.findById(req.params.id) : req.report;
      if (!req.report) fail(404, "Report unavailable.");
      next();
    };
    async function owned(req) {
      parse(oid, req.params.uploadId);
      const u = await Upload.findOne({
        _id: req.params.uploadId,
        reportId: req.report._id,
        expiresAt: { $gt: new Date() },
        ...(isAdmin ? { staffId: req.staff._id } : { staffId: null }),
      });
      if (!u) fail(404, "Upload unavailable or expired.");
      return u;
    }
    router.get(prefix + "/uploads", load, async (req, res) => {
      const items = await Upload.find({
        reportId: req.report._id,
        expiresAt: { $gt: new Date() },
        state: { $ne: "complete" },
        ...(isAdmin ? { staffId: req.staff._id } : { staffId: null }),
      })
        .select("_id size received chunkCount state expiresAt")
        .lean();
      res.json({ items });
    });
    router.post(prefix + "/uploads", load, async (req, res) => {
      const b = parse(
        z
          .object({
            fingerprint: z.string().regex(/^[a-f\d]{64}$/),
            size: z
              .number()
              .int()
              .min(1)
              .max(200 * 1024 * 1024),
          })
          .strict(),
        req.body,
      );
      let u = await Upload.findOne({
        reportId: req.report._id,
        fingerprint: b.fingerprint,
        size: b.size,
        expiresAt: { $gt: new Date() },
        state: { $in: ["uploading", "complete"] },
        ...(isAdmin ? { staffId: req.staff._id } : { staffId: null }),
      });
      if (!u) {
        if (
          (await Upload.countDocuments({
            reportId: req.report._id,
            state: { $ne: "complete" },
            expiresAt: { $gt: new Date() },
          })) >= 5
        )
          fail(409, "Five active uploads already exist; resume or cancel one.");
        u = await Upload.create({
          reportId: req.report._id,
          staffId: isAdmin ? req.staff._id : undefined,
          ...b,
          chunkSize,
          chunkCount: Math.ceil(b.size / chunkSize),
          received: [],
          expiresAt: new Date(Date.now() + 86400000),
        });
        await fs.mkdir(chunkDirectory(u._id), { recursive: true });
      }
      res.json({
        id: u._id,
        chunkSize,
        received: u.received,
        state: u.state,
        result: u.result,
      });
    });
    router.get(prefix + "/uploads/:uploadId", load, async (req, res) => {
      const u = await owned(req);
      res.json({
        id: u._id,
        received: u.received,
        state: u.state,
        result: u.result,
        chunkSize: u.chunkSize,
      });
    });
    router.put(
      prefix + "/uploads/:uploadId/chunks/:index",
      load,
      uploadCapacity,
      express.raw({ type: "application/octet-stream", limit: chunkSize }),
      async (req, res) => {
        const u = await owned(req),
          index = parse(
            z.coerce
              .number()
              .int()
              .min(0)
              .max(u.chunkCount - 1),
            req.params.index,
          );
        if (u.state !== "uploading")
          fail(409, "Upload is not accepting chunks.");
        const expected =
          index === u.chunkCount - 1 ? u.size - index * chunkSize : chunkSize;
        if (!Buffer.isBuffer(req.body) || req.body.length !== expected)
          fail(400, "Chunk size mismatch.");
        const dir = chunkDirectory(u._id),
          target = path.join(dir, String(index)),
          temp = path.join(dir, `${index}-${randomToken(8)}.tmp`);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(temp, seal(req.body), { mode: 0o600, flag: "wx" });
        try {
          await fs.link(temp, target);
        } catch (e) {
          if (e.code !== "EEXIST") throw e;
          if (
            digest(unseal(await fs.readFile(target, "utf8"), true)) !==
            digest(req.body)
          )
            fail(
              409,
              "A different chunk was already uploaded; cancel and reselect the original file.",
            );
        } finally {
          await fs.unlink(temp).catch(() => {});
        }
        const changed = await Upload.updateOne(
          { _id: u._id, state: "uploading" },
          { $addToSet: { received: index } },
        );
        if (!changed.matchedCount) fail(409, "Upload state changed.");
        res.json({ ok: true, index });
      },
    );
    router.post(
      prefix + "/uploads/:uploadId/complete",
      load,
      uploadCapacity,
      async (req, res) => {
        let u = await owned(req);
        if (u.state === "complete") return res.json(u.result);
        if (u.received.length !== u.chunkCount)
          fail(409, "Upload is incomplete.");
        u = await Upload.findOneAndUpdate(
          { _id: u._id, state: "uploading" },
          { $set: { state: "assembling" } },
          { new: true },
        );
        if (!u) fail(409, "Upload is already being processed.");
        try {
          const stream = Readable.from(
            (async function* () {
              for (let i = 0; i < u.chunkCount; i++)
                yield unseal(
                  await fs.readFile(
                    path.join(chunkDirectory(u._id), String(i)),
                    "utf8",
                  ),
                  true,
                );
            })(),
          );
          const file = await new Promise((resolve, reject) =>
            evidenceStorage._handleFile(req, { stream }, (e, f) =>
              e ? reject(e) : resolve(f),
            ),
          );
          req.file = file;
          if (file.size !== u.size || file.contentHash !== u.fingerprint) {
            await fs.unlink(file.path).catch(() => {});
            fail(
              400,
              "File identity did not match; cancel this upload and choose the original file.",
            );
          }
          let result,
            status = 201;
          const capture = {
            status(n) {
              status = n;
              return this;
            },
            json(v) {
              result = v;
              return this;
            },
          };
          await finishEvidenceUpload(req, capture);
          await Upload.updateOne(
            { _id: u._id },
            { $set: { state: "complete", result } },
          );
          await cleanupUpload(u._id);
          res.status(status).json(result);
        } catch (e) {
          await Upload.updateOne(
            { _id: u._id },
            { $set: { state: "uploading" } },
          );
          throw e;
        }
      },
    );
    router.delete(prefix + "/uploads/:uploadId", load, async (req, res) => {
      const u = await owned(req);
      if (u.state === "assembling") fail(409, "Upload is being processed.");
      await cleanupUpload(u._id);
      await Upload.deleteOne({ _id: u._id });
      res.json({ ok: true });
    });
  }
  installUploads(reporter, "", false);
  installUploads(admin, "/reports/:id", true);
}
