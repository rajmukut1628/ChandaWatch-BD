import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { scan } from "../src/scanner.js";
async function fakeScanner(response, run) {
  const server = net.createServer((socket) => {
    let bytes = Buffer.alloc(0);
    socket.on("data", (data) => {
      bytes = Buffer.concat([bytes, data]);
      if (bytes.length >= 10 && bytes.subarray(-4).equals(Buffer.alloc(4)))
        socket.end(response + "\0");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const before = process.env.CLAMAV_PORT;
  process.env.CLAMAV_PORT = String(server.address().port);
  try {
    await run();
  } finally {
    process.env.CLAMAV_PORT = before;
    await new Promise((resolve) => server.close(resolve));
  }
}
test("ClamAV INSTREAM client accepts clean response", async () => {
  await fakeScanner("stream: OK", async () =>
    assert.equal(await scan(Buffer.from("test payload")), "clean"),
  );
});
test("ClamAV INSTREAM client identifies infected response", async () => {
  await fakeScanner("stream: Eicar-Test-Signature FOUND", async () =>
    assert.equal(await scan(Buffer.from("test payload")), "infected"),
  );
});
test("unexpected scanner result fails closed", async () => {
  await fakeScanner("stream: scanner failed", async () =>
    assert.rejects(
      scan(Buffer.from("test payload")),
      /Invalid scanner response/,
    ),
  );
});
