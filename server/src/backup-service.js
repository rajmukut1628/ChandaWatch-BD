import fs from "node:fs/promises";
import path from "node:path";
import { EJSON } from "bson";
import { seal, unseal } from "./crypto.js";
const safeName = /^[\w-]+$/;
export async function createBackup(db, collections, storage, key) {
  const data = {
    version: 2,
    fileEncoding: "base64",
    createdAt: new Date(),
    collections: {},
    files: {},
  };
  for (const name of collections)
    data.collections[name] = await db.collection(name).find().toArray();
  await fs.mkdir(storage, { recursive: true });
  for (const name of await fs.readdir(storage)) {
    const filename = path.join(storage, name);
    if (safeName.test(name) && (await fs.lstat(filename)).isFile())
      data.files[name] = (await fs.readFile(filename)).toString("base64");
  }
  return seal(Buffer.from(EJSON.stringify(data)), key);
}
export function readBackup(encrypted, key, known) {
  const data = EJSON.parse(unseal(encrypted, true, key).toString());
  if (
    !data ||
    ![1, 2].includes(data.version) ||
    !data.collections ||
    !data.files ||
    (data.version === 2 && data.fileEncoding !== "base64")
  )
    throw Error("Invalid backup format.");
  for (const [name, rows] of Object.entries(data.collections)) {
    if (
      !known.has(name) ||
      !Array.isArray(rows) ||
      rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
    )
      throw Error("Invalid backup collection.");
  }
  for (const [name, value] of Object.entries(data.files)) {
    if (
      !safeName.test(name) ||
      typeof value !== "string" ||
      (data.version === 2 &&
        Buffer.from(value, "base64").toString("base64") !== value)
    )
      throw Error("Invalid backup storage file.");
  }
  return data;
}
export async function restoreBackup(db, data, storage, confirmed) {
  if (confirmed !== "EMPTY_DATABASE")
    throw Error("Restore requires explicit EMPTY_DATABASE confirmation.");
  for (const { name } of await db.listCollections().toArray())
    if (await db.collection(name).countDocuments())
      throw Error("Restore requires an empty database.");
  await fs.mkdir(storage, { recursive: true });
  if ((await fs.readdir(storage)).length)
    throw Error("Restore requires an empty storage directory.");
  // Validate before writing anything, including on callers that did not use readBackup.
  for (const name of Object.keys(data.files))
    if (!safeName.test(name)) throw Error("Invalid storage filename.");
  for (const [name, rows] of Object.entries(data.collections))
    if (rows.length) await db.collection(name).insertMany(rows);
  for (const [name, content] of Object.entries(data.files))
    await fs.writeFile(
      path.join(storage, name),
      data.version === 2 ? Buffer.from(content, "base64") : content,
      { mode: 0o600, flag: "wx" },
    );
  for (const name of [
    "staffsessions",
    "accounttokens",
    "mailqueues",
    "resumableuploads",
  ])
    await db.collection(name).deleteMany({});
}
