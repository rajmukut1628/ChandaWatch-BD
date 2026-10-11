import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { Staff } from "../src/models.js";
import { platformOwner } from "../src/ownership.js";
import { connectDb, closeDb } from "../src/db.js";
import { validateConfig } from "../src/config.js";
import { hash } from "../src/crypto.js";
validateConfig();
let hidden = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!hidden) process.stdout.write(chunk);
    done();
  },
});
const rl = readline.createInterface({
  input: process.stdin,
  output,
  terminal: process.stdin.isTTY,
});
try {
  const email = (await rl.question("Admin email: ")).trim().toLowerCase();
  const name = (await rl.question("Admin name: ")).trim();
  process.stdout.write("Password (minimum 14 characters, hidden): ");
  hidden = true;
  const password = await rl.question("");
  hidden = false;
  process.stdout.write("\n");
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    name.length < 2 ||
    password.length < 14
  )
    throw Error("Valid email, name and a 14+ character password required.");
  await connectDb();
  if (await Staff.exists({ role: "super_admin", accountStatus: "active" }))
    throw Error(
      "An administrator already exists. Add staff through the admin dashboard.",
    );
  await Staff.create({
    email,
    name,
    role: "super_admin",
    passwordHash: await hash(password),
    mfaEnabled: false,
  });
  await platformOwner();
  console.log("Administrator created. Sign in with the email and password.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await closeDb();
}
