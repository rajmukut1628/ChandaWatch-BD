import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
process.env.NODE_ENV = "test";
process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.AUDIT_KEY = randomBytes(32).toString("hex");
process.env.SMTP_HOST = "";
process.env.SMTP_FROM = "";
const { app } = await import("../src/app.js"),
  { Staff, Session, Audit } = await import("../src/models.js"),
  { Setting } = await import("../src/feature-models.js"),
  { hash } = await import("../src/crypto.js");
test("owner protection and two-party transfer enforce password, CSRF, expiry, cancellation and one-use acceptance", async () => {
  const mongo = await MongoMemoryServer.create({
    instance: { launchTimeout: 30000 },
  });
  try {
    await mongoose.connect(mongo.getUri());
    for (const model of Object.values(mongoose.models)) await model.init();
    const password = "Isolated-owner-test-password";
    async function member(name, role) {
      const user = await Staff.create({
        name,
        email: name + "@ownership.example",
        role,
        passwordHash: await hash(password),
        mfaEnabled: false,
      });
      const agent = request.agent(app),
        login = (
          await agent
            .post("/api/v1/staff/auth/login")
            .send({ email: user.email, password })
            .expect(200)
        ).body;
      return { user, agent, csrf: login.csrfToken };
    }
    const owner = await member("original", "super_admin"),
      other = await member("other", "super_admin"),
      target = await member("successor", "moderator");
    const root = "/api/v1/staff/ownership";
    let state = (await owner.agent.get(root).expect(200)).body;
    assert.equal(state.owner.id, String(owner.user._id));
    for (const id of [
      String(owner.user._id),
      String(owner.user._id).toUpperCase(),
    ]) {
      await other.agent
        .patch("/api/v1/admin/users/" + id)
        .set("x-csrf-token", other.csrf)
        .send({ accountStatus: "disabled" })
        .expect(400);
      await other.agent
        .delete("/api/v1/admin/users/" + id)
        .set("x-csrf-token", other.csrf)
        .send({ reason: "Synthetic protected account deletion" })
        .expect(400);
    }
    await other.agent
      .patch(`/api/v1/features/admin/users/${owner.user._id}/access`)
      .set("x-csrf-token", other.csrf)
      .send({ available: false, unavailableUntil: null, deniedPermissions: [] })
      .expect(400);
    const body = {
      targetEmail: target.user.email,
      password,
      revision: state.revision,
    };
    await owner.agent
      .post(root + "/request")
      .send(body)
      .expect(403);
    await other.agent
      .post(root + "/request")
      .set("x-csrf-token", other.csrf)
      .send(body)
      .expect(403);
    await owner.agent
      .post(root + "/request")
      .set("x-csrf-token", owner.csrf)
      .send({ ...body, password: "wrong" })
      .expect(401);
    await owner.agent
      .post(root + "/request")
      .set("x-csrf-token", owner.csrf)
      .send(body)
      .expect(200);
    state = (await target.agent.get(root).expect(200)).body;
    assert.equal(state.canAccept, true);
    await other.agent
      .patch("/api/v1/admin/users/" + target.user._id)
      .set("x-csrf-token", other.csrf)
      .send({ accountStatus: "disabled" })
      .expect(400);
    let accept = {
      password,
      revision: state.revision,
      transferId: state.pending.id,
    };
    await other.agent
      .post(root + "/accept")
      .set("x-csrf-token", other.csrf)
      .send(accept)
      .expect(403);
    await target.agent
      .post(root + "/accept")
      .set("x-csrf-token", target.csrf)
      .send({ ...accept, password: "wrong" })
      .expect(401);
    await owner.agent
      .post(root + "/cancel")
      .set("x-csrf-token", owner.csrf)
      .send({ revision: state.revision })
      .expect(200);
    await target.agent
      .post(root + "/accept")
      .set("x-csrf-token", target.csrf)
      .send(accept)
      .expect(403);
    state = (await owner.agent.get(root).expect(200)).body;
    await owner.agent
      .post(root + "/request")
      .set("x-csrf-token", owner.csrf)
      .send({ ...body, revision: state.revision })
      .expect(200);
    await Setting.updateOne(
      { key: "platform-owner" },
      { $set: { "value.pending.expiresAt": new Date(Date.now() - 1000) } },
    );
    state = (await target.agent.get(root).expect(200)).body;
    assert.equal(state.canAccept, false);
    await target.agent
      .post(root + "/accept")
      .set("x-csrf-token", target.csrf)
      .send(accept)
      .expect(403);
    await owner.agent
      .post(root + "/request")
      .set("x-csrf-token", owner.csrf)
      .send({ ...body, revision: state.revision })
      .expect(200);
    state = (await target.agent.get(root).expect(200)).body;
    accept = {
      password,
      revision: state.revision,
      transferId: state.pending.id,
    };
    await target.agent
      .post(root + "/accept")
      .set("x-csrf-token", target.csrf)
      .send(accept)
      .expect(200);
    assert.equal((await Staff.findById(target.user._id)).role, "super_admin");
    assert.equal(
      (await Setting.findOne({ key: "platform-owner" })).value.ownerId,
      String(target.user._id),
    );
    assert.equal(
      await Session.countDocuments({
        staffId: { $in: [owner.user._id, target.user._id] },
      }),
      0,
    );
    await target.agent.get(root).expect(401);
    await other.agent
      .delete("/api/v1/admin/users/" + target.user._id)
      .set("x-csrf-token", other.csrf)
      .send({ reason: "Synthetic owner deletion" })
      .expect(400);
    assert.ok(await Audit.exists({ action: "ownership.accept" }));
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
