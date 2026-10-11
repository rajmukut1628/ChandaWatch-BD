import { config, validateConfig } from "./config.js";
import { app } from "./app.js";
import { connectDb, closeDb } from "./db.js";
import { startOperations } from "./feature-services.js";
import { platformOwner } from "./ownership.js";
validateConfig();
await connectDb();
await platformOwner();
const stopOperations = startOperations();
const server = app.listen(config.port, "0.0.0.0", () =>
  console.log(`ChandaWatch BD API: http://localhost:${config.port}`),
);
server.requestTimeout = 31 * 60 * 1000;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      stopOperations();
      await closeDb();
      process.exit(0);
    }),
  );
