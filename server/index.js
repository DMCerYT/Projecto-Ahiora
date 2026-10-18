import "./env.js";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";

const db = openDatabase();
const server = createApp({ db });
const port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () =>
  console.log(`Ahiora running at http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeIdleConnections();
  });
