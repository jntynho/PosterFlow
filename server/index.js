import { createApp } from "./app.js";
import { publicBase } from "./runtime.js";
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535.");
const value =
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.NODE_ENV === "production" ? "" : `http://localhost:${port}`);
const base = publicBase(value, {
  allowLocal: process.env.NODE_ENV !== "production",
});
const app = createApp({
  baseUrl: base,
  trustProxy: process.env.TRUST_PROXY === "1",
});
app.requestTimeout = 30000;
app.headersTimeout = 10000;
app.keepAliveTimeout = 5000;
app.listen(port, "0.0.0.0", () =>
  console.log(
    `PosterFlow listening on port ${port}; TMDB credentials ${process.env.TMDB_READ_TOKEN ? "configured" : "missing"}.`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    app.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
