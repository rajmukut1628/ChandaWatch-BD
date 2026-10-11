import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { authenticator } from "otplib";
import { spawn } from "node:child_process";
process.env.STORAGE_DIR = fileURLToPath(
  new URL("../.cache/test-storage/", import.meta.url),
);
process.env.NODE_ENV = "test";
process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.AUDIT_KEY = randomBytes(32).toString("hex");
process.env.REPORTING_ENABLED = "true";
process.env.SCANNER_MODE = "quarantine";
const { app } = await import("../src/app.js");
const { Report, Staff, Audit, Evidence } = await import("../src/models.js");
const { hash, seal, unseal } = await import("../src/crypto.js");
let mongo,
  admin,
  moderator,
  senior,
  adminCsrf,
  moderatorCsrf,
  seniorCsrf,
  modUser,
  c;
const input = {
  incidentType: "extortion_demand",
  district: "dhaka",
  area: "Mirpur",
  incidentDate: "2026-01-01",
  description:
    "A demand was made at the business premises during the afternoon.",
  privacyAcknowledged: true,
  contactRequested: true,
  contact: "private@example.test",
  demandedAmount: 1000,
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
  for (const model of Object.values(mongoose.models)) await model.init();
  async function login(role) {
    const secret = authenticator.generateSecret(),
      u = await Staff.create({
        name: role,
        email: role + "@example.test",
        passwordHash: await hash("secure-testing-password"),
        role,
        mfaSecretEncrypted: seal(secret),
      });
    const agent = request.agent(app);
    const res = await agent
      .post("/api/v1/staff/auth/login")
      .send({
        email: u.email,
        password: "secure-testing-password",
      })
      .expect((res) => assert.equal(res.status, 200, res.body.error));
    return { agent, csrf: res.body.csrfToken, u };
  }
  const a = await login("super_admin"),
    m = await login("moderator"),
    s = await login("senior_reviewer");
  admin = a.agent;
  adminCsrf = a.csrf;
  moderator = m.agent;
  moderatorCsrf = m.csrf;
  modUser = m.u;
  senior = s.agent;
  seniorCsrf = s.csrf;
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  await fs.rm(process.env.STORAGE_DIR, { recursive: true, force: true });
});
test("report validation and encrypted storage, random tracking credentials", async () => {
  await request(app)
    .post("/api/v1/reports")
    .send({ ...input, privacyAcknowledged: false })
    .expect(400);
  await request(app)
    .post("/api/v1/reports")
    .send({ ...input, district: "unknown" })
    .expect(400);
  const res = await request(app)
    .post("/api/v1/reports")
    .send(input)
    .expect(201);
  c = res.body;
  assert.ok(c.secret.length >= 40);
  const r = await Report.findById(c.id);
  assert.notEqual(r.trackingSecretHash, c.secret);
  assert.ok(!r.detailsEncrypted.includes(input.description));
  assert.equal(unseal(r.detailsEncrypted).contact, input.contact);
});
test("tracking requires both credentials and never exposes sensitive details", async () => {
  await request(app)
    .post("/api/v1/reports/track")
    .send({
      trackingId: c.trackingId,
      secret: "wrong-secret-with-enough-length",
    })
    .expect(404);
  const res = await request(app)
    .post("/api/v1/reports/track")
    .send({ trackingId: c.trackingId, secret: c.secret })
    .expect(200);
  assert.equal(res.body.status, "submitted");
  assert.ok(!JSON.stringify(res.body).includes(input.description));
  assert.ok(!JSON.stringify(res.body).includes(input.contact));
});
test("unauthenticated access and cross-origin submissions denied", async () => {
  const security = await admin.get("/api/v1/admin/security").expect(200);
  assert.equal(security.body.idleMinutes, 30);
  assert.equal(security.body.scanner, "quarantine");
  await request(app).get("/api/v1/staff/reports").expect(401);
  await request(app).get("/api/v1/admin/users").expect(401);
  await request(app)
    .post("/api/v1/reports")
    .set("Origin", "https://evil.example")
    .send(input)
    .expect(403);
});
test("moderator assignment, least privilege, CSRF and status transitions", async () => {
  await moderator.get("/api/v1/staff/reports/" + c.id).expect(403);
  await admin
    .patch("/api/v1/admin/reports/" + c.id + "/assign")
    .send({ staffId: String(modUser._id) })
    .expect(403);
  await admin
    .patch("/api/v1/admin/reports/" + c.id + "/assign")
    .set("x-csrf-token", adminCsrf)
    .send({ staffId: String(modUser._id) })
    .expect(200);
  const r = await moderator.get("/api/v1/staff/reports/" + c.id).expect(200);
  assert.equal(r.body.report.contact, undefined);
  assert.equal(r.body.report.trackingSecretHash, undefined);
  await moderator.get("/api/v1/admin/users").expect(403);
  await moderator
    .patch("/api/v1/staff/reports/" + c.id + "/status")
    .set("x-csrf-token", moderatorCsrf)
    .send({ status: "resolved", message: "Resolved." })
    .expect(409);
  for (const status of ["screening", "under_review", "reviewed"])
    await moderator
      .patch("/api/v1/staff/reports/" + c.id + "/status")
      .set("x-csrf-token", moderatorCsrf)
      .send({
        status,
        message: "Your report is being reviewed.",
        redactedSummary: "An anonymous business report from Dhaka.",
      })
      .expect(200);
});
test("only independent senior reviewer can approve publication", async () => {
  await moderator
    .post("/api/v1/staff/reports/" + c.id + "/review")
    .set("x-csrf-token", moderatorCsrf)
    .send({ decision: "approve", notes: "Carefully reviewed." })
    .expect(403);
  await senior
    .post("/api/v1/staff/reports/" + c.id + "/review")
    .set("x-csrf-token", seniorCsrf)
    .send({
      decision: "approve",
      notes: "Reviewed evidence and redacted details independently.",
    })
    .expect(200);
  assert.equal((await Report.findById(c.id)).publicationApproved, true);
  const stats = await request(app).get("/api/v1/public/statistics").expect(200);
  assert.equal(stats.body.total, null);
  assert.deepEqual(stats.body.byDistrict, []);
});
test("evidence credentials, MIME sniffing, encrypted storage and quarantine", async () => {
  await request(app)
    .post("/api/v1/reports/" + c.id + "/evidence")
    .attach("file", Buffer.from("hello"), "bad.png")
    .expect(400);
  await request(app)
    .post("/api/v1/reports/" + c.id + "/evidence")
    .set("x-tracking-id", c.trackingId)
    .set("x-tracking-secret", c.secret)
    .attach("file", Buffer.from("<script>bad</script>"), "fake.png")
    .expect(400);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcZkAAAAASUVORK5CYII=",
    "base64",
  );
  const e = await request(app)
    .post("/api/v1/reports/" + c.id + "/evidence")
    .set("x-tracking-id", c.trackingId)
    .set("x-tracking-secret", c.secret)
    .attach("file", png, "photo.png")
    .expect(201);
  assert.equal(e.body.malwareScanStatus, "quarantined");
  await moderator.get("/api/v1/staff/evidence/" + e.body.id).expect(409);
  const stored = await Evidence.findById(e.body.id);
  assert.ok(stored.encryptedStorageKey);
  await senior
    .post("/api/v1/staff/reports/" + c.id + "/review")
    .set("x-csrf-token", seniorCsrf)
    .send({ decision: "approve", notes: "Second review attempt." })
    .expect(409);
});
test("privacy requests keep secrets out of stored payload and audit logs", async () => {
  const res = await request(app)
    .post("/api/v1/privacy/requests")
    .send({
      kind: "removal",
      trackingId: c.trackingId,
      secret: c.secret,
      contact: "safe@example.test",
      description: "Please remove my submitted incident details.",
    })
    .expect(201);
  assert.ok(res.body.reference.startsWith("PR-"));
  const q = await admin.get("/api/v1/admin/privacy-requests").expect(200);
  assert.equal(q.body.items[0].details.ownershipVerified, true);
  assert.equal(q.body.items[0].details.secret, undefined);
  const logs = await Audit.find().lean();
  const text = JSON.stringify(logs);
  assert.ok(!text.includes(c.secret));
  assert.ok(!text.includes(input.description));
  assert.ok(logs.some((x) => x.action === "report.read"));
});
test("admin account creation and self-demotion blocked", async () => {
  const res = await admin
    .post("/api/v1/admin/users")
    .set("x-csrf-token", adminCsrf)
    .send({
      name: "New Moderator",
      email: "new@example.test",
      password: "new-secure-password-2026",
      role: "moderator",
    })
    .expect(201);
  assert.equal(res.body.mfaSecret, undefined);
  assert.equal(res.body.user.passwordHash, undefined);
  const u = await Staff.findOne({ role: "super_admin" });
  await admin
    .patch("/api/v1/admin/users/" + u._id)
    .set("x-csrf-token", adminCsrf)
    .send({ accountStatus: "disabled" })
    .expect(400);
});
test("same staff cannot approve their own status review", async () => {
  const res = await request(app)
    .post("/api/v1/reports")
    .send({
      ...input,
      description:
        "A different incident description reported for independent review.",
    })
    .expect(201);
  for (const status of ["screening", "under_review", "reviewed"])
    await senior
      .patch("/api/v1/staff/reports/" + res.body.id + "/status")
      .set("x-csrf-token", seniorCsrf)
      .send({
        status,
        message: "Under careful review.",
        redactedSummary: "Anonymous report.",
      })
      .expect(200);
  await senior
    .post("/api/v1/staff/reports/" + res.body.id + "/review")
    .set("x-csrf-token", seniorCsrf)
    .send({ decision: "approve", notes: "Attempt to approve own review." })
    .expect(403);
});
test("new evidence revokes publication, calendar dates are validated", async () => {
  assert.equal((await Report.findById(c.id)).publicationApproved, false);
  await request(app)
    .post("/api/v1/reports")
    .send({ ...input, incidentDate: "2026-02-31" })
    .expect(400);
});
test("email/password sign-in supports existing accounts and cookies are HttpOnly", async () => {
  const secret = authenticator.generateSecret(),
    u = await Staff.create({
      name: "Replay Test",
      email: "replay@example.test",
      passwordHash: await hash("secure-replay-password"),
      role: "moderator",
      mfaSecretEncrypted: seal(secret),
    });
  const body = {
    email: u.email,
    password: "secure-replay-password",
  };
  const first = await request(app)
    .post("/api/v1/staff/auth/login")
    .send(body)
    .expect(200);
  assert.match(first.headers["set-cookie"][0], /HttpOnly/);
  assert.match(first.headers["set-cookie"][0], /SameSite=Strict/);
  await request(app).post("/api/v1/staff/auth/login").send(body).expect(200);
});
test("encrypted backup verifies and restores to isolated database", async () => {
  const backupKey = randomBytes(32).toString("hex");
  const source = mongo.getUri("test");
  const restore = mongo.getUri("restore_verification");
  const dir = fileURLToPath(new URL("../", import.meta.url));
  async function run(args, uri, extra = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["scripts/backup.js", ...args], {
        cwd: dir,
        env: {
          ...process.env,
          MONGODB_URI: uri,
          BACKUP_ENCRYPTION_KEY: backupKey,
          ...extra,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (b) => (output += b));
      child.stderr.on("data", (b) => (output += b));
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve(output) : reject(Error(output)),
      );
    });
  }
  const created = await run([], source);
  const filename = created.match(/Encrypted backup created: (.+)/)?.[1].trim();
  assert.ok(filename);
  try {
    assert.match(
      await run(["verify", filename], source),
      /Backup authentication and structure verified/,
    );
    const restoreStorage = fileURLToPath(
      new URL("../.cache/restore-evidence/", import.meta.url),
    );
    try {
      assert.match(
        await run(["restore", filename], restore, {
          CONFIRM_RESTORE: "EMPTY_DATABASE",
          STORAGE_DIR: restoreStorage,
        }),
        /Restore complete/,
      );
      const db = mongoose.connection.getClient().db("restore_verification");
      assert.equal(
        await db.collection("reports").countDocuments(),
        await Report.countDocuments(),
      );
      assert.equal(await db.collection("staffsessions").countDocuments(), 0);
      const files = await fs.readdir(restoreStorage);
      assert.ok(files.length >= 1);
      for (const file of files) {
        assert.deepEqual(
          await fs.readFile(restoreStorage + file),
          await fs.readFile(process.env.STORAGE_DIR + file),
          "Restored ciphertext must retain every binary byte",
        );
      }
    } finally {
      await fs.rm(restoreStorage, { recursive: true, force: true });
    }
  } finally {
    await fs.unlink(filename);
  }
});
