import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
process.env.NODE_ENV = "test";
process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.AUDIT_KEY = randomBytes(32).toString("hex");
process.env.REPORTING_ENABLED = "true";
process.env.SCANNER_MODE = "quarantine";
process.env.STORAGE_DIR = fileURLToPath(
  new URL("../.cache/admin-control-storage/", import.meta.url),
);
const { app } = await import("../src/app.js");
const { Report, Staff, Evidence, Audit, Session } =
  await import("../src/models.js");
const { hash, unseal, randomToken, seal } = await import("../src/crypto.js");
const { unions } = await import("../src/geography.js");
const { openEvidence } = await import("../src/evidence-storage.js");
const union = unions.find((u) => u.districtCode === "dhaka"),
  input = {
    incidentType: "transport_extortion",
    district: union.districtCode,
    upazila: union.upazilaCode,
    union: union.code,
    area: "Private synthetic area",
    incidentDate: "2026-01-01",
    description:
      "A synthetic report used solely to test administrator information controls.",
    publicConsent: true,
    privacyAcknowledged: true,
  };
let mongo, admin, moderator, adminCsrf, modCsrf, adminUser, c, evidenceId;
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
    const u = await Staff.create({
        name: role,
        email: role + "@admin-test.example",
        role,
        passwordHash: await hash("admin-control-test-password"),
        mfaEnabled: true,
      }),
      agent = request.agent(app),
      r = await agent
        .post("/api/v1/staff/auth/login")
        .send({ email: u.email, password: "admin-control-test-password" })
        .expect(200);
    assert.equal(r.body.user.role, role);
    assert.equal(r.body.mfaSecret, undefined);
    return { u, agent, csrf: r.body.csrfToken };
  }
  const a = await login("super_admin"),
    m = await login("moderator");
  admin = a.agent;
  adminUser = a.u;
  adminCsrf = a.csrf;
  moderator = m.agent;
  modCsrf = m.csrf;
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  await fs.rm(process.env.STORAGE_DIR, { recursive: true, force: true });
});
test("administrator login uses only email/password and role comes from stored account", async () => {
  await request(app)
    .post("/api/v1/staff/auth/login")
    .send({
      email: adminUser.email,
      password: "admin-control-test-password",
      role: "super_admin",
    })
    .expect(400);
  await moderator
    .post("/api/v1/admin/reports")
    .set("x-csrf-token", modCsrf)
    .send(input)
    .expect(403);
  await admin.post("/api/v1/admin/reports").send(input).expect(403);
  await request(app)
    .post("/api/v1/staff/auth/login")
    .send({ email: adminUser.email, password: "wrong" })
    .expect(401);
});
test("union parent validation, protected admin intake and queue filtering", async () => {
  const catalog = await request(app)
    .get(
      "/api/v1/public/unions?district=" +
        input.district +
        "&upazila=" +
        input.upazila,
    )
    .expect(200);
  assert.ok(catalog.body.unions.some((u) => u.code === input.union));
  assert.ok(catalog.body.unions.every((u) => u.upazilaCode === input.upazila));
  await request(app)
    .post("/api/v1/reports")
    .send({
      ...input,
      union: unions.find((u) => u.upazilaCode !== input.upazila).code,
    })
    .expect(400);
  c = (
    await admin
      .post("/api/v1/admin/reports")
      .set("x-csrf-token", adminCsrf)
      .send(input)
      .expect(201)
  ).body;
  assert.equal((await Report.findById(c.id)).unionCode, input.union);
  const queue = await admin
    .get(
      "/api/v1/staff/reports?district=" +
        input.district +
        "&upazila=" +
        input.upazila +
        "&union=" +
        input.union,
    )
    .expect(200);
  assert.equal(queue.body.total, 1);
  await admin.get("/api/v1/staff/reports?union=" + input.union).expect(400);
});
test("union publication is withheld for small groups and exposed only with explicit review choice", async () => {
  for (let i = 0; i < 3; i++)
    await Report.create({
      trackingId: "CW-UNION-QA-" + i,
      incidentType: input.incidentType,
      districtCode: input.district,
      upazilaCode: input.upazila,
      unionCode: input.union,
      publicConsent: true,
      status: "reviewed",
      reviewState: "approved",
      publicationApproved: true,
      expiresAt: new Date(Date.now() + 3600000),
      publicEntry: {
        publicId: randomToken(18),
        title: "Synthetic union publication test",
        summary: "This is safe synthetic text for a publication test.",
        body: "A safe synthetic report account with no identifying information.",
        incidentMonth: "2026-01",
        approved: true,
        displayUpazila: true,
        displayUnion: i < 2,
        publishedAt: new Date(),
        reviewedAt: new Date(),
        snapshotStatus: "reviewed",
      },
    });
  let publicData = (
    await request(app)
      .get(
        "/api/v1/public/cases?district=" +
          input.district +
          "&upazila=" +
          input.upazila +
          "&union=" +
          input.union,
      )
      .expect(200)
  ).body;
  assert.equal(publicData.total, 0);
  await Report.updateOne(
    { trackingId: "CW-UNION-QA-2" },
    { $set: { "publicEntry.displayUnion": true } },
  );
  publicData = (
    await request(app)
      .get(
        "/api/v1/public/cases?district=" +
          input.district +
          "&upazila=" +
          input.upazila +
          "&union=" +
          input.union,
      )
      .expect(200)
  ).body;
  assert.equal(publicData.total, 3);
  assert.ok(publicData.items.every((r) => r.union?.code === input.union));
  await Report.updateOne(
    { trackingId: "CW-UNION-QA-2" },
    { $set: { publicConsent: false } },
  );
  assert.equal(
    (
      await request(app)
        .get(
          "/api/v1/public/cases?district=" +
            input.district +
            "&upazila=" +
            input.upazila +
            "&union=" +
            input.union,
        )
        .expect(200)
    ).body.total,
    0,
  );
});
test("admin corrections encrypt private information and revoke stale public drafts", async () => {
  await Report.updateOne(
    { _id: c.id },
    {
      $set: {
        publicationApproved: true,
        publicEntry: {
          publicId: randomToken(18),
          title: "Old synthetic account",
          summary: "Old safely redacted synthetic public summary",
          body: "An old safe synthetic report body for the update test.",
          approved: true,
        },
      },
    },
  );
  await moderator
    .patch("/api/v1/admin/reports/" + c.id)
    .set("x-csrf-token", modCsrf)
    .send({ ...input, reason: "Correct source information" })
    .expect(403);
  await admin
    .patch("/api/v1/admin/reports/" + c.id)
    .set("x-csrf-token", adminCsrf)
    .send({
      ...input,
      description:
        "A corrected synthetic description used only for the admin editing test.",
      reason: "Correct the original synthetic description.",
    })
    .expect(200);
  const r = await Report.findById(c.id);
  assert.equal(r.publicationApproved, false);
  assert.equal(r.publicEntry, undefined);
  assert.ok(unseal(r.detailsEncrypted).description.startsWith("A corrected"));
  assert.ok(!r.detailsEncrypted.includes("A corrected"));
});
test("streamed video accepts exactly 200 MiB, rejects one byte more and cleans failed files", async () => {
  const fixture = path.join(process.env.STORAGE_DIR, "synthetic-video.mp4");
  await fs.mkdir(process.env.STORAGE_DIR, { recursive: true });
  const header = Buffer.from(
    "000000186674797069736f6d0000020069736f6d69736f32",
    "hex",
  );
  const handle = await fs.open(fixture, "w");
  await handle.write(header);
  await handle.truncate(200 * 1024 * 1024);
  await handle.close();
  try {
    const uploaded = await admin
      .post("/api/v1/admin/reports/" + c.id + "/evidence")
      .set("x-csrf-token", adminCsrf)
      .attach("file", fixture)
      .expect(201);
    evidenceId = uploaded.body.id;
    const stored = await Evidence.findById(evidenceId);
    assert.equal(stored.fileSize, 200 * 1024 * 1024);
    const encrypted = path.join(
      process.env.STORAGE_DIR,
      unseal(stored.encryptedStorageKey),
    );
    const fh = await fs.open(encrypted, "r"),
      magic = Buffer.alloc(5);
    await fh.read(magic, 0, 5, 0);
    await fh.close();
    assert.equal(magic.toString(), "CWFE1");
    await admin.get("/api/v1/staff/evidence/" + evidenceId).expect(409);
    await Evidence.updateOne(
      { _id: evidenceId },
      { $set: { malwareScanStatus: "clean" } },
    );
    const downloaded = await admin
      .get("/api/v1/staff/evidence/" + evidenceId)
      .maxResponseSize(201 * 1024 * 1024)
      .buffer(true)
      .parse((res, done) => {
        let size = 0;
        const sha = createHash("sha256");
        res.on("data", (chunk) => {
          size += chunk.length;
          sha.update(chunk);
        });
        res.on("error", done);
        res.on("end", () => done(null, { size, hash: sha.digest("hex") }));
      })
      .expect(200);
    assert.equal(downloaded.body.size, 200 * 1024 * 1024);
    assert.equal(downloaded.body.hash, stored.contentHash);
    const before = await fs.readdir(process.env.STORAGE_DIR);
    const big = await fs.open(fixture, "r+");
    await big.truncate(200 * 1024 * 1024 + 1);
    await big.close();
    await admin
      .post("/api/v1/admin/reports/" + c.id + "/evidence")
      .set("x-csrf-token", adminCsrf)
      .attach("file", fixture)
      .expect(400);
    assert.deepEqual(
      (await fs.readdir(process.env.STORAGE_DIR)).sort(),
      before.sort(),
    );
    assert.equal(await Evidence.countDocuments({ reportId: c.id }), 1);
  } finally {
    await fs.unlink(fixture);
  }
});
test("admin public information supports draft, publish, edit and removal", async () => {
  await moderator
    .put("/api/v1/admin/page-info/awareness")
    .set("x-csrf-token", modCsrf)
    .send({
      title: "Synthetic safety note",
      body: "Safe synthetic information used only in the isolated test database.",
      published: true,
    })
    .expect(403);
  await admin
    .put("/api/v1/admin/page-info/awareness")
    .set("x-csrf-token", adminCsrf)
    .send({
      title: "Synthetic safety note",
      body: "Safe synthetic information used only in the isolated test database.",
      published: false,
    })
    .expect(200);
  assert.equal(
    (await request(app).get("/api/v1/public/page-info/awareness").expect(200))
      .body.item,
    null,
  );
  await admin
    .put("/api/v1/admin/page-info/awareness")
    .set("x-csrf-token", adminCsrf)
    .send({
      title: "Synthetic safety note",
      body: "Safe synthetic information used only in the isolated test database.",
      published: true,
    })
    .expect(200);
  const visible = (
    await request(app).get("/api/v1/public/page-info/awareness").expect(200)
  ).body.item;
  assert.equal(visible.title, "Synthetic safety note");
  assert.equal(visible._id, undefined);
  await admin
    .delete("/api/v1/admin/page-info/awareness")
    .set("x-csrf-token", adminCsrf)
    .send({ reason: "Remove the isolated synthetic page information." })
    .expect(200);
  assert.equal(
    (await request(app).get("/api/v1/public/page-info/awareness").expect(200))
      .body.item,
    null,
  );
});
test("encrypted evidence rejects tampering and still opens legacy files", async () => {
  const stored = await Evidence.findById(evidenceId),
    filename = path.join(
      process.env.STORAGE_DIR,
      unseal(stored.encryptedStorageKey),
    ),
    h = await fs.open(filename, "r+"),
    byte = Buffer.alloc(1);
  await h.read(byte, 0, 1, 33);
  const original = Buffer.from(byte);
  byte[0] ^= 1;
  await h.write(byte, 0, 1, 33);
  await h.close();
  await assert.rejects(openEvidence(filename));
  const repair = await fs.open(filename, "r+");
  await repair.write(original, 0, 1, 33);
  await repair.close();
  const legacy = path.join(process.env.STORAGE_DIR, "legacy-test");
  await fs.writeFile(legacy, seal(Buffer.from("legacy payload")));
  try {
    const chunks = [];
    for await (const chunk of await openEvidence(legacy)) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), "legacy payload");
  } finally {
    await fs.unlink(legacy);
  }
});
test("admin evidence and report deletion require authorization and keep audit records", async () => {
  await moderator
    .delete("/api/v1/admin/evidence/" + evidenceId)
    .set("x-csrf-token", modCsrf)
    .send({ reason: "Remove synthetic test evidence." })
    .expect(403);
  await admin
    .delete("/api/v1/admin/evidence/" + evidenceId)
    .set("x-csrf-token", adminCsrf)
    .send({ reason: "Remove synthetic test evidence." })
    .expect(200);
  assert.equal((await Report.findById(c.id)).evidenceCount, 0);
  assert.equal(await Evidence.findById(evidenceId), null);
  await admin
    .delete("/api/v1/admin/reports/" + c.id)
    .set("x-csrf-token", adminCsrf)
    .send({ reason: "Remove the isolated synthetic test report." })
    .expect(200);
  assert.equal(await Report.findById(c.id), null);
  assert.ok(await Audit.exists({ action: "report.delete", resourceId: c.id }));
});
test("admin staff create, edit, session revocation and deletion preserve self-access", async () => {
  const created = (
    await admin
      .post("/api/v1/admin/users")
      .set("x-csrf-token", adminCsrf)
      .send({
        name: "Synthetic Staff",
        email: "editable@admin-test.example",
        role: "moderator",
        password: "staff-original-password",
      })
      .expect(201)
  ).body;
  assert.equal(created.mfaSecret, undefined);
  const agent = request.agent(app);
  await agent
    .post("/api/v1/staff/auth/login")
    .send({ email: created.user.email, password: "staff-original-password" })
    .expect(200);
  await admin
    .patch("/api/v1/admin/users/" + created.user.id)
    .set("x-csrf-token", adminCsrf)
    .send({
      name: "Corrected Synthetic Staff",
      email: "corrected@admin-test.example",
      password: "staff-updated-password",
    })
    .expect(200);
  await agent.get("/api/v1/staff/auth/me").expect(401);
  await agent
    .post("/api/v1/staff/auth/login")
    .send({
      email: "corrected@admin-test.example",
      password: "staff-updated-password",
    })
    .expect(200);
  await admin
    .delete("/api/v1/admin/users/" + adminUser._id)
    .set("x-csrf-token", adminCsrf)
    .send({ reason: "Attempt to delete own administrator account." })
    .expect(400);
  await admin
    .delete("/api/v1/admin/users/" + created.user.id)
    .set("x-csrf-token", adminCsrf)
    .send({ reason: "Remove the isolated synthetic staff account." })
    .expect(200);
  assert.equal(await Staff.findById(created.user.id), null);
  assert.equal(await Session.countDocuments({ staffId: created.user.id }), 0);
});
