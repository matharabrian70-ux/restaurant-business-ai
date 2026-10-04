import http from "node:http";

const port = Number(process.env.PORT || 10000);

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "restaurant-business-ai",
      providerEnabled: process.env.SALES_PROVIDER_ENABLED === "true"
    }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`restaurant-business-ai listening on port ${port}`);
});
