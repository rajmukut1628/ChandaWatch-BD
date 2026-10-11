import net from "node:net";
import { once } from "node:events";
import { Readable } from "node:stream";
export async function scannerHealth() {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: process.env.CLAMAV_HOST || "127.0.0.1",
      port: Number(process.env.CLAMAV_PORT || 3310),
    });
    let text = "",
      done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok, checkedAt: new Date().toISOString() });
    };
    socket.setTimeout(3000);
    socket.on("connect", () => socket.write("zPING\0"));
    socket.on("data", (b) => {
      text += b.toString();
      if (text.includes("\0") || text.includes("\n"))
        finish(text.trim().replace(/\0/g, "") === "PONG");
      if (text.length > 256) finish(false);
    });
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("end", () => finish(text.trim().replace(/\0/g, "") === "PONG"));
  });
}
export async function scan(source) {
  const stream = Buffer.isBuffer(source) ? Readable.from([source]) : source;
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: process.env.CLAMAV_HOST || "127.0.0.1",
      port: Number(process.env.CLAMAV_PORT || 3310),
    });
    let result = "",
      settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      stream.destroy();
      socket.destroy();
      error ? reject(error) : resolve(value);
    };
    socket.setTimeout(120000);
    socket.on("timeout", () => finish(Error("Scanner timeout")));
    socket.on("error", (error) => finish(error));
    stream.on("error", (error) => finish(error));
    socket.on("data", (data) => {
      result += data.toString();
      if (result.length > 4096) finish(Error("Invalid scanner response"));
    });
    socket.on("end", () => {
      if (/: OK(?:\x00|\r?\n|$)/.test(result)) finish(null, "clean");
      else if (/FOUND/.test(result)) finish(null, "infected");
      else finish(Error("Invalid scanner response"));
    });
    socket.on("connect", async () => {
      try {
        socket.write("zINSTREAM\0");
        for await (const chunk of stream) {
          for (let offset = 0; offset < chunk.length; offset += 65536) {
            if (settled) return;
            const bytes = chunk.subarray(offset, offset + 65536),
              length = Buffer.alloc(4);
            length.writeUInt32BE(bytes.length);
            socket.write(length);
            if (!socket.write(bytes)) await once(socket, "drain");
          }
        }
        if (!settled) socket.write(Buffer.alloc(4));
      } catch (error) {
        finish(error);
      }
    });
  });
}
