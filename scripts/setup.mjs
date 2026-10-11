import { randomBytes } from "node:crypto";
import {
  existsSync,
  writeFileSync,
  readFileSync,
  appendFileSync,
} from "node:fs";
if (!existsSync("server/.env")) {
  writeFileSync(
    "server/.env",
    `NODE_ENV=development\nPORT=4000\nAPP_ORIGIN=http://localhost:5173\nMONGODB_URI=\nFIELD_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nAUDIT_KEY=${randomBytes(32).toString("hex")}\nREPORTING_ENABLED=true\nPUBLIC_LAUNCH_APPROVED=false\nSTATISTICS_MIN_COUNT=3\nRETENTION_DAYS=180\nSCANNER_MODE=quarantine\nCLAMAV_HOST=127.0.0.1\nCLAMAV_PORT=3310\n`,
  );
  console.log("Local configuration created with random encryption keys.");
} else console.log("Existing configuration preserved.");
const taskConfiguration = readFileSync("server/.env", "utf8");
if (!/^BACKUP_ENCRYPTION_KEY=.+$/m.test(taskConfiguration)) {
  const next = taskConfiguration.replace(
    /^BACKUP_ENCRYPTION_KEY=.*\r?\n?/m,
    "",
  );
  writeFileSync(
    "server/.env",
    next + `\nBACKUP_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Separate random local backup key created; existing field/audit keys preserved.",
  );
}
for (const line of [
  "BACKUP_SCHEDULE_ENABLED=true",
  "RETENTION_SCHEDULE_ENABLED=true",
  "SMTP_HOST=",
  "SMTP_PORT=587",
  "SMTP_SECURE=false",
  "SMTP_FROM=",
  "SMTP_USER=",
  "SMTP_PASSWORD=",
]) {
  const key = line.split("=")[0];
  if (!new RegExp(`^${key}=`, "m").test(taskConfiguration))
    appendFileSync("server/.env", line + "\n");
}
