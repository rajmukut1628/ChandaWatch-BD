import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { authenticator } from "otplib";
process.env.NODE_ENV = "test";
process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.AUDIT_KEY = randomBytes(32).toString("hex");
process.env.REPORTING_ENABLED = "true";
process.env.SCANNER_MODE = "quarantine";
process.env.STORAGE_DIR = fileURLToPath(
  new URL("../.cache/public-test-storage/", import.meta.url),
);
const { app } = await import("../src/app.js");
const { Report, Staff, Evidence, Session } = await import("../src/models.js");
const { hash, seal, randomToken } = await import("../src/crypto.js");
const { upazilas } = await import("../src/geography.js");
let mongo,
  moderator,
  senior,
  modUser,
  seniorUser,
  modCsrf,
  seniorCsrf,
  c,
  publicId;
const upazila = upazilas.find((u) => u.districtCode === "dhaka").code;
const input = {
  incidentType: "extortion_demand",
  district: "dhaka",
  upazila,
  area: "PRIVATE AREA",
  incidentDate: "2026-01-01",
  description:
    "PRIVATE DESCRIPTION of a synthetic incident for automated testing only.",
  privacyAcknowledged: true,
  publicConsent: true,
};
const draft = {
  title: "Synthetic publication test account",
  summary:
    "A safe synthetic account prepared for testing the public publication workflow.",
  body: "This synthetic account contains only safe public text. It is used exclusively in the isolated test database and does not describe a real incident.",
  displayUpazila: true,
};
before(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { launchTimeout: 30000 },
    binary: {
      version: "7.0.14",
      downloadDir: fileURLToPath(
        new URL("../.cache/binaries", import.meta.url),
      ),
    },
  });
  await mongoose.connect(mongo.getUri());
  for (const m of Object.values(mongoose.models)) await m.init();
  async function login(role) {
    const secret = authenticator.generateSecret(),
      u = await Staff.create({
        name: role,
        email: role + "@public-test.example",
        role,
        passwordHash: await hash("publication-test-password"),
        mfaSecretEncrypted: seal(secret),
      }),
      agent = request.agent(app);
    const r = await agent
      .post("/api/v1/staff/auth/login")
      .send({
        email: u.email,
        password: "publication-test-password",
      })
      .expect(200);
    return { agent, u, csrf: r.body.csrfToken };
  }
  const m = await login("moderator"),
    s = await login("senior_reviewer");
  moderator = m.agent;
  modUser = m.u;
  modCsrf = m.csrf;
  senior = s.agent;
  seniorUser = s.u;
  seniorCsrf = s.csrf;
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  await fs.rm(process.env.STORAGE_DIR, { recursive: true, force: true });
});
test("district/upazila pair and public consent validation", async () => {
  await request(app)
    .post("/api/v1/reports")
    .send({
      ...input,
      upazila: upazilas.find((u) => u.districtCode !== "dhaka").code,
    })
    .expect(400);
  const r = await request(app).post("/api/v1/reports").send(input).expect(201);
  c = r.body;
  await Report.updateOne(
    { _id: c.id },
    {
      $set: {
        assignedTo: modUser._id,
        status: "reviewed",
        redactedSummary: "Safe redacted review summary",
        lastModerator: modUser._id,
      },
    },
  );
  await Report.updateOne({ _id: c.id }, { $set: { publicConsent: false } });
  await moderator
    .patch("/api/v1/staff/reports/" + c.id + "/public-draft")
    .set("x-csrf-token", modCsrf)
    .send(draft)
    .expect(409);
  await Report.updateOne({ _id: c.id }, { $set: { publicConsent: true } });
});
test("draft redaction, independent approval and private-field whitelist", async () => {
  await moderator
    .patch("/api/v1/staff/reports/" + c.id + "/public-draft")
    .set("x-csrf-token", modCsrf)
    .send({ ...draft, body: draft.body + " private@example.com" })
    .expect(400);
  await moderator
    .patch("/api/v1/staff/reports/" + c.id + "/public-draft")
    .set("x-csrf-token", modCsrf)
    .send({ ...draft, body: draft.body + " ০১৭১২৩৪৫৬৭৮" })
    .expect(400);
  await moderator
    .patch("/api/v1/staff/reports/" + c.id + "/public-draft")
    .set("x-csrf-token", modCsrf)
    .send(draft)
    .expect(200);
  publicId = (await Report.findById(c.id)).publicEntry.publicId;
  await request(app)
    .get("/api/v1/public/cases/" + publicId)
    .expect(404);
  const review = {
    decision: "approve",
    notes: "Privacy reviewed with no identifying information.",
    publishPublic: true,
    redactionConfirmed: true,
  };
  await senior
    .post("/api/v1/staff/reports/" + c.id + "/review")
    .set("x-csrf-token", seniorCsrf)
    .send({ ...review, redactionConfirmed: false })
    .expect(400);
  await Report.updateOne(
    { _id: c.id },
    { $set: { "publicEntry.preparedBy": seniorUser._id } },
  );
  await senior
    .post("/api/v1/staff/reports/" + c.id + "/review")
    .set("x-csrf-token", seniorCsrf)
    .send(review)
    .expect(403);
  await Report.updateOne(
    { _id: c.id },
    { $set: { "publicEntry.preparedBy": modUser._id } },
  );
  await senior
    .post("/api/v1/staff/reports/" + c.id + "/review")
    .set("x-csrf-token", seniorCsrf)
    .send({
      ...review,
      verificationLevel: "independently_verified",
      verificationNote: "too short",
    })
    .expect(400);
  await senior
    .post("/api/v1/staff/reports/" + c.id + "/review")
    .set("x-csrf-token", seniorCsrf)
    .send(review)
    .expect(200);
  const res = await request(app)
    .get("/api/v1/public/cases/" + publicId)
    .expect(200);
  assert.equal(res.body.entry.upazila, null);
  assert.equal(res.body.entry.verificationLevel, "reviewed");
  for (const hidden of [
    c.id,
    c.trackingId,
    c.secret,
    input.description,
    input.area,
    String(modUser._id),
  ])
    assert.ok(!JSON.stringify(res.body).includes(hidden));
});
test("latest ten and next page, strict literal filters and privacy threshold", async () => {
  const base = (await Report.findById(c.id)).toObject();
  for (let i = 0; i < 11; i++) {
    const { _id, createdAt, updatedAt, __v, ...fields } = base;
    await Report.create({
      ...fields,
      trackingId: "CW-SYNTHETIC-" + i,
      publicEntry: {
        ...fields.publicEntry,
        publicId: randomToken(18),
        title:
          i === 0 ? "Literal [.*] synthetic example" : "Synthetic account " + i,
        publishedAt: new Date(Date.now() + i * 1000),
      },
    });
  }
  const first = (await request(app).get("/api/v1/public/cases").expect(200))
      .body,
    second = (await request(app).get("/api/v1/public/cases?page=2").expect(200))
      .body;
  assert.equal(first.items.length, 10);
  assert.equal(first.total, 12);
  assert.equal(first.pageSize, 10);
  assert.equal(second.items.length, 2);
  assert.equal(
    new Set([...first.items, ...second.items].map((r) => r.id)).size,
    12,
  );
  assert.ok(first.items.every((r) => r.upazila?.code === upazila));
  assert.ok(first.items.every((r) => !("body" in r)));
  const literal = (
    await request(app)
      .get("/api/v1/public/cases?search=" + encodeURIComponent("[.*]"))
      .expect(200)
  ).body;
  assert.equal(literal.total, 1);
  await request(app).get("/api/v1/public/cases?page=0").expect(400);
  await request(app).get("/api/v1/public/cases?limit=99").expect(400);
  await request(app).get("/api/v1/public/cases?district=invalid").expect(400);
  const filtered = (
    await request(app)
      .get(
        "/api/v1/public/cases?district=dhaka&upazila=" +
          upazila +
          "&from=2026-01&to=2026-01",
      )
      .expect(200)
  ).body;
  assert.equal(filtered.total, 12);
});
test("credential-protected consent withdrawal and expiry remove public accounts", async () => {
  await request(app)
    .patch("/api/v1/reports/" + c.id + "/public-consent")
    .send({ consent: false })
    .expect(400);
  const headers = {
    "x-tracking-id": c.trackingId,
    "x-tracking-secret": c.secret,
  };
  await request(app)
    .patch("/api/v1/reports/" + c.id + "/public-consent")
    .set(headers)
    .send({ consent: false })
    .expect(200);
  await request(app)
    .get("/api/v1/public/cases/" + publicId)
    .expect(404);
  await request(app)
    .patch("/api/v1/reports/" + c.id + "/public-consent")
    .set(headers)
    .send({ consent: true })
    .expect(200);
  await request(app)
    .get("/api/v1/public/cases/" + publicId)
    .expect(404);
  await Report.updateMany(
    { _id: { $ne: c.id } },
    { $set: { expiresAt: new Date(0) } },
  );
  assert.equal(
    (await request(app).get("/api/v1/public/cases").expect(200)).body.total,
    0,
  );
});
test("evidence retry is idempotent and encrypted, mismatched content is denied", async () => {
  const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5kAAAAASUVORK5CYII=",
      "base64",
    ),
    headers = { "x-tracking-id": c.trackingId, "x-tracking-secret": c.secret };
  const a = await request(app)
      .post("/api/v1/reports/" + c.id + "/evidence")
      .set(headers)
      .attach("file", png, "test.png")
      .expect(201),
    b = await request(app)
      .post("/api/v1/reports/" + c.id + "/evidence")
      .set(headers)
      .attach("file", png, "retry.png")
      .expect(200);
  assert.equal(a.body.id, b.body.id);
  assert.equal(b.body.alreadyUploaded, true);
  assert.equal(await Evidence.countDocuments({ reportId: c.id }), 1);
  assert.equal((await Report.findById(c.id)).evidenceCount, 1);
  await request(app)
    .post("/api/v1/reports/" + c.id + "/evidence")
    .set(headers)
    .attach("file", Buffer.from("fake executable"), "fake.mp4")
    .expect(400);
});
test("CSRF remains usable across tabs and idle sessions expire", async () => {
  const a = await senior.get("/api/v1/staff/auth/me").expect(200),
    b = await senior.get("/api/v1/staff/auth/me").expect(200);
  assert.equal(a.body.csrfToken, seniorCsrf);
  assert.equal(b.body.csrfToken, seniorCsrf);
  await moderator.get("/api/v1/admin/security").expect(403);
  await Session.updateMany(
    { staffId: seniorUser._id },
    { $set: { lastSeenAt: new Date(Date.now() - 31 * 60000) } },
  );
  await senior.get("/api/v1/staff/auth/me").expect(401);
});
test("five failed sign-ins persist account lockout", async () => {
  const secret = authenticator.generateSecret(),
    u = await Staff.create({
      name: "Lock test",
      email: "lock@public-test.example",
      role: "moderator",
      passwordHash: await hash("correct-test-password"),
      mfaSecretEncrypted: seal(secret),
    });
  for (let i = 0; i < 5; i++)
    await request(app)
      .post("/api/v1/staff/auth/login")
      .send({
        email: u.email,
        password: "wrong-test-password",
      })
      .expect(401);
  const locked = await Staff.findById(u._id);
  assert.equal(locked.failedLoginCount, 5);
  assert.ok(locked.lockedUntil > new Date());
  await request(app)
    .post("/api/v1/staff/auth/login")
    .send({
      email: u.email,
      password: "correct-test-password",
    })
    .expect(401);
});
