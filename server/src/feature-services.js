import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { types } from "./districts.js";
import { config, root } from "./config.js";
import {
  Report,
  Evidence,
  Staff,
  Session,
  History,
  Review,
  Privacy,
} from "./models.js";
import {
  Notification,
  Message,
  DraftVersion,
  Assignment,
  PublicFeedback,
  AccountToken,
  Mail,
  Setting,
  Job,
  AppError,
  Upload,
  Content,
  ContentVersion,
  NewsMedia,
} from "./feature-models.js";
import { seal, unseal, digest, mac } from "./crypto.js";
export const permissionNames = [
  "review",
  "draft",
  "publish",
  "scan",
  "export",
  "communicate",
  "workflow",
];
export function hasPermission(user, name) {
  return user.role === "super_admin" || !user.deniedPermissions?.includes(name);
}
export async function validIncidentType(code) {
  const override = await Content.findOne({
    kind: "category",
    slug: code,
    state: "published",
    $or: [{ publishAt: { $lte: new Date() } }, { publishAt: null }],
  }).select("enabled");
  return override ? override.enabled : types.includes(code);
}
export async function notify(staffId, kind, title, reportId, dedupe) {
  if (!staffId) return;
  const data = {
    staffId,
    kind,
    title,
    reportId,
    expiresAt: new Date(Date.now() + 90 * 86400000),
    ...(dedupe ? { dedupe } : {}),
  };
  try {
    return await Notification.create(data);
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
}
export async function notifyAdmins(kind, title, reportId, dedupe) {
  for (const u of await Staff.find({
    role: "super_admin",
    accountStatus: "active",
  }).select("_id"))
    await notify(
      u._id,
      kind,
      title,
      reportId,
      dedupe ? `${dedupe}:${u._id}` : undefined,
    );
}
export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}
export async function queueMail(staff, purpose, text) {
  if (!mailConfigured()) return false;
  await Mail.create({
    staffId: staff._id,
    purpose,
    envelopeEncrypted: seal({ to: staff.email, text }),
    nextAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  });
  return true;
}
export async function onAuditEvent(req, record) {
  const { action, resourceId, outcome } = record;
  if (["report.create", "report.submit"].includes(action))
    await notifyAdmins("intake", "New private report received", resourceId);
  if (
    [
      "report.status",
      "report.public_draft",
      "evidence.upload",
      "report.edit",
    ].includes(action)
  ) {
    const r =
      action === "evidence.upload"
        ? await Evidence.findById(resourceId).then(
            (e) => e && Report.findById(e.reportId),
          )
        : await Report.findById(resourceId);
    if (r) {
      await notify(
        r.assignedTo,
        "review",
        "Report updated; review required",
        r._id,
      );
      if (r.reviewState === "awaiting_senior_review")
        for (const u of await Staff.find({
          role: { $in: ["senior_reviewer", "super_admin"] },
          accountStatus: "active",
        }).select("_id"))
          await notify(u._id, "review", "Independent review pending", r._id);
    }
  }
  if (
    action === "staff.login_locked" ||
    (action === "staff.login" && outcome === "denied" && resourceId)
  ) {
    const u = await Staff.findById(resourceId);
    if (u && (u.failedLoginCount >= 5 || action === "staff.login_locked")) {
      const dedupe = `lock:${u._id}:${new Date(u.lockedUntil).getTime()}`;
      await notifyAdmins(
        "security",
        "Staff sign-in lockout detected",
        undefined,
        dedupe,
      );
      if (action !== "staff.login_locked")
        await queueMail(
          u,
          "security",
          "Your ChandaWatch BD account was temporarily locked after repeated failed sign-in attempts. Contact your administrator if this was unexpected.",
        );
    }
  }
}
export async function recordSafeError(route, status = 500) {
  const safeRoute = String(route || "unknown")
    .replace(/[a-f\d]{24}|[\w-]{20,}/gi, ":id")
    .slice(0, 120);
  const code = digest(`${status}:${safeRoute}`).slice(0, 16);
  await AppError.findOneAndUpdate(
    { code },
    {
      $inc: { count: 1 },
      $set: { route: safeRoute, status, lastAt: new Date() },
    },
    { upsert: true },
  );
}
export async function savedSettings() {
  const rows = await Setting.find().lean();
  return {
    intakeEnabled: true,
    backupEnabled:
      process.env.BACKUP_SCHEDULE_ENABLED === "true" &&
      /^[a-f\d]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY || ""),
    retentionEnabled: process.env.RETENTION_SCHEDULE_ENABLED === "true",
    privacyDeadlineDays: 7,
    ...Object.fromEntries(
      rows
        .filter((r) => !r.key.startsWith("lease:"))
        .map((r) => [r.key, r.value]),
    ),
  };
}
export async function intakeAllowed() {
  const value = await Setting.findOne({ key: "intakeEnabled" });
  return (
    config.reporting &&
    (!config.production || config.launchApproved) &&
    value?.value !== false
  );
}
export async function removeReportExtras(reportId) {
  const uploads = await Upload.find({ reportId });
  for (const u of uploads) await cleanupUpload(u._id);
  await Promise.all([
    Message.deleteMany({ reportId }),
    DraftVersion.deleteMany({ reportId }),
    Assignment.deleteMany({ reportId }),
    PublicFeedback.deleteMany({ reportId }),
    Notification.deleteMany({ reportId }),
    Upload.deleteMany({ reportId }),
  ]);
}
export const chunkDirectory = (id) =>
  path.join(config.storage, "chunks", String(id));
export async function cleanupUpload(id) {
  if (!/^[a-f\d]{24}$/i.test(String(id))) throw Error("Invalid upload id");
  await fs.rm(chunkDirectory(id), { recursive: true, force: true });
}
export async function retainExpired() {
  let count = 0;
  for await (const r of Report.find({
    expiresAt: { $lte: new Date() },
  }).cursor()) {
    for (const e of await Evidence.find({ reportId: r._id }))
      await fs
        .unlink(path.join(config.storage, unseal(e.encryptedStorageKey)))
        .catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
    await removeReportExtras(r._id);
    await Promise.all([
      Evidence.deleteMany({ reportId: r._id }),
      History.deleteMany({ reportId: r._id }),
      Review.deleteMany({ reportId: r._id }),
      Report.deleteOne({ _id: r._id }),
    ]);
    const record = {
      action: "report.retention_delete",
      resourceType: "report",
      resourceId: String(r._id),
      outcome: "success",
    };
    const { Audit } = await import("./models.js");
    await Audit.create({
      ...record,
      integrityMac: mac(JSON.stringify(record)),
    });
    count++;
  }
  await Privacy.deleteMany({
    state: { $in: ["completed", "denied"] },
    updatedAt: { $lt: new Date(Date.now() - config.retention * 86400000) },
  });
  for (const u of await Upload.find({ expiresAt: { $lt: new Date() } })) {
    await cleanupUpload(u._id);
    await Upload.deleteOne({ _id: u._id });
  }
  const expiredContent = await Content.find({
    state: "trash",
    deletedAt: { $lt: new Date(Date.now() - 30 * 86400000) },
  }).select("_id");
  const expiredContentIds = expiredContent.map((item) => item._id);
  await ContentVersion.deleteMany({ contentId: { $in: expiredContentIds } });
  await Content.deleteMany({ _id: { $in: expiredContentIds } });
  for (const media of await NewsMedia.find({
    createdAt: { $lt: new Date(Date.now() - 30 * 86400000) },
  })) {
    if (
      !(await Content.exists({
        $or: [{ coverMediaId: media._id }, { videoMediaId: media._id }],
      })) &&
      !(await ContentVersion.exists({
        $or: [
          { "snapshot.coverMediaId": media._id },
          { "snapshot.videoMediaId": media._id },
        ],
      }))
    ) {
      if (/^news-[a-f\d-]{36}$/.test(media.storageName))
        await fs
          .unlink(path.join(config.storage, media.storageName))
          .catch((e) => {
            if (e.code !== "ENOENT") throw e;
          });
      await NewsMedia.deleteOne({ _id: media._id });
    }
  }
  return count;
}
export async function runJob(kind) {
  const owner = randomUUID();
  // A persistent lease prevents two application instances running the same job.
  const lease = await Setting.findOneAndUpdate(
    {
      key: `lease:${kind}`,
      $or: [
        { "value.until": { $lt: new Date() } },
        { value: { $exists: false } },
      ],
    },
    { $set: { value: { owner, until: new Date(Date.now() + 30 * 60000) } } },
    { new: true },
  );
  if (!lease) {
    try {
      await Setting.create({
        key: `lease:${kind}`,
        value: { owner, until: new Date(Date.now() + 30 * 60000) },
      });
    } catch (e) {
      if (e.code === 11000)
        throw Object.assign(Error("Job already running"), { status: 409 });
      throw e;
    }
  }
  const job = await Job.create({
    kind,
    state: "running",
    startedAt: new Date(),
    owner,
  });
  try {
    let count = 0;
    if (kind === "retention") count = await retainExpired();
    else if (kind === "backup") {
      if (!/^[a-f\d]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY || ""))
        throw Object.assign(Error("Backup key is not configured"), {
          code: "BACKUP_NOT_CONFIGURED",
        });
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["scripts/backup.js"], {
          cwd: root,
          windowsHide: true,
          env: {
            ...process.env,
            MONGODB_URI: mongoose.connection.getClient().s.url,
            SCANNER_MODE: config.scanner,
          },
          stdio: ["ignore", "ignore", "ignore"],
        });
        child.on("error", reject);
        child.on("exit", (c) =>
          c === 0
            ? resolve()
            : reject(
                Object.assign(Error("Backup failed"), {
                  code: "BACKUP_FAILED",
                }),
              ),
        );
      });
    } else throw Error("Unsupported job");
    await Job.updateOne(
      { _id: job._id },
      { $set: { state: "succeeded", finishedAt: new Date(), count } },
    );
    return { ok: true, count };
  } catch (e) {
    await Job.updateOne(
      { _id: job._id },
      {
        $set: {
          state: "failed",
          finishedAt: new Date(),
          code: /^[A-Z_]+$/.test(e.code || "") ? e.code : "JOB_FAILED",
        },
      },
    );
    await notifyAdmins(
      "operations",
      `${kind} operation failed`,
      undefined,
      `${job._id}`,
    );
    throw Object.assign(
      Error("Operation failed; inspect safe job status and configuration."),
      { status: 503 },
    );
  } finally {
    await Setting.updateOne(
      { key: `lease:${kind}`, "value.owner": owner },
      { $set: { "value.until": new Date(0) } },
    );
  }
}
let tickRunning = false;
export async function operationTick({ mailTransport } = {}) {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const now = new Date();
    for (const r of await Report.find({
      dueAt: { $lt: now },
      status: { $nin: ["resolved", "rejected"] },
    }).select("assignedTo dueAt"))
      await notify(
        r.assignedTo,
        "overdue",
        "Review deadline passed",
        r._id,
        `due:${r._id}:${r.dueAt.getTime()}`,
      );
    const settings = await savedSettings();
    for (const kind of ["backup", "retention"])
      if (settings[`${kind}Enabled`]) {
        const last = await Job.findOne({ kind }).sort({ createdAt: -1 });
        if (!last || now - last.createdAt > 86400000)
          await runJob(kind).catch(() => {});
      }
    if (mailConfigured()) {
      const transport =
        mailTransport ||
        nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true",
          requireTLS: process.env.SMTP_SECURE !== "true",
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 30000,
          logger: false,
          debug: false,
        });
      for (const m of await Mail.find({
        state: "queued",
        nextAt: { $lte: now },
        expiresAt: { $gt: now },
      }).limit(5)) {
        const claimed = await Mail.findOneAndUpdate(
          { _id: m._id, state: "queued" },
          { $set: { state: "sending" } },
          { new: true },
        );
        if (!claimed) continue;
        try {
          const envelope = unseal(m.envelopeEncrypted);
          await transport.sendMail({
            from: process.env.SMTP_FROM,
            to: envelope.to,
            subject: `ChandaWatch BD · ${m.purpose}`,
            text: envelope.text,
            disableFileAccess: true,
            disableUrlAccess: true,
          });
          await Mail.updateOne(
            { _id: m._id },
            {
              $set: { state: "sent", sentAt: new Date() },
              $unset: { envelopeEncrypted: 1 },
            },
          );
        } catch (e) {
          await Mail.updateOne(
            { _id: m._id },
            {
              $set: {
                state: m.attempts >= 4 ? "failed" : "queued",
                nextAt: new Date(Date.now() + 5 * 60000),
                failureCode: "SMTP_DELIVERY_FAILED",
              },
              $inc: { attempts: 1 },
            },
          );
        }
      }
      await Mail.updateMany(
        {
          state: "sending",
          updatedAt: { $lt: new Date(Date.now() - 5 * 60000) },
        },
        { $set: { state: "queued", nextAt: now } },
      );
    }
    for (const u of await Upload.find({ expiresAt: { $lt: now } }).limit(20)) {
      await cleanupUpload(u._id);
      await Upload.deleteOne({ _id: u._id });
    }
  } finally {
    tickRunning = false;
  }
}
export function startOperations() {
  const timer = setInterval(
    () => operationTick().catch(() => recordSafeError("operations-worker")),
    60000,
  );
  timer.unref();
  return () => clearInterval(timer);
}
