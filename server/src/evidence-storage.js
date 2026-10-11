import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { config } from "./config.js";
import { randomToken, unseal } from "./crypto.js";
const MAGIC = Buffer.from("CWFE1"),
  HEADER_SIZE = 33;
export const evidenceStorage = {
  _handleFile(req, file, callback) {
    (async () => {
      await fs.mkdir(config.storage, { recursive: true });
      const storageKey = randomToken(24),
        filename = path.join(config.storage, storageKey),
        iv = randomBytes(12),
        cipher = createCipheriv(
          "aes-256-gcm",
          Buffer.from(config.key, "hex"),
          iv,
        ),
        hash = createHash("sha256");
      let size = 0,
        head = Buffer.alloc(0);
      try {
        await fs.writeFile(
          filename,
          Buffer.concat([MAGIC, iv, Buffer.alloc(16)]),
          { mode: 0o600, flag: "wx" },
        );
        const inspect = new Transform({
          transform(chunk, encoding, done) {
            size += chunk.length;
            hash.update(chunk);
            if (head.length < 65536)
              head = Buffer.concat([
                head,
                chunk.subarray(0, 65536 - head.length),
              ]);
            done(null, chunk);
          },
        });
        await pipeline(
          file.stream,
          inspect,
          cipher,
          createWriteStream(filename, { flags: "r+", start: HEADER_SIZE }),
        );
        const handle = await fs.open(filename, "r+");
        try {
          await handle.write(cipher.getAuthTag(), 0, 16, 17);
        } finally {
          await handle.close();
        }
        callback(null, {
          path: filename,
          storageKey,
          size,
          head,
          contentHash: hash.digest("hex"),
        });
      } catch (error) {
        await fs.unlink(filename).catch(() => {});
        callback(error);
      }
    })().catch(callback);
  },
  _removeFile(req, file, callback) {
    fs.unlink(file.path).then(
      () => callback(null),
      (error) => callback(error.code === "ENOENT" ? null : error),
    );
  },
};
async function metadata(filename) {
  const handle = await fs.open(filename, "r");
  try {
    const header = Buffer.alloc(HEADER_SIZE),
      { bytesRead } = await handle.read(header, 0, HEADER_SIZE, 0);
    if (!header.subarray(0, 5).equals(MAGIC)) return null;
    if (bytesRead !== HEADER_SIZE) throw Error("Truncated encrypted evidence.");
    return { iv: header.subarray(5, 17), tag: header.subarray(17) };
  } finally {
    await handle.close();
  }
}
function decryptStream(filename, header) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(config.key, "hex"),
    header.iv,
  );
  decipher.setAuthTag(header.tag);
  const input = createReadStream(filename, { start: HEADER_SIZE });
  input.on("error", (error) => decipher.destroy(error));
  decipher.on("close", () => input.destroy());
  return input.pipe(decipher);
}
export async function openEvidence(filename) {
  const header = await metadata(filename);
  if (!header) {
    const plain = unseal(await fs.readFile(filename, "utf8"), true);
    return Readable.from([plain]);
  }
  // Authenticate before any plaintext is released to a scanner or download.
  await pipeline(
    decryptStream(filename, header),
    new Writable({
      write(chunk, encoding, done) {
        done();
      },
    }),
  );
  return decryptStream(filename, header);
}
