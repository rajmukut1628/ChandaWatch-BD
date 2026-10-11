import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
dotenv.config({ path: path.join(root, ".env"), quiet: true });
export const config = {
  production: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 4000),
  origin: process.env.APP_ORIGIN || "http://localhost:5173",
  mongo: process.env.MONGODB_URI,
  key: process.env.FIELD_ENCRYPTION_KEY,
  auditKey: process.env.AUDIT_KEY,
  reporting: process.env.REPORTING_ENABLED === "true",
  launchApproved: process.env.PUBLIC_LAUNCH_APPROVED === "true",
  minCount: Math.max(3, Number(process.env.STATISTICS_MIN_COUNT || 3)),
  retention: Math.max(30, Number(process.env.RETENTION_DAYS || 180)),
  scanner: process.env.SCANNER_MODE || "quarantine",
  storage: process.env.STORAGE_DIR || path.join(root, "storage"),
};
export function validateConfig() {
  for (const k of ["key", "auditKey"])
    if (!/^[a-f\d]{64}$/i.test(config[k] || ""))
      throw Error(
        `${k}: a 32-byte hexadecimal key is required. Run npm run setup.`,
      );
  if (
    config.production &&
    (!config.mongo || !config.origin.startsWith("https://"))
  )
    throw Error("Production requires MongoDB and an HTTPS APP_ORIGIN.");
  if (config.production && config.reporting && !config.launchApproved)
    throw Error(
      "Reporting is gated pending PUBLIC_LAUNCH_APPROVED=true after launch review.",
    );
  if (config.production && config.scanner !== "clamav")
    throw Error("Production requires ClamAV.");
}
