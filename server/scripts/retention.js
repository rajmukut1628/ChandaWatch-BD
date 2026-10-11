import { connectDb, closeDb } from "../src/db.js";
import { validateConfig } from "../src/config.js";
import { retainExpired } from "../src/feature-services.js";
validateConfig();
await connectDb();
try {
  console.log(
    "Retention complete:",
    await retainExpired(),
    "expired reports removed.",
  );
} finally {
  await closeDb();
}
