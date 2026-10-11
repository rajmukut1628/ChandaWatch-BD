import mongoose from "mongoose";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { z } from "zod";

import { fileTypeFromBuffer } from "file-type";
import fs from "node:fs/promises";
import path from "node:path";
import { config, root } from "./config.js";
import {
  seal,
  unseal,
  hash,
  verify,
  randomToken,
  digest,
  mac,
  safeEqual,
} from "./crypto.js";
import {
  Report,
  Evidence,
  Staff,
  Session,
  Review,
  History,
  Privacy,
  Audit,
  PageInfo,
} from "./models.js";
import { districts, types } from "./districts.js";
import { scan } from "./scanner.js";
import { evidenceStorage, openEvidence } from "./evidence-storage.js";
import { pipeline } from "node:stream/promises";
import { upazilas, validUpazila, unions, validUnion } from "./geography.js";
import { installPublicCases } from "./public-cases.js";
import { installFeatures } from "./features.js";
import { installOwnership, protectOwner } from "./ownership.js";
import {
  DraftVersion,
  Assignment,
  KnownDevice,
  AccountToken,
  Mail,
  Notification,
} from "./feature-models.js";
import {
  onAuditEvent,
  intakeAllowed,
  hasPermission,
  notify,
  removeReportExtras,
  recordSafeError,
  queueMail,
} from "./feature-services.js";
export const app = express();
app.disable("x-powered-by");
if (config.production) app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.tile.openstreetmap.org",
        ],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", "blob:"],
        frameSrc: ["'self'", "blob:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(express.json({ limit: "128kb" }), cookieParser());
app.use("/api", (_, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
export const apiRateLimiter = rateLimit({
  windowMs: 60000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.use("/api", apiRateLimiter);
const writeLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const loginLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const fail = (code, message) => {
  const e = Error(message);
  e.status = code;
  throw e;
};
const parse = (schema, data) => {
  const r = schema.safeParse(data);
  if (!r.success)
    fail(
      400,
      r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
    );
  return r.data;
};
const id = z.string().regex(/^[a-f\d]{24}$/i);
const credentials = z
  .object({
    trackingId: z.string().min(10).max(80),
    secret: z.string().min(20).max(100),
  })
  .strict();
const roles = ["moderator", "senior_reviewer", "super_admin"];
async function audit(
  req,
  action,
  resourceType,
  resourceId,
  outcome = "success",
) {
  const record = {
    actorId: req.staff?._id,
    action,
    resourceType,
    resourceId: String(resourceId || ""),
    outcome,
  };
  await Audit.create({ ...record, integrityMac: mac(JSON.stringify(record)) });
  await onAuditEvent(req, record);
}
async function staffAuth(req, res, next) {
  const token = req.cookies.cw_session;
  if (!token) fail(401, "Please sign in.");
  const s = await Session.findOne({
    tokenHash: digest(token),
    expiresAt: { $gt: new Date() },
  });
  if (!s) fail(401, "Session expired.");
  if (
    Date.now() - new Date(s.lastSeenAt || s.createdAt).getTime() >
    30 * 60000
  ) {
    await Session.deleteOne({ _id: s._id });
    fail(401, "Session expired after inactivity.");
  }
  const user = await Staff.findById(s.staffId);
  if (!user || user.accountStatus !== "active")
    fail(401, "Account unavailable.");
  req.staff = user;
  req.session = s;
  if (Date.now() - new Date(s.lastSeenAt || s.createdAt).getTime() > 60000)
    await Session.updateOne(
      { _id: s._id },
      { $set: { lastSeenAt: new Date() } },
    );
  next();
}
function allow(...r) {
  return (req, res, next) => {
    if (!r.includes(req.staff.role)) fail(403, "Permission denied.");
    next();
  };
}
function originGuard(req, res, next) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin && origin !== config.origin)
      fail(403, "Invalid request origin.");
    if (req.get("sec-fetch-site") === "cross-site")
      fail(403, "Cross-site request rejected.");
  }
  next();
}
function csrf(req, res, next) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !safeEqual(digest(req.get("x-csrf-token") || ""), req.session.csrfHash)
  )
    fail(403, "Invalid CSRF token.");
  next();
}
app.use("/api", originGuard);
const canAccess = (user, r) =>
  user.role !== "moderator" || String(r.assignedTo) === String(user._id);
async function getReport(req) {
  parse(id, req.params.id);
  const r = await Report.findById(req.params.id);
  if (!r) fail(404, "Report not found.");
  if (!canAccess(req.staff, r))
    fail(403, "This report is not assigned to you.");
  return r;
}
async function reporterAccess(req) {
  const c = parse(credentials, {
    trackingId: req.body?.trackingId || req.get("x-tracking-id"),
    secret: req.body?.secret || req.get("x-tracking-secret"),
  });
  const r = await Report.findOne({ trackingId: c.trackingId });
  if (!r || !(await verify(r.trackingSecretHash, c.secret)))
    fail(404, "Tracking credentials could not be verified.");
  if (req.params.id && String(r._id) !== req.params.id)
    fail(404, "Report not found.");
  return r;
}
const publicStatus = async (r) => ({
  id: r._id,
  trackingId: r.trackingId,
  status: r.status,
  publicConsent: r.publicConsent,
  publicId: r.publicEntry?.approved ? r.publicEntry.publicId : null,
  createdAt: r.createdAt,
  history: await History.find({ reportId: r._id })
    .sort({ createdAt: 1 })
    .select("status message createdAt -_id"),
  evidence: await Evidence.find({ reportId: r._id }).select(
    "_id mimeType fileSize malwareScanStatus createdAt",
  ),
});
app.get("/api/v1/health", (_, res) =>
  res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
    ok: mongoose.connection.readyState === 1,
    mode: config.production ? "production" : "controlled-development",
    reportingEnabled: config.reporting,
    minCount: config.minCount,
    retentionDays: config.retention,
  }),
);
app.get("/api/v1/public/districts", (_, res) => res.json({ districts }));
app.get("/api/v1/public/upazilas", (req, res) => {
  const district = req.query.district;
  if (district && typeof district !== "string")
    return res.status(400).json({ error: "Invalid district." });
  res.json({
    upazilas: district
      ? upazilas.filter((u) => u.districtCode === district)
      : upazilas,
  });
});
app.get("/api/v1/public/unions", (req, res) => {
  const q = parse(
    z
      .object({
        district: z.string().optional(),
        upazila: z.string().optional(),
      })
      .strict(),
    req.query,
  );
  if (
    (q.district && !districts.some((d) => d.code === q.district)) ||
    (q.upazila &&
      !upazilas.some(
        (u) =>
          u.code === q.upazila &&
          (!q.district || u.districtCode === q.district),
      ))
  )
    fail(400, "Choose valid district and upazila.");
  res.json({
    unions: unions.filter(
      (u) =>
        (!q.district || u.districtCode === q.district) &&
        (!q.upazila || u.upazilaCode === q.upazila),
    ),
  });
});
installPublicCases(app);
app.get("/api/v1/public/page-info/:slug", async (req, res) => {
  const slug = parse(
    z.enum(["home", "awareness", "safety", "privacy"]),
    req.params.slug,
  );
  const item = await PageInfo.findOne({ slug, published: true })
    .select("slug title titleBn body bodyBn -_id")
    .lean();
  res.json({ item });
});
const reportSchema = z
  .object({
    incidentType: z.string().regex(/^[a-z][a-z0-9_-]{2,60}$/),
    district: z
      .string()
      .refine(
        (s) => districts.some((d) => d.code === s),
        "Choose a valid district",
      ),
    upazila: z.string().max(100).optional(),
    union: z.string().max(150).optional(),
    publicConsent: z.boolean().default(false),
    area: z.string().trim().min(2).max(150),
    incidentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (s) =>
          !isNaN(Date.parse(s)) &&
          new Date(s).toISOString().slice(0, 10) === s &&
          s <= new Date().toISOString().slice(0, 10),
        "Use a valid date, not in the future",
      ),
    description: z.string().trim().min(30).max(6000),
    demandedAmount: z.number().min(0).max(1e10).optional(),
    currency: z.literal("BDT").default("BDT"),
    contactRequested: z.boolean().default(false),
    contact: z.string().trim().max(200).optional(),
    privacyAcknowledged: z.literal(true),
    website: z.string().max(0).optional(),
  })
  .strict();
async function createReport(req, res) {
  if (!req.staff && !(await intakeAllowed()))
    fail(503, "Report intake is currently paused.");
  const b = parse(reportSchema, req.body);
  const { validIncidentType } = await import("./feature-services.js");
  if (!(await validIncidentType(b.incidentType)))
    fail(400, "Choose an enabled incident category.");
  const { Content } = await import("./feature-models.js");
  if (
    await Content.exists({
      kind: "category",
      slug: b.incidentType,
      state: "published",
      enabled: false,
      $or: [{ publishAt: { $lte: new Date() } }, { publishAt: null }],
    })
  )
    fail(400, "This incident category is currently disabled for new reports.");
  if (!validUpazila(b.district, b.upazila))
    fail(400, "Upazila must belong to the selected district.");
  if (!validUnion(b.district, b.upazila, b.union))
    fail(400, "Union must belong to the selected district and upazila.");
  if (b.contactRequested && !b.contact)
    fail(400, "Contact information is required when requesting contact.");
  const trackingId = "CW-" + randomToken(15),
    secret = randomToken();
  const fingerprint = mac(
    `${b.district}|${b.incidentDate}|${b.description.toLowerCase().replace(/\s+/g, " ")}`,
  );
  const duplicate = await Report.exists({ fingerprint });
  const flags = [];
  if (duplicate) flags.push("possible_duplicate");
  if (/(?:[0-9০-৯][\s-]?){10,17}|[\w.+-]+@[\w.-]+\.[a-z]+/i.test(b.description))
    flags.push("possible_personal_data");
  const r = await Report.create({
    trackingId,
    trackingSecretHash: await hash(secret),
    incidentType: b.incidentType,
    districtCode: b.district,
    upazilaCode: b.upazila || undefined,
    unionCode: b.union || undefined,
    publicConsent: b.publicConsent,
    incidentDate: new Date(b.incidentDate),
    detailsEncrypted: seal({
      area: b.area,
      description: b.description,
      demandedAmount: b.demandedAmount,
      contact: b.contactRequested ? b.contact : undefined,
    }),
    fingerprint,
    screeningFlags: flags,
    expiresAt: new Date(Date.now() + config.retention * 86400000),
  });
  await History.create({
    reportId: r._id,
    status: "submitted",
    message:
      "Your report was received. Submission does not confirm an allegation.",
  });
  await audit(req, "report.submit", "report", r._id);
  res.status(201).json({ id: r._id, trackingId, secret, status: r.status });
}
app.post("/api/v1/reports", writeLimit, createReport);
app.post("/api/v1/reports/track", writeLimit, async (req, res) =>
  res.json(await publicStatus(await reporterAccess(req))),
);
app.get("/api/v1/reports/:id/status", writeLimit, async (req, res) =>
  res.json(await publicStatus(await reporterAccess(req))),
);
app.patch(
  "/api/v1/reports/:id/public-consent",
  writeLimit,
  async (req, res) => {
    parse(id, req.params.id);
    const r = await reporterAccess(req);
    const b = parse(z.object({ consent: z.boolean() }).strict(), req.body);
    await Report.updateOne(
      { _id: r._id },
      {
        $set: {
          publicConsent: b.consent,
          ...(!b.consent && r.publicEntry
            ? { "publicEntry.approved": false }
            : {}),
        },
      },
    );
    await audit(req, "report.public_consent", "report", r._id);
    res.json({ ok: true, consent: b.consent });
  },
);
const upload = multer({
  storage: evidenceStorage,
  limits: { fileSize: 200 * 1024 * 1024 + 1, files: 1, fields: 3 },
});
let uploadsInFlight = 0;
function uploadCapacity(req, res, next) {
  if (uploadsInFlight >= 3)
    return res
      .status(429)
      .json({ error: "Evidence uploads are busy. Retry shortly." });
  uploadsInFlight++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      uploadsInFlight--;
    }
  };
  res.once("finish", release);
  res.once("close", release);
  next();
}
const fileAllow = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
]);
const evidenceHandlers = [
  writeLimit,
  async (req, res, next) => {
    parse(id, req.params.id);
    req.report =
      req.staff?.role === "super_admin"
        ? await Report.findById(req.params.id)
        : await reporterAccess(req);
    if (!req.report) fail(404, "Report not found.");
    next();
  },
  uploadCapacity,
  upload.single("file"),
  finishEvidenceUpload,
];
async function finishEvidenceUpload(req, res) {
  let committed = false;
  try {
    if (!req.file) fail(400, "Choose a file.");
    const detected = await fileTypeFromBuffer(req.file.head);
    if (!detected || !fileAllow.has(detected.mime))
      fail(
        400,
        "Unsupported file content. Use JPEG, PNG, WebP, PDF, MP3, WAV, OGG, MP4 or WebM.",
      );
    if (
      req.file.size >
      (detected.mime.startsWith("video/") ? 200 : 10) * 1024 * 1024
    )
      fail(400, "Images, documents and audio: 10 MB; video: 200 MB maximum.");
    const contentHash = req.file.contentHash;
    const prior = await Evidence.findOne({
      reportId: req.report._id,
      contentHash,
    });
    if (prior)
      return res.json({
        id: prior._id,
        malwareScanStatus: prior.malwareScanStatus,
        alreadyUploaded: true,
      });
    if ((await Evidence.countDocuments({ reportId: req.report._id })) >= 5)
      fail(400, "Maximum five evidence files per report.");
    let state = "quarantined";
    if (config.scanner === "clamav") {
      try {
        state = await scan(await openEvidence(req.file.path));
      } catch {
        fail(503, "Evidence scanner unavailable. Try again later.");
      }
    }
    if (state === "infected") {
      await audit(
        req,
        "evidence.infected",
        "report",
        req.report._id,
        "blocked",
      );
      fail(400, "File rejected by malware scanner.");
    }
    const reserved = await Report.findOneAndUpdate(
      {
        _id: req.report._id,
        $or: [
          { evidenceCount: { $lt: 5 } },
          { evidenceCount: { $exists: false } },
        ],
      },
      {
        $inc: { evidenceCount: 1 },
        $set: {
          publicationApproved: false,
          ...(req.report.publicEntry ? { "publicEntry.approved": false } : {}),
          reviewState: "evidence_pending",
        },
      },
      { new: true },
    );
    if (!reserved) fail(409, "Evidence limit reached.");
    const key = req.file.storageKey;
    let e;
    try {
      e = await Evidence.create({
        reportId: req.report._id,
        encryptedStorageKey: seal(key),
        mimeType: detected.mime,
        fileSize: req.file.size,
        malwareScanStatus: state,
        contentHash,
      });
      committed = true;
    } catch (err) {
      await fs.unlink(path.join(config.storage, key)).catch(() => {});
      await Report.updateOne(
        { _id: req.report._id },
        { $inc: { evidenceCount: -1 } },
      );
      if (err.code === 11000) {
        const existing = await Evidence.findOne({
          reportId: req.report._id,
          contentHash,
        });
        if (existing)
          return res.json({
            id: existing._id,
            malwareScanStatus: existing.malwareScanStatus,
            alreadyUploaded: true,
          });
      }
      throw err;
    }
    await Report.updateOne(
      { _id: req.report._id },
      {
        $set: {
          publicationApproved: false,
          ...(req.report.publicEntry ? { "publicEntry.approved": false } : {}),
          reviewState: "needs_review",
        },
      },
    );
    committed = true;
    await audit(req, "evidence.upload", "evidence", e._id);
    res.status(201).json({ id: e._id, malwareScanStatus: state });
  } finally {
    if (req.file?.path && !committed)
      await fs.unlink(req.file.path).catch(() => {});
  }
}
app.post("/api/v1/reports/:id/evidence", ...evidenceHandlers);
// Suppress entire dimensions when any cell is small: no totals permit subtraction attacks.
async function statistics(internal = false) {
  const match = internal
    ? {}
    : {
        publicationApproved: true,
        duplicateOf: null,
        expiresAt: { $gt: new Date() },
      };
  const rows = await Report.find(match).select(
    "districtCode incidentType incidentDate status createdAt",
  );
  const group = (field, transform = (v) => v) => {
    const m = new Map();
    for (const r of rows) {
      const k = transform(r[field]);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  };
  const suppress = (arr) =>
    internal || arr.every((x) => x.count >= config.minCount) ? arr : [];
  const byDistrict = suppress(group("districtCode"));
  const byType = suppress(group("incidentType"));
  const monthly = suppress(
    group("incidentDate", (d) => d.toISOString().slice(0, 7)),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const suppressed =
    !internal && [byDistrict, byType, monthly].some((a) => !a.length);
  return {
    total: internal ? rows.length : suppressed ? null : rows.length,
    byDistrict,
    byType,
    monthly,
    byStatus: internal ? group("status") : undefined,
    privacyThreshold: config.minCount,
    suppressed,
    updatedAt: new Date(),
    notice:
      "Approved, anonymized report counts; not a measure of crime rates. Small groups and inferable totals are withheld.",
  };
}
app.get("/api/v1/public/statistics", async (_, res) =>
  res.json(await statistics()),
);
app.post("/api/v1/privacy/requests", writeLimit, async (req, res) => {
  const b = parse(
    z
      .object({
        kind: z.enum(["correction", "removal", "data_access", "other"]),
        trackingId: z.string().max(80).optional(),
        secret: z.string().max(100).optional(),
        contact: z.string().trim().min(3).max(200),
        description: z.string().trim().min(20).max(3000),
      })
      .strict(),
    req.body,
  );
  let ownershipVerified = false;
  if (b.trackingId && b.secret) {
    const r = await Report.findOne({ trackingId: b.trackingId });
    ownershipVerified = !!r && (await verify(r.trackingSecretHash, b.secret));
  }
  const reference = "PR-" + randomToken(12);
  await Privacy.create({
    reference,
    requestEncrypted: seal({ ...b, secret: undefined, ownershipVerified }),
  });
  await audit(req, "privacy.submit", "privacyRequest", reference);
  res.status(201).json({ reference });
});
const staffSafe = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  accountStatus: u.accountStatus,
  available: u.available,
  unavailableUntil: u.unavailableUntil,
  deniedPermissions: u.deniedPermissions || [],
  emailVerifiedAt: u.emailVerifiedAt,
});
async function loginFailure(req, u) {
  if (u) {
    await Staff.updateOne({ _id: u._id }, [
      {
        $set: {
          failedLoginCount: {
            $add: [{ $ifNull: ["$failedLoginCount", 0] }, 1],
          },
          lockedUntil: {
            $cond: [
              {
                $gte: [{ $add: [{ $ifNull: ["$failedLoginCount", 0] }, 1] }, 5],
              },
              new Date(Date.now() + 15 * 60000),
              "$lockedUntil",
            ],
          },
        },
      },
    ]);
  }
  if (u) req.staff = u;
  await audit(req, "staff.login", "staff", u?._id || "", "denied");
  fail(401, "Invalid sign-in credentials.");
}
app.post("/api/v1/staff/auth/login", loginLimit, async (req, res) => {
  const b = parse(
    z
      .object({
        email: z.email().max(200),
        password: z.string().min(1).max(200),
      })
      .strict(),
    req.body,
  );
  const u = await Staff.findOne({ email: b.email.toLowerCase() });
  if (u?.lockedUntil && u.lockedUntil > new Date()) {
    await audit(req, "staff.login_locked", "staff", u._id, "denied");
    fail(401, "Invalid sign-in credentials.");
  }
  if (u?.lockedUntil && u.lockedUntil <= new Date()) {
    u.failedLoginCount = 0;
    u.lockedUntil = undefined;
    await u.save();
  }
  if (
    !u ||
    u.accountStatus !== "active" ||
    !(await verify(u.passwordHash, b.password))
  ) {
    await loginFailure(req, u);
  }
  await Staff.updateOne(
    { _id: u._id },
    { $set: { failedLoginCount: 0 }, $unset: { lockedUntil: 1 } },
  );
  const token = randomToken(),
    csrfToken = randomToken();
  const agent = String(req.get("user-agent") || "Unknown browser").slice(
    0,
    300,
  );
  const deviceHash = mac(agent);
  const knownDevice = await KnownDevice.exists({
    staffId: u._id,
    deviceHash,
    expiresAt: { $gt: new Date() },
  });
  await KnownDevice.findOneAndUpdate(
    { staffId: u._id, deviceHash },
    { $set: { expiresAt: new Date(Date.now() + 90 * 86400000) } },
    { upsert: true },
  );
  const deviceLabel = agent.includes("Edg/")
    ? "Microsoft Edge"
    : agent.includes("Chrome/")
      ? "Chrome browser"
      : agent.includes("Firefox/")
        ? "Firefox browser"
        : agent.includes("Safari/")
          ? "Safari browser"
          : "Browser / API client";
  await Session.create({
    deviceHash,
    deviceLabel,
    tokenHash: digest(token),
    staffId: u._id,
    csrfHash: digest(csrfToken),
    csrfTokenEncrypted: seal(csrfToken),
    expiresAt: new Date(Date.now() + 8 * 3600000),
  });
  res.cookie("cw_session", token, {
    httpOnly: true,
    secure: config.production,
    sameSite: "strict",
    path: "/api/v1",
    maxAge: 8 * 3600000,
  });
  req.staff = u;
  await audit(req, "staff.login", "staff", u._id);
  if (!knownDevice) {
    await notify(u._id, "security", "New device signed in");
    await queueMail(
      u,
      "New device sign-in",
      "A new browser signed in to your ChandaWatch BD account. Open account settings to review and revoke active sessions if this was unexpected.",
    );
  }
  res.json({ user: staffSafe(u), csrfToken });
});
app.get("/api/v1/staff/auth/me", staffAuth, async (req, res) => {
  let csrfToken;
  if (req.session.csrfTokenEncrypted)
    csrfToken = unseal(req.session.csrfTokenEncrypted);
  else {
    csrfToken = randomToken();
    req.session.csrfHash = digest(csrfToken);
    req.session.csrfTokenEncrypted = seal(csrfToken);
    await req.session.save();
  }
  res.json({ user: staffSafe(req.staff), csrfToken });
});
app.use("/api/v1/staff", staffAuth, csrf, (req, res, next) => {
  const path = req.path,
    method = req.method;
  const permission =
    method === "GET"
      ? null
      : path.endsWith("/scan")
        ? "scan"
        : path.endsWith("/public-draft")
          ? "draft"
          : path.endsWith("/review")
            ? "publish"
            : path.endsWith("/status")
              ? "review"
              : null;
  if (permission && !hasPermission(req.staff, permission))
    fail(403, "This action is disabled for your account.");
  next();
});
app.post("/api/v1/staff/auth/logout", async (req, res) => {
  await Session.deleteOne({ _id: req.session._id });
  res.clearCookie("cw_session", {
    path: "/api/v1",
    httpOnly: true,
    secure: config.production,
    sameSite: "strict",
  });
  await audit(req, "staff.logout", "staff", req.staff._id);
  res.json({ ok: true });
});
app.get("/api/v1/staff/analytics", async (req, res) =>
  res.json(await statistics(true)),
);
app.get("/api/v1/staff/reports", async (req, res) => {
  const q = parse(
    z
      .object({
        status: z
          .enum([
            "submitted",
            "screening",
            "under_review",
            "needs_information",
            "reviewed",
            "resolved",
            "rejected",
          ])
          .optional(),
        district: z.string().optional(),
        upazila: z.string().optional(),
        union: z.string().optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        search: z.string().max(80).optional(),
      })
      .strict(),
    req.query,
  );
  if (
    q.union &&
    (!q.district || !q.upazila || !validUnion(q.district, q.upazila, q.union))
  )
    fail(400, "Choose a valid district, upazila and union.");
  const filter = {};
  if (req.staff.role === "moderator") filter.assignedTo = req.staff._id;
  if (q.status) filter.status = q.status;
  if (q.upazila && (!q.district || !validUpazila(q.district, q.upazila)))
    fail(400, "Choose a matching district and upazila.");
  if (q.district) filter.districtCode = q.district;
  if (q.upazila) filter.upazilaCode = q.upazila;
  if (q.union) filter.unionCode = q.union;
  if (q.search) filter.trackingId = q.search;
  const [items, total] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * 20)
      .limit(20)
      .select(
        "trackingId incidentType districtCode upazilaCode unionCode status reviewState publicationApproved assignedTo createdAt screeningFlags",
      ),
    Report.countDocuments(filter),
  ]);
  res.json({ items, total, page: q.page, pages: Math.ceil(total / 20) });
});
app.get("/api/v1/staff/reports/:id", async (req, res) => {
  const r = await getReport(req);
  await audit(req, "report.read", "report", r._id);
  const details = unseal(r.detailsEncrypted);
  if (req.staff.role === "moderator") delete details.contact;
  const duplicateCandidates = await Report.find({
    _id: { $ne: r._id },
    fingerprint: r.fingerprint,
    ...(req.staff.role === "moderator" ? { assignedTo: req.staff._id } : {}),
  })
    .select("_id trackingId status")
    .limit(10);
  res.json({
    report: {
      ...r.toObject(),
      trackingSecretHash: undefined,
      detailsEncrypted: undefined,
      fingerprint: undefined,
      ...details,
    },
    evidence: await Evidence.find({ reportId: r._id }).select(
      "_id mimeType fileSize malwareScanStatus createdAt",
    ),
    history: await History.find({ reportId: r._id }).sort({ createdAt: 1 }),
    reviews: (await Review.find({ reportId: r._id })).map((x) => ({
      ...x.toObject(),
      internalNotesEncrypted: undefined,
      notes: unseal(x.internalNotesEncrypted),
    })),
    duplicateCandidates,
  });
});
const transitions = {
  submitted: ["screening", "rejected"],
  screening: ["under_review", "rejected"],
  under_review: ["needs_information", "reviewed", "rejected"],
  needs_information: ["under_review", "rejected"],
  reviewed: ["resolved", "under_review"],
  resolved: ["under_review"],
  rejected: ["under_review"],
};
app.patch("/api/v1/staff/reports/:id/status", async (req, res) => {
  const r = await getReport(req);
  const b = parse(
    z
      .object({
        status: z.enum(Object.keys(transitions)),
        message: z.string().trim().min(3).max(500),
        redactedSummary: z.string().trim().max(500).optional(),
        duplicateOf: id.nullable().optional(),
        updatedAt: z.iso.datetime().optional(),
      })
      .strict(),
    req.body,
  );
  if (b.updatedAt && new Date(b.updatedAt).getTime() !== r.updatedAt.getTime())
    fail(409, "Report changed. Refresh before saving.");
  if (!transitions[r.status].includes(b.status))
    fail(409, `Cannot transition from ${r.status} to ${b.status}.`);
  if (b.duplicateOf) {
    if (
      b.duplicateOf === String(r._id) ||
      !(await Report.exists({ _id: b.duplicateOf }))
    )
      fail(400, "Invalid duplicate reference.");
  }
  const previous = r.status;
  const update = {
    status: b.status,
    lastModerator: req.staff._id,
    publicationApproved: false,
    ...(r.publicEntry ? { "publicEntry.approved": false } : {}),
    reviewState:
      b.status === "reviewed" ? "awaiting_senior_review" : "in_review",
  };
  if (b.redactedSummary !== undefined)
    update.redactedSummary = b.redactedSummary;
  if (b.duplicateOf !== undefined) update.duplicateOf = b.duplicateOf;
  const changed = await Report.findOneAndUpdate(
    { _id: r._id, status: previous, updatedAt: r.updatedAt },
    { $set: update },
    { new: true },
  );
  if (!changed) fail(409, "Report changed. Refresh and try again.");
  await History.create({
    reportId: r._id,
    status: b.status,
    message: b.message,
    actorId: req.staff._id,
  });
  await audit(req, "report.status", "report", r._id);
  res.json({ ok: true });
});
app.patch("/api/v1/staff/reports/:id/public-draft", async (req, res) => {
  const r = await getReport(req);
  if (!r.publicConsent)
    fail(409, "Reporter consent is required to prepare a public account.");
  const b = parse(
    z
      .object({
        title: z.string().trim().min(10).max(120),
        summary: z.string().trim().min(30).max(600),
        body: z.string().trim().min(50).max(3000),
        displayUpazila: z.boolean().default(false),
        displayUnion: z.boolean().default(false),
        updatedAt: z.iso.datetime().optional(),
      })
      .strict(),
    req.body,
  );
  if (b.updatedAt && new Date(b.updatedAt).getTime() !== r.updatedAt.getTime())
    fail(409, "Report changed. Refresh before saving.");
  if (b.displayUnion && (!b.displayUpazila || !r.unionCode))
    fail(400, "Union display requires the recorded union and upazila display.");
  if (b.displayUpazila && !r.upazilaCode)
    fail(400, "This report has no upazila.");
  if (
    /(?:[0-9০-৯][\s-]?){10,17}|[\w.+-]+@[\w.-]+\.[a-z]+|https?:\/\//i.test(
      [b.title, b.summary, b.body].join(" "),
    )
  )
    fail(
      400,
      "Remove contact, identity and URL patterns from the public draft.",
    );
  const { updatedAt: expectedVersion, ...draftFields } = b;
  const publicEntry = {
    ...draftFields,
    publicId: r.publicEntry?.publicId || randomToken(18),
    incidentMonth: r.incidentDate.toISOString().slice(0, 7),
    preparedBy: req.staff._id,
    approved: false,
    verificationLevel: "reviewed",
  };
  const changed = await Report.findOneAndUpdate(
    { _id: r._id, updatedAt: r.updatedAt },
    { $set: { publicEntry, publicationApproved: false } },
    { new: true },
  );
  if (!changed) fail(409, "Report changed. Refresh before saving.");
  if (r.publicEntry && !(await DraftVersion.exists({ reportId: r._id })))
    await DraftVersion.create({
      reportId: r._id,
      authorId: r.publicEntry.preparedBy,
      snapshotEncrypted: seal(r.publicEntry.toObject()),
    });
  await DraftVersion.create({
    reportId: r._id,
    authorId: req.staff._id,
    snapshotEncrypted: seal(publicEntry),
  });
  await audit(req, "report.public_draft", "report", r._id);
  res.json({ ok: true });
});
app.post(
  "/api/v1/staff/reports/:id/review",
  allow("senior_reviewer", "super_admin"),
  async (req, res) => {
    const r = await getReport(req);
    const b = parse(
      z
        .object({
          decision: z.enum(["approve", "needs_review", "reject"]),
          notes: z.string().trim().min(5).max(2000),
          publishPublic: z.boolean().default(false),
          redactionConfirmed: z.boolean().default(false),
          verificationLevel: z
            .enum(["reviewed", "independently_verified"])
            .default("reviewed"),
          verificationNote: z.string().trim().max(500).optional(),
        })
        .strict(),
      req.body,
    );
    if (b.decision === "approve") {
      if (
        !["reviewed", "resolved"].includes(r.status) ||
        !r.redactedSummary ||
        r.duplicateOf
      )
        fail(
          409,
          "Only reviewed, redacted, non-duplicate reports can be approved.",
        );
      if (!r.lastModerator || String(r.lastModerator) === String(req.staff._id))
        fail(403, "Independent second-person review is required.");
      if (
        r.evidenceCount !== (await Evidence.countDocuments({ reportId: r._id }))
      )
        fail(409, "Evidence upload is in progress or requires reconciliation.");
      const blocked = await Evidence.exists({
        reportId: r._id,
        malwareScanStatus: { $ne: "clean" },
      });
      if (blocked) fail(409, "Evidence must be scanned clean before approval.");
      if (b.publishPublic) {
        if (!r.publicConsent)
          fail(409, "The reporter did not consent to a public account.");
        if (
          !r.publicEntry?.title ||
          !r.publicEntry?.body ||
          !r.publicEntry?.summary
        )
          fail(409, "Prepare the separate public draft first.");
        if (!b.redactionConfirmed)
          fail(
            400,
            "Confirm the public draft contains no identifying information.",
          );
        if (String(r.publicEntry.preparedBy) === String(req.staff._id))
          fail(403, "Public draft approval requires a different reviewer.");
        if (
          b.verificationLevel === "independently_verified" &&
          (!b.verificationNote || b.verificationNote.length < 30)
        )
          fail(
            400,
            "Independent verification requires a safe public explanation of the verification method.",
          );
        if (
          /(?:[0-9০-৯][\s-]?){10,17}|[\w.+-]+@[\w.-]+\.[a-z]+|https?:\/\//i.test(
            [
              r.publicEntry.title,
              r.publicEntry.summary,
              r.publicEntry.body,
              b.verificationNote,
            ].join(" "),
          )
        )
          fail(
            400,
            "Public copy contains contact, identity or URL patterns. Remove them before publication.",
          );
      }
    }
    const approved = await Report.findOneAndUpdate(
      { _id: r._id, updatedAt: r.updatedAt },
      {
        $set: {
          publicationApproved: b.decision === "approve",
          publicationReviewer: req.staff._id,
          ...(r.publicEntry
            ? {
                "publicEntry.approved":
                  b.decision === "approve" && b.publishPublic,
                ...(b.decision === "approve" && b.publishPublic
                  ? {
                      "publicEntry.publishedAt": new Date(),
                      "publicEntry.reviewedAt": new Date(),
                      "publicEntry.snapshotStatus": r.status,
                      "publicEntry.verificationLevel": b.verificationLevel,
                      "publicEntry.verificationNote": b.verificationNote || "",
                    }
                  : {}),
              }
            : {}),
          reviewState:
            b.decision === "approve"
              ? "approved"
              : b.decision === "reject"
                ? "rejected"
                : "needs_review",
        },
      },
      { new: true },
    );
    if (!approved)
      fail(409, "Report changed during review. Refresh and review again.");
    await Review.create({
      reportId: r._id,
      reviewerId: req.staff._id,
      decision: b.decision,
      internalNotesEncrypted: seal(b.notes),
    });
    await audit(req, "report.review", "report", r._id);
    res.json({ ok: true });
  },
);
app.get("/api/v1/staff/evidence/:id", async (req, res) => {
  parse(id, req.params.id);
  const e = await Evidence.findById(req.params.id);
  if (!e) fail(404, "Evidence not found.");
  const r = await Report.findById(e.reportId);
  if (!r || !canAccess(req.staff, r)) fail(403, "Permission denied.");
  if (e.malwareScanStatus !== "clean")
    fail(409, "Evidence is quarantined until a clean scan.");
  await audit(req, "evidence.download", "evidence", e._id);
  const content = await openEvidence(
    path.join(config.storage, unseal(e.encryptedStorageKey)),
  );
  res.set({
    "Content-Type": e.mimeType,
    "Content-Disposition": 'attachment; filename="evidence"',
    "X-Content-Type-Options": "nosniff",
  });
  await pipeline(content, res);
});
app.post(
  "/api/v1/staff/evidence/:id/scan",
  allow("senior_reviewer", "super_admin"),
  async (req, res) => {
    parse(id, req.params.id);
    const e = await Evidence.findById(req.params.id);
    if (!e) fail(404, "Evidence not found.");
    try {
      e.malwareScanStatus = await scan(
        await openEvidence(
          path.join(config.storage, unseal(e.encryptedStorageKey)),
        ),
      );
    } catch {
      fail(503, "ClamAV unavailable.");
    }
    await e.save();
    const r = await Report.findById(e.reportId);
    if (e.malwareScanStatus !== "clean" && r) {
      r.publicationApproved = false;
      if (r.publicEntry) r.publicEntry.approved = false;
      await r.save();
    }
    await audit(req, "evidence.scan", "evidence", e._id);
    res.json({ status: e.malwareScanStatus });
  },
);
installOwnership(app, { staffAuth, csrf, fail, audit });
app.use(
  "/api/v1/admin/users",
  staffAuth,
  csrf,
  allow("super_admin"),
  protectOwner,
);
app.use(
  "/api/v1/features/admin/users",
  staffAuth,
  csrf,
  allow("super_admin"),
  protectOwner,
);
app.use("/api/v1/admin", staffAuth, csrf, allow("super_admin"));
app.get("/api/v1/admin/page-info", async (req, res) =>
  res.json({
    items: await PageInfo.find()
      .sort({ slug: 1 })
      .select("slug title titleBn body bodyBn published -_id")
      .lean(),
  }),
);
app.put("/api/v1/admin/page-info/:slug", async (req, res) => {
  const slug = parse(
      z.enum(["home", "awareness", "safety", "privacy"]),
      req.params.slug,
    ),
    b = parse(
      z
        .object({
          title: z.string().trim().min(3).max(120),
          titleBn: z.string().trim().max(120).default(""),
          body: z.string().trim().min(10).max(10000),
          bodyBn: z.string().trim().max(10000).default(""),
          published: z.boolean(),
        })
        .strict(),
      req.body,
    );
  if (
    b.published &&
    /(?:[0-9০-৯][\s-]?){10,17}|[\w.+-]+@[\w.-]+\.[a-z]+/i.test(
      [b.title, b.titleBn, b.body, b.bodyBn].join(" "),
    )
  )
    fail(
      400,
      "Remove personal identity or contact patterns from public information.",
    );
  await PageInfo.findOneAndUpdate(
    { slug },
    { $set: b },
    { upsert: true, new: true },
  );
  await audit(req, "page_info.save", "pageInfo", slug);
  res.json({ ok: true });
});
app.delete("/api/v1/admin/page-info/:slug", async (req, res) => {
  const slug = parse(
    z.enum(["home", "awareness", "safety", "privacy"]),
    req.params.slug,
  );
  parse(
    z.object({ reason: z.string().trim().min(10).max(500) }).strict(),
    req.body,
  );
  await PageInfo.deleteOne({ slug });
  await audit(req, "page_info.delete", "pageInfo", slug);
  res.json({ ok: true });
});

app.post("/api/v1/admin/reports", createReport);
app.post("/api/v1/admin/reports/:id/evidence", ...evidenceHandlers);
app.patch("/api/v1/admin/reports/:id", async (req, res) => {
  parse(id, req.params.id);
  const r = await Report.findById(req.params.id);
  if (!r) fail(404, "Report not found.");
  const b = parse(
    reportSchema
      .omit({ website: true })
      .extend({ reason: z.string().trim().min(10).max(500) }),
    req.body,
  );
  if (
    b.incidentType !== r.incidentType &&
    !(await (
      await import("./feature-services.js")
    ).validIncidentType(b.incidentType))
  )
    fail(400, "Choose an enabled incident category.");
  if (
    !validUpazila(b.district, b.upazila) ||
    !validUnion(b.district, b.upazila, b.union)
  )
    fail(400, "Choose matching district, upazila and union.");
  if (b.contactRequested && !b.contact)
    fail(400, "Contact information is required when requesting contact.");
  const changed = await Report.findOneAndUpdate(
    { _id: r._id, updatedAt: r.updatedAt },
    {
      $set: {
        incidentType: b.incidentType,
        districtCode: b.district,
        upazilaCode: b.upazila || "",
        unionCode: b.union || "",
        publicConsent: b.publicConsent,
        incidentDate: new Date(b.incidentDate),
        detailsEncrypted: seal({
          area: b.area,
          description: b.description,
          demandedAmount: b.demandedAmount,
          contact: b.contactRequested ? b.contact : undefined,
        }),
        fingerprint: mac(
          b.district +
            "|" +
            b.incidentDate +
            "|" +
            b.description.toLowerCase().replace(/\s+/g, " "),
        ),
        publicationApproved: false,
        reviewState: "needs_review",
        lastModerator: req.staff._id,
      },
      $unset: { publicEntry: 1, redactedSummary: 1 },
    },
    { new: true },
  );
  if (!changed) fail(409, "Report changed. Refresh before editing.");
  await Review.create({
    reportId: r._id,
    reviewerId: req.staff._id,
    decision: "admin_correction",
    internalNotesEncrypted: seal(b.reason),
  });
  await History.create({
    reportId: r._id,
    status: r.status,
    message: "Report information corrected during administrative review.",
    actorId: req.staff._id,
  });
  await audit(req, "report.edit", "report", r._id);
  res.json({ ok: true });
});
app.delete("/api/v1/admin/evidence/:id", async (req, res) => {
  parse(id, req.params.id);
  const b = parse(
      z.object({ reason: z.string().trim().min(10).max(500) }).strict(),
      req.body,
    ),
    e = await Evidence.findOneAndDelete({ _id: req.params.id });
  if (!e) fail(404, "Evidence not found.");
  await fs
    .unlink(path.join(config.storage, unseal(e.encryptedStorageKey)))
    .catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  const r = await Report.findById(e.reportId);
  if (r) {
    await Report.updateOne(
      { _id: r._id },
      {
        $inc: { evidenceCount: -1 },
        $set: {
          publicationApproved: false,
          reviewState: "needs_review",
          ...(r.publicEntry ? { "publicEntry.approved": false } : {}),
        },
      },
    );
    await Review.create({
      reportId: r._id,
      reviewerId: req.staff._id,
      decision: "evidence_removal",
      internalNotesEncrypted: seal(b.reason),
    });
  }
  await audit(req, "evidence.delete", "evidence", e._id);
  res.json({ ok: true });
});
app.delete("/api/v1/admin/users/:id", async (req, res) => {
  parse(id, req.params.id);
  parse(
    z.object({ reason: z.string().trim().min(10).max(500) }).strict(),
    req.body,
  );
  if (req.params.id === String(req.staff._id))
    fail(400, "You cannot delete your own account.");
  const u = await Staff.findByIdAndDelete(req.params.id);
  if (!u) fail(404, "Staff member not found.");
  await Session.deleteMany({ staffId: u._id });
  await Promise.all([
    AccountToken.deleteMany({ staffId: u._id }),
    Mail.deleteMany({ staffId: u._id }),
    Notification.deleteMany({ staffId: u._id }),
    KnownDevice.deleteMany({ staffId: u._id }),
  ]);
  await Report.updateMany({ assignedTo: u._id }, { $unset: { assignedTo: 1 } });
  await audit(req, "staff.delete", "staff", u._id);
  res.json({ ok: true });
});

app.get("/api/v1/admin/security", async (req, res) => {
  const since = new Date(Date.now() - 24 * 3600000);
  const [denied, quarantined, locked, events] = await Promise.all([
    Audit.countDocuments({
      createdAt: { $gte: since },
      outcome: { $in: ["denied", "blocked"] },
    }),
    Evidence.countDocuments({ malwareScanStatus: { $ne: "clean" } }),
    Staff.countDocuments({ lockedUntil: { $gt: new Date() } }),
    Audit.find({
      createdAt: { $gte: since },
      outcome: { $in: ["denied", "blocked"] },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("action outcome createdAt -_id")
      .lean(),
  ]);
  await audit(req, "security.view", "security", "dashboard");
  res.json({
    denied,
    quarantined,
    locked,
    scanner: config.scanner,
    production: config.production,
    idleMinutes: 30,
    lockoutAttempts: 5,
    lockoutMinutes: 15,
    events,
  });
});
app.get("/api/v1/admin/users", async (req, res) =>
  res.json({
    items: (await Staff.find().sort({ createdAt: -1 })).map(staffSafe),
  }),
);
app.post("/api/v1/admin/users", async (req, res) => {
  const b = parse(
    z
      .object({
        email: z.email().max(200),
        name: z.string().trim().min(2).max(100),
        role: z.enum(roles),
        password: z.string().min(14).max(200),
      })
      .strict(),
    req.body,
  );
  const u = await Staff.create({
    name: b.name,
    role: b.role,
    email: b.email.toLowerCase(),
    passwordHash: await hash(b.password),
    mfaEnabled: false,
  });
  await audit(req, "staff.create", "staff", u._id);
  res.status(201).json({
    user: staffSafe(u),
  });
});
app.patch("/api/v1/admin/users/:id", async (req, res) => {
  parse(id, req.params.id);
  const b = parse(
    z
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        email: z.email().max(200).optional(),
        password: z.string().min(14).max(200).optional(),
        role: z.enum(roles).optional(),
        accountStatus: z.enum(["active", "disabled"]).optional(),
      })
      .strict(),
    req.body,
  );
  if (req.params.id === String(req.staff._id) && (b.role || b.accountStatus))
    fail(400, "You cannot change your own role or status.");
  const { password, ...updates } = b;
  if (updates.email) updates.email = updates.email.toLowerCase();
  if (updates.email) updates.emailVerifiedAt = null;
  if (password) updates.passwordHash = await hash(password);
  const u = await Staff.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true },
  );
  if (!u) fail(404, "Staff member not found.");
  await Session.deleteMany({ staffId: u._id });
  if (password || updates.email) {
    const { AccountToken, Mail } = await import("./feature-models.js");
    await AccountToken.deleteMany({ staffId: u._id });
    await Mail.deleteMany({ staffId: u._id, state: { $ne: "sent" } });
  }
  await audit(req, "staff.update", "staff", u._id);
  res.json({ user: staffSafe(u) });
});
app.patch("/api/v1/admin/reports/:id/assign", async (req, res) => {
  parse(id, req.params.id);
  const b = parse(z.object({ staffId: id }).strict(), req.body);
  const u = await Staff.findOne({ _id: b.staffId, accountStatus: "active" });
  if (
    !u ||
    (!u.available && (!u.unavailableUntil || u.unavailableUntil > new Date()))
  )
    fail(400, "Choose an available active staff member.");
  const r = await Report.findByIdAndUpdate(
    req.params.id,
    { $set: { assignedTo: u._id } },
    { new: false },
  );
  if (!r) fail(404, "Report not found.");
  await Assignment.create({
    reportId: r._id,
    fromId: r.assignedTo,
    toId: u._id,
    actorId: req.staff._id,
  });
  await notify(u._id, "assignment", "A report was assigned to you", r._id);
  await audit(req, "report.assign", "report", r._id);
  res.json({ ok: true });
});
app.get("/api/v1/admin/audit-logs", async (req, res) => {
  const q = parse(
    z
      .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
      .strict(),
    req.query,
  );
  res.json({
    items: await Audit.find()
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * 50)
      .limit(50)
      .select("-integrityMac"),
    total: await Audit.countDocuments(),
    page: q.page,
  });
});
app.get("/api/v1/admin/privacy-requests", async (req, res) => {
  await audit(req, "privacy.read", "privacyRequest", "queue");
  res.json({
    items: (await Privacy.find().sort({ createdAt: -1 }).limit(100)).map(
      (x) => ({
        ...x.toObject(),
        requestEncrypted: undefined,
        resolutionEncrypted: undefined,
        details: unseal(x.requestEncrypted),
        resolution: x.resolutionEncrypted ? unseal(x.resolutionEncrypted) : "",
      }),
    ),
  });
});
app.patch("/api/v1/admin/privacy-requests/:id", async (req, res) => {
  parse(id, req.params.id);
  const b = parse(
    z
      .object({
        state: z.enum(["pending", "in_review", "completed", "denied"]),
        resolution: z.string().min(5).max(2000),
      })
      .strict(),
    req.body,
  );
  const r = await Privacy.findByIdAndUpdate(
    req.params.id,
    { $set: { state: b.state, resolutionEncrypted: seal(b.resolution) } },
    { new: true },
  );
  if (!r) fail(404, "Request not found.");
  await audit(req, "privacy.update", "privacyRequest", r._id);
  res.json({ ok: true });
});
app.delete("/api/v1/admin/reports/:id", async (req, res) => {
  parse(id, req.params.id);
  const b = parse(
    z.object({ reason: z.string().min(10).max(500) }).strict(),
    req.body,
  );
  const r = await Report.findById(req.params.id);
  if (!r) fail(404, "Report not found.");
  for (const e of await Evidence.find({ reportId: r._id })) {
    await fs
      .unlink(path.join(config.storage, unseal(e.encryptedStorageKey)))
      .catch(() => {});
  }
  await Promise.all([
    Evidence.deleteMany({ reportId: r._id }),
    History.deleteMany({ reportId: r._id }),
    Review.deleteMany({ reportId: r._id }),
    Report.deleteOne({ _id: r._id }),
  ]);
  await removeReportExtras(r._id);
  await audit(req, "report.delete", "report", r._id);
  res.json({ ok: true });
});
installFeatures(app, {
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
});
app.use("/api", (_, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
const client = path.resolve(root, "../client/dist");
app.use(express.static(client, { index: false }));
app.get("/{*path}", (_, res) => res.sendFile(path.join(client, "index.html")));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status =
    err.status ||
    (err.code === 11000
      ? 409
      : err instanceof multer.MulterError
        ? 400
        : err.type === "entity.parse.failed"
          ? 400
          : 500);
  if (status === 500) {
    console.error("Request failed:", err.name);
    recordSafeError(req.route?.path || "unknown-api-route", status).catch(
      () => {},
    );
  }
  res.status(status).json({
    error:
      status === 500
        ? "Request could not be completed."
        : err.code === 11000
          ? "This record already exists."
          : err.message,
  });
});
