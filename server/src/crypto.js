import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import argon2 from "argon2";
import { config } from "./config.js";
export const randomToken = (n = 32) => randomBytes(n).toString("base64url");
export const digest = (s) => createHash("sha256").update(s).digest("hex");
export const hash = (s) =>
  argon2.hash(s, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export const verify = (h, s) => argon2.verify(h, s).catch(() => false);
export const safeEqual = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function seal(value, key = config.key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const data = Buffer.concat([
    cipher.update(
      Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value)),
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function unseal(value, binary = false, key = config.key) {
  const buf = Buffer.from(value, "base64"),
    dec = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      buf.subarray(0, 12),
    );
  dec.setAuthTag(buf.subarray(12, 28));
  const data = Buffer.concat([dec.update(buf.subarray(28)), dec.final()]);
  return binary ? data : JSON.parse(data.toString());
}
export const mac = (value) =>
  createHmac("sha256", Buffer.from(config.auditKey, "hex"))
    .update(value)
    .digest("hex");
