import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, after, afterEach, test } from "node:test";
import { ipKeyGenerator } from "express-rate-limit";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import nodemailer from "nodemailer";
process.env.NODE_ENV = "test";
process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.AUDIT_KEY = randomBytes(32).toString("hex");
process.env.STORAGE_DIR = fileURLToPath(
  new URL("../.cache/feature-tests/", import.meta.url),
);
process.env.SCANNER_MODE = "quarantine";
process.env.REPORTING_ENABLED = "true";
process.env.BACKUP_SCHEDULE_ENABLED = "false";
process.env.RETENTION_SCHEDULE_ENABLED = "false";
process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.SMTP_HOST = "";
process.env.SMTP_FROM = "";
const { app } = await import("../src/app.js"),
  { Report, Staff, Evidence, Session, Audit, Privacy } =
    await import("../src/models.js"),
  {
    Notification,
    Message,
    DraftVersion,
    Assignment,
    Content,
    ContentVersion,
    PublicFeedback,
    AccountToken,
    Mail,
    Setting,
    Job,
    AppError,
    Upload,
    KnownDevice,
    NewsMedia,
  } = await import("../src/feature-models.js"),
  { hash, seal, unseal, digest, randomToken } =
    await import("../src/crypto.js"),
  { config } = await import("../src/config.js"),
  { operationTick, retainExpired, chunkDirectory, runJob } =
    await import("../src/feature-services.js");
let mongo,
  admin,
  mod,
  senior,
  adminUser,
  modUser,
  seniorUser,
  adminCsrf,
  modCsrf,
  seniorCsrf,
  c,
  publicId;
const password = "Feature-test-password-927";
const input = {
  incidentType: "extortion_demand",
  district: "dhaka",
  upazila: "dhaka-savar",
  area: "Synthetic general area",
  incidentDate: "2026-10-01",
  description:
    "Explicitly synthetic incident description for isolated integration validation.",
  privacyAcknowledged: true,
  publicConsent: true,
};
const headers = () => ({
  "x-tracking-id": c.trackingId,
  "x-tracking-secret": c.secret,
});
const draft = {
  title: "Synthetic privacy-reviewed public account",
  summary:
    "A synthetic redacted account with no private identities or contact information.",
  body: "This explicitly synthetic account describes a general situation for validation. Original evidence and identifying details remain private.",
  displayUpazila: true,
  displayUnion: false,
};
async function signin(agent, user, code) {
  const d = await agent
    .post("/api/v1/staff/auth/login")
    .send({ email: user.email, password: code || password })
    .expect(200);
  return d.body.csrfToken;
}
async function publish() {
  await Report.updateOne(
    { _id: c.id },
    {
      $set: {
        status: "reviewed",
        lastModerator: modUser._id,
        reviewState: "awaiting_senior_review",
        redactedSummary: "Synthetic redacted internal summary for publication.",
      },
    },
  );
  await mod
    .patch(`/api/v1/staff/reports/${c.id}/public-draft`)
    .set("x-csrf-token", modCsrf)
    .send(draft)
    .expect(200);
  await senior
    .post(`/api/v1/staff/reports/${c.id}/review`)
    .set("x-csrf-token", seniorCsrf)
    .send({
      decision: "approve",
      notes: "Synthetic privacy review completed without identifying content.",
      publishPublic: true,
      redactionConfirmed: true,
    })
    .expect(200);
  publicId = (await Report.findById(c.id)).publicEntry.publicId;
}
before(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { launchTimeout: 30000 },
    binary: {
      version: "7.0.14",
      downloadDir: fileURLToPath(
        new URL("../.cache/binaries/", import.meta.url),
      ),
    },
  });
  await mongoose.connect(mongo.getUri("feature_validation"));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await fs.mkdir(config.storage, { recursive: true });
  const passwordHash = await hash(password);
  [adminUser, modUser, seniorUser] = await Staff.create([
    {
      name: "Synthetic Admin",
      email: "feature-admin@example.test",
      role: "super_admin",
      passwordHash,
      mfaEnabled: false,
    },
    {
      name: "Synthetic Moderator",
      email: "feature-mod@example.test",
      role: "moderator",
      passwordHash,
      mfaEnabled: false,
    },
    {
      name: "Synthetic Senior",
      email: "feature-senior@example.test",
      role: "senior_reviewer",
      passwordHash,
      mfaEnabled: false,
    },
  ]);
  admin = request.agent(app);
  mod = request.agent(app);
  senior = request.agent(app);
  adminCsrf = await signin(admin, adminUser);
  modCsrf = await signin(mod, modUser);
  seniorCsrf = await signin(senior, seniorUser);
  c = (await request(app).post("/api/v1/reports").send(input).expect(201)).body;
});
after(async () => {
  process.env.SMTP_HOST = "";
  process.env.SMTP_FROM = "";
  delete process.env.BACKUP_ENCRYPTION_KEY;
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  await fs.rm(config.storage, { recursive: true, force: true });
});
afterEach(async () => {
  const { apiRateLimiter } = await import("../src/app.js");
  for (const ip of ["127.0.0.1", "::ffff:127.0.0.1", "::1"])
    apiRateLimiter.resetKey(ipKeyGenerator(ip));
});
test("new intake and assignments notify authorized staff; notifications are scoped to their owner", async () => {
  assert.ok(
    await Notification.exists({
      staffId: adminUser._id,
      kind: "intake",
      reportId: c.id,
    }),
  );
  await mod.get(`/api/v1/features/staff/reports/${c.id}/workspace`).expect(403);
  await admin
    .patch(`/api/v1/admin/reports/${c.id}/assign`)
    .set("x-csrf-token", adminCsrf)
    .send({ staffId: String(modUser._id) })
    .expect(200);
  const n = await Notification.findOne({
    staffId: modUser._id,
    kind: "assignment",
  });
  assert.ok(n);
  assert.equal(await Assignment.countDocuments({ reportId: c.id }), 1);
  await senior
    .post("/api/v1/features/staff/notifications/read")
    .set("x-csrf-token", seniorCsrf)
    .send({ ids: [String(n._id)] })
    .expect(200);
  assert.equal((await Notification.findById(n._id)).readAt, undefined);
  await mod
    .post("/api/v1/features/staff/notifications/read")
    .set("x-csrf-token", modCsrf)
    .send({ ids: [String(n._id)] })
    .expect(200);
  assert.ok((await Notification.findById(n._id)).readAt);
});
test("private reporter conversations encrypt content and exclude internal notes", async () => {
  await request(app)
    .post(`/api/v1/features/reporter/${c.id}/messages`)
    .set(headers())
    .send({
      kind: "supplement",
      text: "Synthetic supplemental private information for the assigned reviewer.",
    })
    .expect(201);
  await mod
    .post(`/api/v1/features/staff/reports/${c.id}/messages`)
    .set("x-csrf-token", modCsrf)
    .send({
      channel: "internal",
      text: "Internal-only synthetic note",
      mentions: [String(seniorUser._id)],
    })
    .expect(201);
  await mod
    .post(`/api/v1/features/staff/reports/${c.id}/messages`)
    .set("x-csrf-token", modCsrf)
    .send({
      channel: "reporter",
      text: "Please clarify the synthetic situation without identities.",
    })
    .expect(201);
  const data = (
    await request(app)
      .get(`/api/v1/features/reporter/${c.id}/messages`)
      .set(headers())
      .expect(200)
  ).body;
  assert.equal(data.items.length, 2);
  assert.ok(!JSON.stringify(data).includes("Internal-only"));
  assert.ok(!JSON.stringify(data).includes(String(modUser._id)));
  const stored = await Message.findOne({ channel: "internal" });
  assert.ok(!stored.textEncrypted.includes("Internal-only"));
  assert.equal(unseal(stored.textEncrypted), "Internal-only synthetic note");
  assert.ok(
    await Notification.exists({ staffId: seniorUser._id, kind: "mention" }),
  );
  await request(app)
    .get(`/api/v1/features/reporter/${c.id}/messages`)
    .set({
      ...headers(),
      "x-tracking-secret": "wrong-secret-that-is-long-enough",
    })
    .expect(404);
  const supplemental = await Message.findOne({ kind: "supplement" });
  await mod
    .patch(
      `/api/v1/features/staff/reports/${c.id}/messages/${supplemental._id}`,
    )
    .set("x-csrf-token", modCsrf)
    .send({
      state: "completed",
      resolution: "Synthetic supplemental information reviewed.",
    })
    .expect(200);
});
test("workflow deadlines and status/draft edits reject stale browser versions", async () => {
  const r = await Report.findById(c.id),
    version = r.updatedAt.toISOString();
  const workflow = {
    updatedAt: version,
    priority: "urgent",
    dueAt: new Date(Date.now() - 60000).toISOString(),
    checklist: ["duplicates", "consent"],
  };
  await mod
    .patch(`/api/v1/features/staff/reports/${c.id}/workflow`)
    .set("x-csrf-token", modCsrf)
    .send(workflow)
    .expect(200);
  await mod
    .patch(`/api/v1/features/staff/reports/${c.id}/workflow`)
    .set("x-csrf-token", modCsrf)
    .send({ ...workflow, priority: "normal" })
    .expect(409);
  await mod
    .patch(`/api/v1/staff/reports/${c.id}/status`)
    .set("x-csrf-token", modCsrf)
    .send({
      status: "screening",
      message: "Synthetic screening update",
      updatedAt: version,
    })
    .expect(409);
  await mod
    .patch(`/api/v1/staff/reports/${c.id}/public-draft`)
    .set("x-csrf-token", modCsrf)
    .send({ ...draft, updatedAt: version })
    .expect(409);
  const q = (
    await mod
      .get("/api/v1/features/staff/priority-queue?priority=urgent&overdue=true")
      .expect(200)
  ).body;
  assert.ok(q.items.some((r) => r._id === c.id));
  await operationTick();
  await operationTick();
  assert.equal(
    await Notification.countDocuments({
      staffId: modUser._id,
      kind: "overdue",
    }),
    1,
  );
});
test("draft history restores privately and preserves independent approval gates", async () => {
  await publish();
  const publicFirst = await request(app)
    .get(`/api/v1/public/cases/${publicId}`)
    .expect(200);
  assert.equal(publicFirst.body.timeline[0].stage, "report_received");
  assert.match(publicFirst.body.timeline[0].date, /^\d{4}-\d{2}$/);
  const original = await DraftVersion.findOne({ reportId: c.id });
  assert.ok(original);
  const r = await Report.findById(c.id);
  await mod
    .patch(`/api/v1/staff/reports/${c.id}/public-draft`)
    .set("x-csrf-token", modCsrf)
    .send({
      ...draft,
      title: "Another synthetic redacted public account",
      updatedAt: r.updatedAt.toISOString(),
    })
    .expect(200);
  await request(app).get(`/api/v1/public/cases/${publicId}`).expect(404);
  const current = await Report.findById(c.id);
  await mod
    .post(
      `/api/v1/features/staff/reports/${c.id}/draft-restore/${original._id}`,
    )
    .set("x-csrf-token", modCsrf)
    .send({ updatedAt: current.updatedAt.toISOString() })
    .expect(200);
  const restored = await Report.findById(c.id);
  assert.equal(restored.publicEntry.title, draft.title);
  assert.equal(restored.publicEntry.approved, false);
  assert.equal(String(restored.publicEntry.preparedBy), String(modUser._id));
  await mod
    .post(`/api/v1/staff/reports/${c.id}/review`)
    .set("x-csrf-token", modCsrf)
    .send({ decision: "approve", notes: "Cannot bypass separate reviewer." })
    .expect(403);
  await publish();
});
test("public related cases, social preview and monthly trends use only eligible snapshots", async () => {
  const r = (await Report.findById(c.id)).toObject();
  const { _id, trackingId, createdAt, updatedAt, __v, ...copy } = r;
  await Report.create({
    ...copy,
    trackingId: "CW-RELATED-SYNTHETIC",
    publicEntry: {
      ...copy.publicEntry,
      publicId: randomToken(18),
      title: "Related synthetic approved account",
    },
  });
  const related = (
    await request(app)
      .get(`/api/v1/features/public/cases/${publicId}/related`)
      .expect(200)
  ).body;
  assert.equal(related.items.length, 1);
  assert.ok(!JSON.stringify(related).includes(input.description));
  let summary = (
    await request(app).get("/api/v1/features/public/summary").expect(200)
  ).body;
  assert.equal(summary.months[0].count, null);
  assert.equal(summary.months[0].withheld, true);
  await Report.create({
    ...copy,
    trackingId: "CW-RELATED-SYNTHETIC-TWO",
    publicEntry: {
      ...copy.publicEntry,
      publicId: randomToken(18),
      title: "Another synthetic approved account",
    },
  });
  summary = (
    await request(app).get("/api/v1/features/public/summary").expect(200)
  ).body;
  assert.equal(summary.months[0].count, 3);
  const share = await request(app)
    .get(`/api/v1/features/public/share/${publicId}`)
    .expect(200);
  assert.match(share.text, /og:title/);
  assert.match(share.text, /og:image/);
  assert.ok(!share.text.includes(input.description));
});
test("public feedback encrypts allegations and requires admin/CSRF before moderation", async () => {
  const response = await request(app)
    .post(`/api/v1/features/public/cases/${publicId}/feedback`)
    .send({
      kind: "harmful_content",
      description: "Synthetic concern requiring private safety review.",
    })
    .expect(201);
  const f = await PublicFeedback.findById(response.body.reference);
  assert.equal(
    unseal(f.textEncrypted),
    "Synthetic concern requiring private safety review.",
  );
  await mod.get("/api/v1/features/admin/feedback").expect(403);
  await admin
    .patch(`/api/v1/features/admin/feedback/${f._id}`)
    .send({
      state: "completed",
      resolution: "Synthetic safety review complete",
      hidePublic: true,
    })
    .expect(403);
  await admin
    .patch(`/api/v1/features/admin/feedback/${f._id}`)
    .set("x-csrf-token", adminCsrf)
    .send({
      state: "completed",
      resolution: "Synthetic safety review complete",
      hidePublic: true,
    })
    .expect(200);
  await request(app).get(`/api/v1/public/cases/${publicId}`).expect(404);
  await publish();
});
test("correction and withdrawal requests revoke public approval without deleting audit history", async () => {
  await request(app)
    .post(`/api/v1/features/reporter/${c.id}/messages`)
    .set(headers())
    .send({
      kind: "correction",
      text: "Synthetic correction request requires another privacy review.",
    })
    .expect(201);
  await request(app).get(`/api/v1/public/cases/${publicId}`).expect(404);
  await publish();
  await request(app)
    .post(`/api/v1/features/reporter/${c.id}/messages`)
    .set(headers())
    .send({
      kind: "withdrawal",
      text: "Please withdraw this synthetic report from public display.",
    })
    .expect(201);
  const r = await Report.findById(c.id);
  assert.equal(r.publicConsent, false);
  assert.equal(r.publicationApproved, false);
  assert.ok(
    await Audit.exists({ action: "reporter.message", resourceId: c.id }),
  );
  await Report.updateOne({ _id: c.id }, { $set: { publicConsent: true } });
  await publish();
});
test("content drafts, scheduled publication, versions, conflicts and trash recovery are enforced", async () => {
  const body = {
    slug: "synthetic-faq",
    kind: "faq",
    title: "Synthetic FAQ entry",
    titleBn: "পরীক্ষার প্রশ্ন",
    body: "Synthetic general awareness information.",
    bodyBn: "পরীক্ষার সাধারণ সচেতনতার তথ্য।",
    url: "",
    page: "all",
    rank: 10,
    enabled: true,
    state: "draft",
    publishAt: null,
    revision: 0,
  };
  await mod
    .put("/api/v1/features/admin/content/" + body.slug)
    .set("x-csrf-token", modCsrf)
    .send(body)
    .expect(403);
  let saved = (
    await admin
      .put("/api/v1/features/admin/content/" + body.slug)
      .set("x-csrf-token", adminCsrf)
      .send(body)
      .expect(200)
  ).body.item;
  assert.equal(
    (
      await request(app)
        .get("/api/v1/features/public/content?kind=faq")
        .expect(200)
    ).body.items.length,
    0,
  );
  saved = (
    await admin
      .put("/api/v1/features/admin/content/" + body.slug)
      .set("x-csrf-token", adminCsrf)
      .send({
        ...body,
        state: "published",
        publishAt: new Date(Date.now() + 86400000).toISOString(),
        revision: saved.revision,
      })
      .expect(200)
  ).body.item;
  assert.equal(
    (
      await request(app)
        .get("/api/v1/features/public/content?kind=faq")
        .expect(200)
    ).body.items.length,
    0,
  );
  await admin
    .put("/api/v1/features/admin/content/" + body.slug)
    .set("x-csrf-token", adminCsrf)
    .send({ ...body, revision: 1 })
    .expect(409);
  saved = (
    await admin
      .put("/api/v1/features/admin/content/" + body.slug)
      .set("x-csrf-token", adminCsrf)
      .send({ ...body, state: "published", revision: saved.revision })
      .expect(200)
  ).body.item;
  assert.equal(
    (
      await request(app)
        .get("/api/v1/features/public/content?kind=faq")
        .expect(200)
    ).body.items.length,
    1,
  );
  const versions = (
    await admin
      .get(`/api/v1/features/admin/content/${saved._id}/versions`)
      .expect(200)
  ).body.items;
  assert.equal(versions.length, 3);
  saved = (
    await admin
      .post(
        `/api/v1/features/admin/content/${saved._id}/versions/${versions[2]._id}/restore`,
      )
      .set("x-csrf-token", adminCsrf)
      .send({ revision: saved.revision })
      .expect(200)
  ).body.item;
  assert.equal(saved.state, "draft");
  await admin
    .delete(`/api/v1/features/admin/content/${saved._id}`)
    .set("x-csrf-token", adminCsrf)
    .send({ revision: saved.revision })
    .expect(200);
  await admin
    .post(`/api/v1/features/admin/content/${saved._id}/restore`)
    .set("x-csrf-token", adminCsrf)
    .send({})
    .expect(200);
  assert.equal((await Content.findById(saved._id)).state, "draft");
});
test("unsafe content is rejected; homepage sections and disabled intake categories work", async () => {
  const body = {
    slug: "hero",
    kind: "section",
    title: "Synthetic homepage section",
    titleBn: "পরীক্ষার section",
    body: "Synthetic general information",
    bodyBn: "",
    url: "",
    page: "home",
    rank: 5,
    enabled: false,
    state: "published",
    publishAt: null,
    revision: 0,
  };
  await admin
    .put("/api/v1/features/admin/content/hero")
    .set("x-csrf-token", adminCsrf)
    .send({
      ...body,
      body: "Contact someone@example.test for private information",
    })
    .expect(400);
  await admin
    .put("/api/v1/features/admin/content/hero")
    .set("x-csrf-token", adminCsrf)
    .send({ ...body, url: "javascript:alert(1)" })
    .expect(400);
  await admin
    .put("/api/v1/features/admin/content/hero")
    .set("x-csrf-token", adminCsrf)
    .send(body)
    .expect(200);
  assert.equal(
    (await request(app).get("/api/v1/features/public/layout").expect(200)).body
      .items[0].enabled,
    false,
  );
  await admin
    .put("/api/v1/features/admin/content/other")
    .set("x-csrf-token", adminCsrf)
    .send({ ...body, slug: "other", kind: "category", page: "all" })
    .expect(200);
  await request(app)
    .post("/api/v1/reports")
    .send({ ...input, incidentType: "other" })
    .expect(400);
  assert.ok(
    (
      await request(app).get("/api/v1/features/public/categories").expect(200)
    ).body.items.some((c) => c.slug === "other" && !c.enabled),
  );
});
test("availability and bulk assignment preserve transfer history; invalid bulk transitions are rejected", async () => {
  const c2 = (
    await request(app)
      .post("/api/v1/reports")
      .send({
        ...input,
        description: input.description + " Additional synthetic record.",
      })
      .expect(201)
  ).body;
  await mod
    .patch("/api/v1/features/staff/availability")
    .set("x-csrf-token", modCsrf)
    .send({
      available: false,
      unavailableUntil: new Date(Date.now() + 86400000).toISOString(),
    })
    .expect(200);
  await admin
    .post("/api/v1/features/admin/bulk-assign")
    .set("x-csrf-token", adminCsrf)
    .send({ ids: [c.id, c2.id], staffId: String(modUser._id) })
    .expect(400);
  await mod
    .patch("/api/v1/features/staff/availability")
    .set("x-csrf-token", modCsrf)
    .send({ available: true, unavailableUntil: null })
    .expect(200);
  await admin
    .post("/api/v1/features/admin/bulk-assign")
    .set("x-csrf-token", adminCsrf)
    .send({ ids: [c.id, c2.id], staffId: String(modUser._id) })
    .expect(200);
  assert.equal(
    String((await Report.findById(c2.id)).assignedTo),
    String(modUser._id),
  );
  assert.ok(await Assignment.exists({ reportId: c2.id, toId: modUser._id }));
  await admin
    .post("/api/v1/features/admin/bulk-status")
    .set("x-csrf-token", adminCsrf)
    .send({
      ids: [c.id, c2.id],
      status: "resolved",
      message: "Synthetic bulk transition",
    })
    .expect(409);
  assert.equal((await Report.findById(c2.id)).status, "submitted");
  await admin
    .post("/api/v1/features/admin/bulk-status")
    .set("x-csrf-token", adminCsrf)
    .send({
      ids: [c2.id],
      status: "screening",
      message: "Synthetic bulk screening",
    })
    .expect(200);
  const load = (await mod.get("/api/v1/features/staff/workload").expect(200))
    .body;
  assert.equal(load.items.length, 1);
  assert.ok(load.items[0].pending >= 2);
});
test("resumable encrypted chunks survive interrupted uploads and finalize idempotently", async () => {
  const file = Buffer.alloc(6 * 1024 * 1024, 0x61);
  Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex").copy(
    file,
  );
  const fingerprint = createHash("sha256").update(file).digest("hex"),
    prefix = `/api/v1/features/reporter/${c.id}`;
  const u = (
    await request(app)
      .post(prefix + "/uploads")
      .set(headers())
      .send({ fingerprint, size: file.length })
      .expect(200)
  ).body;
  await request(app)
    .post(prefix + `/uploads/${u.id}/complete`)
    .set(headers())
    .send({})
    .expect(409);
  await request(app)
    .put(prefix + `/uploads/${u.id}/chunks/0`)
    .set(headers())
    .set("Content-Type", "application/octet-stream")
    .send(file.subarray(0, u.chunkSize))
    .expect(200);
  const encrypted = await fs.readFile(
    path.join(chunkDirectory(u.id), "0"),
    "utf8",
  );
  assert.notEqual(
    encrypted.slice(0, 100),
    file.subarray(0, 75).toString("base64"),
  );
  assert.deepEqual(unseal(encrypted, true), file.subarray(0, u.chunkSize));
  const resume = (
    await request(app)
      .post(prefix + "/uploads")
      .set(headers())
      .send({ fingerprint, size: file.length })
      .expect(200)
  ).body;
  assert.equal(resume.id, u.id);
  assert.deepEqual(resume.received, [0]);
  await request(app)
    .put(prefix + `/uploads/${u.id}/chunks/0`)
    .set(headers())
    .set("Content-Type", "application/octet-stream")
    .send(file.subarray(0, u.chunkSize))
    .expect(200);
  await request(app)
    .put(prefix + `/uploads/${u.id}/chunks/1`)
    .set(headers())
    .set("Content-Type", "application/octet-stream")
    .send(file.subarray(u.chunkSize))
    .expect(200);
  const completed = (
    await request(app)
      .post(prefix + `/uploads/${u.id}/complete`)
      .set(headers())
      .send({})
      .expect(201)
  ).body;
  assert.equal(completed.malwareScanStatus, "quarantined");
  const retry = (
    await request(app)
      .post(prefix + `/uploads/${u.id}/complete`)
      .set(headers())
      .send({})
      .expect(200)
  ).body;
  assert.equal(retry.id, completed.id);
  assert.equal(
    await Evidence.countDocuments({ reportId: c.id, contentHash: fingerprint }),
    1,
  );
  await assert.rejects(fs.stat(chunkDirectory(u.id)));
  await mod
    .get(`/api/v1/features/staff/evidence/${completed.id}/preview`)
    .expect(409);
  await Evidence.updateOne(
    { _id: completed.id },
    { $set: { malwareScanStatus: "clean" } },
  );
  const download = await mod
    .get(`/api/v1/features/staff/evidence/${completed.id}/preview`)
    .buffer(true)
    .parse((res, done) => {
      const h = createHash("sha256");
      let count = 0;
      res.on("data", (b) => {
        count += b.length;
        h.update(b);
      });
      res.on("end", () => done(null, { count, hash: h.digest("hex") }));
      res.on("error", done);
    })
    .expect(200);
  assert.equal(download.body.count, file.length);
  assert.equal(download.body.hash, fingerprint);
  await mod
    .post(`/api/v1/features/staff/reports/${c.id}/messages`)
    .set("x-csrf-token", modCsrf)
    .send({
      channel: "internal",
      text: "Synthetic note at a video timestamp",
      evidenceId: completed.id,
      seconds: 12.5,
    })
    .expect(201);
});
test("resumable uploads reject wrong owners, wrong sizes, changed chunks and identity mismatch", async () => {
  const prefix = `/api/v1/features/reporter/${c.id}`,
    file = Buffer.from("Synthetic non-media content"),
    u = (
      await request(app)
        .post(prefix + "/uploads")
        .set(headers())
        .send({ fingerprint: digest(file), size: file.length })
        .expect(200)
    ).body;
  await request(app)
    .get(prefix + `/uploads/${u.id}`)
    .set({
      ...headers(),
      "x-tracking-secret": "wrong-tracking-secret-long-enough",
    })
    .expect(404);
  await request(app)
    .get(prefix + "/uploads")
    .set({
      ...headers(),
      "x-tracking-secret": "wrong-tracking-secret-long-enough",
    })
    .expect(404);
  const pending = (
    await request(app)
      .get(prefix + "/uploads")
      .set(headers())
      .expect(200)
  ).body;
  assert.ok(pending.items.some((item) => item._id === u.id));
  assert.ok(
    pending.items.every(
      (item) => !item.fingerprint && !item.staffId && !item.reportId,
    ),
  );
  await request(app)
    .put(prefix + `/uploads/${u.id}/chunks/0`)
    .set(headers())
    .set("Content-Type", "application/octet-stream")
    .send(file.subarray(1))
    .expect(400);
  await request(app)
    .put(prefix + `/uploads/${u.id}/chunks/0`)
    .set(headers())
    .set("Content-Type", "application/octet-stream")
    .send(file)
    .expect(200);
  await request(app)
    .put(prefix + `/uploads/${u.id}/chunks/0`)
    .set(headers())
    .set("Content-Type", "application/octet-stream")
    .send(Buffer.alloc(file.length))
    .expect(409);
  await request(app)
    .post(prefix + `/uploads/${u.id}/complete`)
    .set(headers())
    .send({})
    .expect(400);
  await request(app)
    .delete(prefix + `/uploads/${u.id}`)
    .set(headers())
    .expect(200);
  assert.ok(
    !(
      await request(app)
        .get(prefix + "/uploads")
        .set(headers())
        .expect(200)
    ).body.items.some((item) => item._id === u.id),
  );
  const bad = (
    await request(app)
      .post(prefix + "/uploads")
      .set(headers())
      .send({ fingerprint: "a".repeat(64), size: file.length })
      .expect(200)
  ).body;
  await request(app)
    .put(prefix + `/uploads/${bad.id}/chunks/0`)
    .set(headers())
    .set("Content-Type", "application/octet-stream")
    .send(file)
    .expect(200);
  await request(app)
    .post(prefix + `/uploads/${bad.id}/complete`)
    .set(headers())
    .send({})
    .expect(400);
  await request(app)
    .delete(prefix + `/uploads/${bad.id}`)
    .set(headers())
    .expect(200);
});
test("account sessions, device alerts and permission changes enforce revocation", async () => {
  const aux = await Staff.create({
    name: "Synthetic Restricted Staff",
    email: "restricted@example.test",
    role: "moderator",
    passwordHash: await hash(password),
    mfaEnabled: false,
  });
  let agent = request.agent(app),
    csrf = await signin(agent, aux);
  await Report.updateOne({ _id: c.id }, { $set: { assignedTo: aux._id } });
  const baseline = await Notification.countDocuments({
    staffId: aux._id,
    kind: "security",
  });
  const other = request.agent(app),
    otherCsrf = await signin(other, aux);
  assert.equal(
    await Notification.countDocuments({ staffId: aux._id, kind: "security" }),
    baseline,
  );
  assert.equal(await KnownDevice.countDocuments({ staffId: aux._id }), 1);
  const account = (
    await agent.get("/api/v1/features/staff/account").expect(200)
  ).body;
  assert.equal(account.sessions.length, 2);
  assert.ok(account.sessions.some((s) => s.current));
  assert.ok(!JSON.stringify(account).includes("tokenHash"));
  assert.ok(account.logins.length >= 2);
  await agent
    .post("/api/v1/features/staff/sessions/revoke-others")
    .set("x-csrf-token", csrf)
    .send({})
    .expect(200);
  await other.get("/api/v1/features/staff/account").expect(401);
  await admin
    .patch(`/api/v1/features/admin/users/${aux._id}/access`)
    .set("x-csrf-token", adminCsrf)
    .send({
      deniedPermissions: ["review", "draft", "communicate", "export"],
      available: true,
      reason: "Synthetic role permission restriction for validation",
    })
    .expect(200);
  await agent.get("/api/v1/features/staff/account").expect(401);
  agent = request.agent(app);
  csrf = await signin(agent, aux);
  await agent.get("/api/v1/features/staff/export?format=csv").expect(403);
  await agent
    .patch(`/api/v1/staff/reports/${c.id}/public-draft`)
    .set("x-csrf-token", csrf)
    .send(draft)
    .expect(403);
  await agent
    .post(`/api/v1/features/staff/reports/${c.id}/messages`)
    .set("x-csrf-token", csrf)
    .send({ channel: "reporter", text: "Restricted action should be denied" })
    .expect(403);
  await admin
    .patch(`/api/v1/features/admin/users/${adminUser._id}/access`)
    .set("x-csrf-token", adminCsrf)
    .send({
      deniedPermissions: [],
      available: true,
      reason: "Self access should remain protected",
    })
    .expect(400);
  await Report.updateOne({ _id: c.id }, { $set: { assignedTo: modUser._id } });
});
test("safe CSV/PDF exports omit narratives, credentials, contacts and exact incident dates", async () => {
  const csv = await mod
    .get("/api/v1/features/staff/export?format=csv")
    .expect(200);
  assert.match(csv.text, /Submitted month/);
  for (const value of [
    input.description,
    input.area,
    c.secret,
    c.trackingId,
    input.incidentDate,
  ])
    assert.ok(!csv.text.includes(value));
  const pdf = await admin
    .get("/api/v1/features/staff/export?format=pdf")
    .buffer(true)
    .expect(200);
  assert.equal(pdf.headers["content-type"], "application/pdf");
  assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
  assert.ok(
    await Audit.exists({ action: "report.export", actorId: adminUser._id }),
  );
});
test("intake setting pauses reporting, operations expose safe status, and client errors accept no private payload", async () => {
  await mod.get("/api/v1/features/admin/operations").expect(403);
  await admin
    .put("/api/v1/features/admin/settings")
    .set("x-csrf-token", adminCsrf)
    .send({
      intakeEnabled: false,
      backupEnabled: false,
      retentionEnabled: false,
      privacyDeadlineDays: 5,
    })
    .expect(200);
  await request(app).post("/api/v1/reports").send(input).expect(503);
  await admin
    .put("/api/v1/features/admin/settings")
    .set("x-csrf-token", adminCsrf)
    .send({
      intakeEnabled: true,
      backupEnabled: false,
      retentionEnabled: false,
      privacyDeadlineDays: 5,
    })
    .expect(200);
  await request(app)
    .post("/api/v1/features/public/errors")
    .send({
      code: "render_error",
      page: "public",
      narrative: "Must not be accepted",
    })
    .expect(400);
  await request(app)
    .post("/api/v1/features/public/errors")
    .send({ code: "render_error", page: "public" })
    .expect(200);
  const operations = (
    await admin.get("/api/v1/features/admin/operations").expect(200)
  ).body;
  assert.equal(operations.mail.configured, false);
  assert.equal(operations.scannerHealth.ok, false);
  assert.ok(
    operations.errors.some((e) => e.route === "client:public:render_error"),
  );
  assert.ok(!JSON.stringify(operations).includes(input.description));
});
test("encrypted backup job reports success; retention removes private feature records and evidence", async () => {
  process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const beforeFiles = await fs
    .readdir(fileURLToPath(new URL("../backups/", import.meta.url)))
    .catch(() => []);
  await admin
    .post("/api/v1/features/admin/operations/backup")
    .set("x-csrf-token", adminCsrf)
    .send({})
    .expect(200);
  assert.ok(await Job.exists({ kind: "backup", state: "succeeded" }));
  const dir = fileURLToPath(new URL("../backups/", import.meta.url));
  for (const name of await fs.readdir(dir))
    if (!beforeFiles.includes(name)) await fs.unlink(path.join(dir, name));
  const expired = await Report.create({
    trackingId: "CW-EXPIRED-SYNTHETIC",
    trackingSecretHash: await hash(randomToken()),
    incidentType: "other",
    districtCode: "dhaka",
    detailsEncrypted: seal({ description: "Expired synthetic information" }),
    expiresAt: new Date(Date.now() - 60000),
  });
  await Message.create({
    reportId: expired._id,
    channel: "reporter",
    kind: "message",
    textEncrypted: seal("Expired private message"),
  });
  await DraftVersion.create({
    reportId: expired._id,
    snapshotEncrypted: seal(draft),
  });
  await Notification.create({
    staffId: adminUser._id,
    reportId: expired._id,
    title: "Expired synthetic notification",
  });
  await admin
    .post("/api/v1/features/admin/operations/retention")
    .set("x-csrf-token", adminCsrf)
    .send({})
    .expect(200);
  assert.equal(await Report.exists({ _id: expired._id }), null);
  assert.equal(await Message.countDocuments({ reportId: expired._id }), 0);
  assert.equal(await DraftVersion.countDocuments({ reportId: expired._id }), 0);
  assert.equal(await Notification.countDocuments({ reportId: expired._id }), 0);
  assert.ok(
    await Audit.exists({
      action: "report.retention_delete",
      resourceId: String(expired._id),
    }),
  );
});
test("administrator selects bilingual hot news; public listing excludes drafts, schedules and withdrawn content", async () => {
  const body = {
    slug: "synthetic-hot-news",
    kind: "news",
    title: "Synthetic public news",
    titleBn: "পরীক্ষার প্রকাশিত সংবাদ",
    body: "Synthetic general information for a workflow test.",
    bodyBn: "কর্মপ্রক্রিয়া পরীক্ষার জন্য সাধারণ প্রকাশিত তথ্য।",
    url: "https://example.test/public-resource",
    page: "home",
    rank: 0,
    enabled: true,
    featured: true,
    state: "draft",
    publishAt: null,
    revision: 0,
  };
  await mod
    .put("/api/v1/features/admin/content/" + body.slug)
    .set("x-csrf-token", modCsrf)
    .send(body)
    .expect(403);
  await admin
    .put("/api/v1/features/admin/content/" + body.slug)
    .send(body)
    .expect(403);
  let saved = (
    await admin
      .put("/api/v1/features/admin/content/" + body.slug)
      .set("x-csrf-token", adminCsrf)
      .send(body)
      .expect(200)
  ).body.item;
  await request(app)
    .get("/api/v1/features/public/news/" + body.slug)
    .expect(404);
  await admin
    .put("/api/v1/features/admin/content/" + body.slug)
    .set("x-csrf-token", adminCsrf)
    .send({
      ...body,
      state: "published",
      titleBn: "",
      revision: saved.revision,
    })
    .expect(400);
  saved = (
    await admin
      .put("/api/v1/features/admin/content/" + body.slug)
      .set("x-csrf-token", adminCsrf)
      .send({
        ...body,
        state: "published",
        publishAt: new Date(Date.now() + 86400000).toISOString(),
        revision: saved.revision,
      })
      .expect(200)
  ).body.item;
  assert.equal(
    (
      await request(app)
        .get("/api/v1/features/public/news?featured=true")
        .expect(200)
    ).body.total,
    0,
  );
  saved = (
    await admin
      .put("/api/v1/features/admin/content/" + body.slug)
      .set("x-csrf-token", adminCsrf)
      .send({ ...body, state: "published", revision: saved.revision })
      .expect(200)
  ).body.item;
  const detail = (
    await request(app)
      .get("/api/v1/features/public/news/" + body.slug)
      .expect(200)
  ).body.item;
  assert.equal(detail.titleBn, body.titleBn);
  assert.equal(detail.body, body.body);
  assert.equal(detail.url, body.url);
  assert.ok(!detail._id && !detail.revision && !detail.deletedAt);
  for (let i = 1; i <= 11; i++)
    await Content.create({
      ...body,
      slug: `synthetic-hot-${i}`,
      state: "published",
      rank: i,
    });
  await Content.create({
    ...body,
    slug: "synthetic-unfeatured",
    featured: false,
    state: "published",
  });
  await Content.create({
    ...body,
    slug: "synthetic-disabled",
    enabled: false,
    state: "published",
  });
  const first = (
    await request(app)
      .get("/api/v1/features/public/news?featured=true")
      .expect(200)
  ).body;
  const second = (
    await request(app)
      .get("/api/v1/features/public/news?featured=true&page=2")
      .expect(200)
  ).body;
  assert.equal(first.total, 12);
  assert.equal(first.items.length, 10);
  assert.equal(second.items.length, 2);
  assert.equal(
    new Set([...first.items, ...second.items].map((n) => n.slug)).size,
    12,
  );
  assert.ok(
    !first.items
      .concat(second.items)
      .some(
        (n) =>
          n.slug === "synthetic-unfeatured" || n.slug === "synthetic-disabled",
      ),
  );
  assert.equal(
    (await request(app).get("/api/v1/features/public/news").expect(200)).body
      .total,
    13,
  );
  await admin
    .delete("/api/v1/features/admin/content/" + saved._id)
    .set("x-csrf-token", adminCsrf)
    .send({ revision: saved.revision })
    .expect(200);
  await request(app)
    .get("/api/v1/features/public/news/" + body.slug)
    .expect(404);
  await admin
    .post(`/api/v1/features/admin/content/${saved._id}/restore`)
    .set("x-csrf-token", adminCsrf)
    .send({})
    .expect(200);
  await request(app)
    .get("/api/v1/features/public/news/" + body.slug)
    .expect(404);
});

test("news search, category and date filters are literal and administrator deletion requires matching trash revision", async () => {
  const base = {
    slug: "synthetic-search-alert",
    kind: "news",
    title: "Market alert [special]",
    titleBn: "বাজারের বিশেষ সতর্কতা",
    body: "Synthetic general news information.",
    bodyBn: "পরীক্ষার সাধারণ সংবাদ বিবরণ।",
    url: "",
    page: "home",
    rank: 2,
    enabled: true,
    featured: true,
    newsCategory: "alert",
    district: "dhaka",
    state: "published",
    publishAt: "2026-10-01T00:00:00.000Z",
    revision: 0,
  };
  const saved = (
    await admin
      .put("/api/v1/features/admin/content/" + base.slug)
      .set("x-csrf-token", adminCsrf)
      .send(base)
      .expect(200)
  ).body.item;
  const result = (
    await request(app)
      .get("/api/v1/features/public/news")
      .query({
        q: "[special]",
        category: "alert",
        district: "dhaka",
        from: "2026-10-01",
        to: "2026-10-01",
      })
      .expect(200)
  ).body;
  assert.equal(result.total, 1);
  assert.equal(result.items[0].slug, base.slug);
  assert.equal(
    (
      await request(app)
        .get("/api/v1/features/public/news")
        .query({ q: ".*" })
        .expect(200)
    ).body.total,
    0,
  );
  await request(app)
    .get("/api/v1/features/public/news?category=invalid")
    .expect(400);
  const detail = (
    await request(app)
      .get("/api/v1/features/public/news/" + base.slug)
      .expect(200)
  ).body;
  assert.ok(!detail.related.some((i) => i.slug === base.slug));
  await admin
    .delete(`/api/v1/features/admin/content/${saved._id}/permanent`)
    .set("x-csrf-token", adminCsrf)
    .send({ slug: base.slug, revision: saved.revision })
    .expect(409);
  await admin
    .delete(`/api/v1/features/admin/content/${saved._id}`)
    .set("x-csrf-token", adminCsrf)
    .send({ revision: saved.revision })
    .expect(200);
  await request(app)
    .get("/api/v1/features/public/news/" + base.slug)
    .expect(404);
  await admin
    .delete(`/api/v1/features/admin/content/${saved._id}/permanent`)
    .set("x-csrf-token", adminCsrf)
    .send({ slug: "wrong-name", revision: saved.revision + 1 })
    .expect(409);
  await admin
    .delete(`/api/v1/features/admin/content/${saved._id}/permanent`)
    .set("x-csrf-token", adminCsrf)
    .send({ slug: base.slug, revision: saved.revision + 1 })
    .expect(200);
  assert.equal(
    await ContentVersion.countDocuments({ contentId: saved._id }),
    0,
  );
  const queue = (
    await admin.get("/api/v1/features/admin/work-queue").expect(200)
  ).body;
  assert.ok(Number.isInteger(queue.submitted));
  await mod.get("/api/v1/features/admin/work-queue").expect(403);
});

test("editorial media requires administrator CSRF, actual clean scan and a published eligible news reference", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2kAAAAASUVORK5CYII=",
    "base64",
  );
  await mod
    .post("/api/v1/features/admin/news-media")
    .set("x-csrf-token", modCsrf)
    .attach("file", png, "photo.png")
    .expect(403);
  await admin
    .post("/api/v1/features/admin/news-media")
    .attach("file", png, "photo.png")
    .expect(403);
  await admin
    .post("/api/v1/features/admin/news-media")
    .set("x-csrf-token", adminCsrf)
    .attach("file", Buffer.from("<script>bad</script>"), "photo.png")
    .expect(400);
  const scanner = net.createServer((socket) => {
    let buffer = Buffer.alloc(0),
      command = false;
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!command) {
        const end = buffer.indexOf(0);
        if (end < 0) return;
        buffer = buffer.subarray(end + 1);
        command = true;
      }
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        if (buffer.length < size + 4) return;
        buffer = buffer.subarray(size + 4);
        if (size === 0) {
          socket.end("stream: OK\0");
          return;
        }
      }
    });
  });
  await new Promise((resolve) => scanner.listen(0, "127.0.0.1", resolve));
  const oldHost = process.env.CLAMAV_HOST,
    oldPort = process.env.CLAMAV_PORT;
  process.env.CLAMAV_HOST = "127.0.0.1";
  process.env.CLAMAV_PORT = String(scanner.address().port);
  try {
    const media = (
      await admin
        .post("/api/v1/features/admin/news-media")
        .set("x-csrf-token", adminCsrf)
        .attach("file", png, "photo.png")
        .expect(201)
    ).body;
    await request(app).get(media.url).expect(404);
    await admin
      .get(`/api/v1/features/admin/news-media/${media.id}`)
      .expect(200);
    const body = {
      slug: "synthetic-media-news",
      kind: "news",
      title: "Synthetic media story",
      titleBn: "পরীক্ষার ছবিসহ সংবাদ",
      body: "Synthetic public media information.",
      bodyBn: "পরীক্ষার সাধারণ ছবির বিবরণ।",
      url: "",
      page: "home",
      rank: 0,
      enabled: true,
      featured: true,
      state: "draft",
      publishAt: null,
      revision: 0,
      coverMediaId: media.id,
    };
    let item = (
      await admin
        .put("/api/v1/features/admin/content/" + body.slug)
        .set("x-csrf-token", adminCsrf)
        .send(body)
        .expect(200)
    ).body.item;
    await request(app).get(media.url).expect(404);
    item = (
      await admin
        .put("/api/v1/features/admin/content/" + body.slug)
        .set("x-csrf-token", adminCsrf)
        .send({ ...body, revision: item.revision, state: "published" })
        .expect(200)
    ).body.item;
    const response = await request(app).get(media.url).expect(200);
    assert.match(response.headers["content-type"], /image\/png/);
    assert.deepEqual(response.body, png);
    await admin
      .delete(`/api/v1/features/admin/content/${item._id}`)
      .set("x-csrf-token", adminCsrf)
      .send({ revision: item.revision })
      .expect(200);
    await request(app).get(media.url).expect(404);
    await admin
      .put("/api/v1/features/admin/content/invalid-media-type")
      .set("x-csrf-token", adminCsrf)
      .send({
        ...body,
        slug: "invalid-media-type",
        coverMediaId: null,
        videoMediaId: media.id,
      })
      .expect(400);
  } finally {
    if (oldHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = oldHost;
    if (oldPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = oldPort;
    await new Promise((resolve) => scanner.close(resolve));
  }
});

test("public page information stores both languages and validates Bengali identity patterns", async () => {
  const body = {
    title: "Synthetic platform overview",
    titleBn: "পরীক্ষার প্ল্যাটফর্ম পরিচিতি",
    body: "Synthetic public platform information for validation.",
    bodyBn: "যাচাইয়ের জন্য পরীক্ষার সাধারণ প্রকাশিত তথ্য।",
    published: true,
  };
  await admin
    .put("/api/v1/admin/page-info/home")
    .set("x-csrf-token", adminCsrf)
    .send(body)
    .expect(200);
  const item = (
    await request(app).get("/api/v1/public/page-info/home").expect(200)
  ).body.item;
  assert.equal(item.titleBn, body.titleBn);
  assert.equal(item.body, body.body);
  assert.ok(!item._id && item.published === undefined);
  await admin
    .put("/api/v1/admin/page-info/home")
    .set("x-csrf-token", adminCsrf)
    .send({ ...body, bodyBn: "ব্যক্তিগত নম্বর ০১৭১২৩৪৫৬৭৮" })
    .expect(400);
  assert.equal(
    (await request(app).get("/api/v1/public/page-info/home").expect(200)).body
      .item.bodyBn,
    body.bodyBn,
  );
});

test("email verification and password recovery use expiring one-use tokens and invalidate sessions", async () => {
  process.env.SMTP_HOST = "smtp.example.test";
  process.env.SMTP_FROM = "no-reply@example.test";
  const user = await Staff.create({
      name: "Synthetic Recovery Staff",
      email: "recovery@example.test",
      role: "moderator",
      passwordHash: await hash(password),
      mfaEnabled: false,
    }),
    agent = request.agent(app),
    csrf = await signin(agent, user);
  await agent
    .post("/api/v1/features/staff/account/verify/request")
    .set("x-csrf-token", csrf)
    .send({})
    .expect(200);
  let queued = await Mail.findOne({
    staffId: user._id,
    purpose: "Email verification",
  });
  const envelope = unseal(queued.envelopeEncrypted),
    token = new URL(envelope.text.match(/https?:\/\/\S+/)[0]).hash.split(
      "token=",
    )[1];
  assert.equal(
    await AccountToken.countDocuments({ tokenHash: digest(token) }),
    1,
  );
  assert.ok(
    !JSON.stringify(
      (await request(app).get("/api/v1/features/account/status").expect(200))
        .body,
    ).includes(token),
  );
  await request(app)
    .post("/api/v1/features/account/verify")
    .send({ token })
    .expect(200);
  await request(app)
    .post("/api/v1/features/account/verify")
    .send({ token })
    .expect(400);
  assert.ok((await Staff.findById(user._id)).emailVerifiedAt);
  await request(app)
    .post("/api/v1/features/account/reset/request")
    .send({ email: user.email })
    .expect(200);
  queued = await Mail.findOne({
    staffId: user._id,
    purpose: "Password recovery",
  });
  const resetToken = new URL(
    unseal(queued.envelopeEncrypted).text.match(/https?:\/\/\S+/)[0],
  ).hash.split("token=")[1];
  const nextPassword = "Synthetic-new-password-9927";
  await request(app)
    .post("/api/v1/features/account/reset/complete")
    .send({ token: resetToken, password: nextPassword })
    .expect(200);
  await request(app)
    .post("/api/v1/features/account/reset/complete")
    .send({ token: resetToken, password: nextPassword })
    .expect(400);
  await agent.get("/api/v1/features/staff/account").expect(401);
  await signin(request.agent(app), user, nextPassword);
  const messages = [];
  await operationTick({
    mailTransport: {
      sendMail: async (m) => {
        messages.push(m);
        return { messageId: "synthetic-local-mail" };
      },
    },
  });
  assert.ok(messages.length >= 2);
  assert.equal(
    await Mail.countDocuments({
      state: "sent",
      envelopeEncrypted: { $exists: true },
    }),
    0,
  );
  process.env.SMTP_HOST = "";
  process.env.SMTP_FROM = "";
});
