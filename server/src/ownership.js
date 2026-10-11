import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { Staff, Session } from "./models.js";
import { Setting } from "./feature-models.js";
import { verify, randomToken } from "./crypto.js";
const key = "platform-owner";
export async function platformOwner() {
  let record = await Setting.findOne({ key });
  if (!record) {
    const first = await Staff.findOne({
      role: "super_admin",
      accountStatus: "active",
    }).sort({ createdAt: 1, _id: 1 });
    if (!first) return null;
    try {
      record = await Setting.findOneAndUpdate(
        { key },
        {
          $setOnInsert: { value: { ownerId: String(first._id), revision: 1 } },
        },
        { upsert: true, new: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
      record = await Setting.findOne({ key });
    }
  }
  return record;
}
export async function protectOwner(req, _, next) {
  const match = req.path.match(/^\/([a-f\d]{24})(?:\/access)?\/?$/i);
  if (match && ["PATCH", "DELETE"].includes(req.method)) {
    const record = await platformOwner();
    const ids = [record?.value.ownerId];
    if (
      record?.value.pending &&
      new Date(record.value.pending.expiresAt) > new Date()
    )
      ids.push(record.value.pending.targetId);
    if (ids.includes(match[1].toLowerCase())) {
      const error = Error(
        "The platform owner and pending successor are protected. Use ownership transfer.",
      );
      error.status = 400;
      throw error;
    }
  }
  next();
}
export function installOwnership(app, { staffAuth, csrf, fail, audit }) {
  const endpoint = "/api/v1/staff/ownership";
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => String(req.staff._id),
    message: { error: "Too many attempts. Please try again later." },
  });
  app.get(endpoint, staffAuth, async (req, res) => {
    const record = await platformOwner();
    const owner =
      record &&
      (await Staff.findById(record.value.ownerId).select("name email").lean());
    const pending =
      record?.value.pending &&
      new Date(record.value.pending.expiresAt) > new Date()
        ? record.value.pending
        : null;
    res.json({
      owner: owner
        ? { id: String(owner._id), name: owner.name, email: owner.email }
        : null,
      revision: record?.value.revision || 0,
      isOwner: record?.value.ownerId === String(req.staff._id),
      pending: pending
        ? {
            id: pending.id,
            targetId: pending.targetId,
            expiresAt: pending.expiresAt,
          }
        : null,
      canAccept: pending?.targetId === String(req.staff._id),
    });
  });
  app.post(
    endpoint + "/request",
    staffAuth,
    csrf,
    limiter,
    async (req, res) => {
      const b = z
        .object({
          targetEmail: z.email().max(150),
          password: z.string().min(1).max(128),
          revision: z.number().int().min(1),
        })
        .strict()
        .safeParse(req.body);
      if (!b.success) fail(400, "Invalid ownership transfer information.");
      const record = await platformOwner();
      if (record?.value.ownerId !== String(req.staff._id))
        fail(403, "Only the platform owner can transfer ownership.");
      if (!(await verify(req.staff.passwordHash, b.data.password)))
        fail(401, "Invalid sign-in credentials.");
      if (
        record.value.pending &&
        new Date(record.value.pending.expiresAt) > new Date()
      )
        fail(409, "Cancel the pending ownership transfer first.");
      const target = await Staff.findOne({
        email: b.data.targetEmail.toLowerCase(),
        accountStatus: "active",
      });
      if (!target || String(target._id) === String(req.staff._id))
        fail(400, "Choose another active staff account.");
      const pending = {
        id: randomToken(),
        targetId: String(target._id),
        expiresAt: new Date(Date.now() + 24 * 3600000),
      };
      const changed = await Setting.findOneAndUpdate(
        {
          key,
          "value.ownerId": String(req.staff._id),
          "value.revision": b.data.revision,
        },
        { $set: { "value.pending": pending }, $inc: { "value.revision": 1 } },
        { new: true },
      );
      if (!changed) fail(409, "Ownership changed. Reload before continuing.");
      await audit(req, "ownership.request", "staff", target._id);
      res.json({ ok: true });
    },
  );
  app.post(endpoint + "/cancel", staffAuth, csrf, async (req, res) => {
    const body = z
      .object({ revision: z.number().int().min(1) })
      .strict()
      .safeParse(req.body);
    if (!body.success) fail(400, "Invalid ownership transfer information.");
    const record = await platformOwner();
    if (record?.value.ownerId !== String(req.staff._id))
      fail(403, "Only the platform owner can transfer ownership.");
    if (record.value.pending?.accepting)
      fail(409, "Ownership change is being completed.");
    const changed = await Setting.findOneAndUpdate(
      {
        key,
        "value.ownerId": String(req.staff._id),
        "value.revision": body.data.revision,
      },
      { $unset: { "value.pending": 1 }, $inc: { "value.revision": 1 } },
    );
    if (!changed) fail(409, "Ownership changed. Reload before continuing.");
    await audit(req, "ownership.cancel", "staff", req.staff._id);
    res.json({ ok: true });
  });
  app.post(endpoint + "/accept", staffAuth, csrf, limiter, async (req, res) => {
    const b = z
      .object({
        password: z.string().min(1).max(128),
        transferId: z.string().min(20).max(100),
        revision: z.number().int().min(1),
      })
      .strict()
      .safeParse(req.body);
    if (!b.success) fail(400, "Invalid ownership transfer information.");
    const record = await platformOwner(),
      pending = record?.value.pending;
    if (
      !pending ||
      pending.targetId !== String(req.staff._id) ||
      pending.id !== b.data.transferId ||
      new Date(pending.expiresAt) <= new Date()
    )
      fail(403, "Ownership transfer unavailable or expired.");
    if (!(await verify(req.staff.passwordHash, b.data.password)))
      fail(401, "Invalid sign-in credentials.");
    const changed = await Setting.findOneAndUpdate(
      {
        key,
        "value.ownerId": record.value.ownerId,
        "value.revision": b.data.revision,
        "value.pending.id": pending.id,
        "value.pending.expiresAt": { $gt: new Date() },
      },
      {
        $set: {
          "value.ownerId": String(req.staff._id),
          "value.pending.accepting": true,
        },
        $inc: { "value.revision": 1 },
      },
    );
    if (!changed) fail(409, "Ownership changed. Reload before continuing.");
    let target;
    try {
      target = await Staff.findOneAndUpdate(
        { _id: req.staff._id, accountStatus: "active" },
        {
          $set: {
            role: "super_admin",
            deniedPermissions: [],
            unavailableUntil: null,
            available: true,
          },
        },
        { new: true },
      );
      if (!target) fail(409, "Staff account is unavailable.");
      await Setting.updateOne(
        {
          key,
          "value.ownerId": String(req.staff._id),
          "value.revision": b.data.revision + 1,
        },
        { $unset: { "value.pending": 1 } },
      );
    } catch (e) {
      await Setting.updateOne(
        {
          key,
          "value.ownerId": String(req.staff._id),
          "value.revision": b.data.revision + 1,
        },
        {
          $set: { "value.ownerId": record.value.ownerId },
          $unset: { "value.pending": 1 },
          $inc: { "value.revision": 1 },
        },
      );
      throw e;
    }
    await Session.deleteMany({
      staffId: { $in: [target._id, record.value.ownerId] },
    });
    await audit(req, "ownership.accept", "staff", target._id);
    res.json({ ok: true, signInAgain: true });
  });
}
