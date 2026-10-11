import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import fs from "node:fs/promises";
import path from "node:path";
import { config, root } from "./config.js";
let local;
export async function connectDb() {
  let uri = config.mongo;
  if (!uri) {
    if (config.production) throw Error("MongoDB required");
    const cache = path.join(root, ".cache"),
      marker = path.join(cache, "mongo-uri");
    try {
      const existing = await fs.readFile(marker, "utf8");
      if (/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(existing)) {
        await mongoose.connect(existing, { serverSelectionTimeoutMS: 1500 });
        await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
        return;
      }
    } catch {
      await mongoose.disconnect();
    }
    const dbPath = path.join(cache, "mongo");
    await fs.mkdir(dbPath, { recursive: true });
    local = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: "wiredTiger", dbName: "chandawatch" },
      binary: {
        version: "7.0.14",
        downloadDir: path.join(root, ".cache", "binaries"),
      },
    });
    uri = local.getUri("chandawatch");
    await fs.writeFile(marker, uri);
    console.log("Development MongoDB running (persistent local storage).");
  }
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}
export async function closeDb() {
  await mongoose.disconnect();
  if (local) await local.stop({ doCleanup: false });
}
