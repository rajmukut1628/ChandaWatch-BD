import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import { EJSON } from "bson";
import {
  createBackup,
  readBackup,
  restoreBackup,
} from "../src/backup-service.js";
import { seal } from "../src/crypto.js";

test("encrypted backup restores BSON and binary media into an empty isolated target and invalidates credentials", async () => {
  const mongo = await MongoMemoryServer.create({
    instance: { launchTimeout: 30000 },
  });
  const client = new MongoClient(mongo.getUri());
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cw-backup-test-"));
  const sourceStorage = path.join(workspace, "source"),
    targetStorage = path.join(workspace, "target");
  try {
    await client.connect();
    const source = client.db("source"),
      target = client.db("target");
    const key = randomBytes(32).toString("hex"),
      id = new ObjectId(),
      date = new Date("2026-10-11T00:00:00Z");
    await source.collection("reports").insertOne({
      _id: id,
      createdAt: date,
      title: "Synthetic recovery fixture",
    });
    await source
      .collection("staffsessions")
      .insertOne({ token: "synthetic-revoked-session" });
    await fs.mkdir(sourceStorage);
    const bytes = Buffer.from([0, 255, 128, 5, 1]);
    await fs.writeFile(path.join(sourceStorage, "news-synthetic"), bytes);
    const encrypted = await createBackup(
      source,
      ["reports", "staffsessions"],
      sourceStorage,
      key,
    );
    assert.ok(!encrypted.includes("Synthetic"));
    assert.throws(() =>
      readBackup(
        encrypted,
        randomBytes(32).toString("hex"),
        new Set(["reports", "staffsessions"]),
      ),
    );
    const data = readBackup(
      encrypted,
      key,
      new Set(["reports", "staffsessions"]),
    );
    await assert.rejects(
      restoreBackup(target, data, targetStorage, ""),
      /confirmation/,
    );
    await restoreBackup(target, data, targetStorage, "EMPTY_DATABASE");
    const restored = await target.collection("reports").findOne({ _id: id });
    assert.equal(restored.createdAt.toISOString(), date.toISOString());
    assert.deepEqual(
      await fs.readFile(path.join(targetStorage, "news-synthetic")),
      bytes,
    );
    assert.equal(await target.collection("staffsessions").countDocuments(), 0);
    await assert.rejects(
      restoreBackup(target, data, targetStorage, "EMPTY_DATABASE"),
      /empty database/,
    );
    const malicious = { ...data, files: { "../escape": "YQ==" } };
    assert.throws(
      () =>
        readBackup(
          seal(Buffer.from(EJSON.stringify(malicious)), key),
          key,
          new Set(["reports", "staffsessions"]),
        ),
      /storage/,
    );
    const storageOnly = client.db("storage-only");
    await assert.rejects(
      restoreBackup(storageOnly, data, targetStorage, "EMPTY_DATABASE"),
      /empty storage/,
    );
    assert.equal(await storageOnly.collection("reports").countDocuments(), 0);
  } finally {
    await client.close();
    await mongo.stop();
    // These paths are created only by this test beneath the operating system temp directory.
    if (
      path.dirname(path.resolve(workspace)) !== path.resolve(os.tmpdir()) ||
      !path.basename(workspace).startsWith("cw-backup-test-")
    )
      throw Error("Invalid test cleanup path.");
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
