import mongoose from "mongoose";
import fs from "node:fs/promises";
import path from "node:path";
import "../src/models.js";
import "../src/feature-models.js";
import { connectDb, closeDb } from "../src/db.js";
import { config, validateConfig } from "../src/config.js";
import {
  createBackup,
  readBackup,
  restoreBackup,
} from "../src/backup-service.js";
validateConfig();
const backupKey = process.env.BACKUP_ENCRYPTION_KEY;
if (!/^[a-f\d]{64}$/i.test(backupKey || ""))
  throw Error(
    "Set a separate 32-byte BACKUP_ENCRYPTION_KEY. Store it in your secret manager.",
  );
await connectDb();
try {
  const action = process.argv[2] || "create";
  const known = new Set(
    Object.values(mongoose.models).map((m) => m.collection.name),
  );
  if (action === "create") {
    const encrypted = await createBackup(
      mongoose.connection.db,
      known,
      config.storage,
      backupKey,
    );
    await fs.mkdir(path.resolve("backups"), { recursive: true });
    const target = path.resolve(
      "backups",
      "chandawatch-" + Date.now() + ".enc",
    );
    await fs.writeFile(target, encrypted, { mode: 0o600 });
    console.log("Encrypted backup created: " + target);
  } else if (["verify", "restore"].includes(action)) {
    if (!process.argv[3]) throw Error("Provide encrypted backup path.");
    const data = readBackup(
      await fs.readFile(process.argv[3], "utf8"),
      backupKey,
      known,
    );
    if (action === "verify")
      console.log(
        "Backup authentication and structure verified: " +
          Object.keys(data.collections).length +
          " collections, " +
          Object.keys(data.files).length +
          " files.",
      );
    else {
      await restoreBackup(
        mongoose.connection.db,
        data,
        config.storage,
        process.env.CONFIRM_RESTORE,
      );
      console.log(
        "Restore complete in empty target. Sessions invalidated. Verify access and evidence before use.",
      );
    }
  } else throw Error("Use create, verify, or restore.");
} finally {
  await closeDb();
}
