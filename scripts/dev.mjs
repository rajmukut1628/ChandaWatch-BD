import { spawn } from "node:child_process";
const children = ["server", "client"].map((w) =>
  spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "-w", w],
    { stdio: "inherit", shell: process.platform === "win32" },
  ),
);
for (const c of children)
  c.on("exit", (code) => {
    for (const x of children) if (x !== c) x.kill();
    process.exitCode = code || 0;
  });
process.on("SIGINT", () => children.forEach((c) => c.kill()));
