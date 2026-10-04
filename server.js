import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createConfiguredTransport } from "./src/sales/provider-factory.js";
import { sendControlledTestEmail } from "./src/sales/test-send.js";

const port = Number(process.env.PORT || 10000);

function tokensMatch(expected, supplied) {
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildServer(env = process.env, transport = null) {
  const configuredTransport = transport || createConfiguredTransport(env);

  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        service: "restaurant-business-ai",
        providerEnabled: env.SALES_PROVIDER_ENABLED === "true"
      }));
      return;
    }

    if (req.method === "POST" && req.url === "/test-email") {
      const auth = req.headers.authorization || "";
      const suppliedToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!tokensMatch(env.SALES_TEST_TOKEN, suppliedToken)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      try {
        const result = await sendControlledTestEmail({
          env,
          transport: configuredTransport
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = buildServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`restaurant-business-ai listening on port ${port}`);
  });
}
