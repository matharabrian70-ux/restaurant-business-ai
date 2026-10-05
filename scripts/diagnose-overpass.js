const DEFAULT_ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];

const endpoints = [
  ...new Set(
    String(process.env.AUTONOMOUS_OVERPASS_ENDPOINT || DEFAULT_ENDPOINTS[0])
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .concat(
        String(process.env.AUTONOMOUS_OVERPASS_FALLBACK_ENDPOINTS || DEFAULT_ENDPOINTS.slice(1).join(","))
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      )
  )
].slice(0, 3);

const bbox = String(
  process.env.AUTONOMOUS_DISCOVERY_DIAGNOSTIC_BBOX || "-1.2900,36.8100,-1.2800,36.8200"
).trim();

const timeoutMs = Math.min(
  20_000,
  Math.max(5_000, Number(process.env.AUTONOMOUS_DISCOVERY_DIAGNOSTIC_TIMEOUT_MS) || 15_000)
);

const query = `[out:json][timeout:10];nwr["amenity"="restaurant"](${bbox});out center tags 3;`;

console.log("OVERPASS_DIAGNOSTIC_START");
console.log(`bbox=${bbox}`);
console.log(`timeoutMs=${timeoutMs}`);
console.log(`endpoints=${endpoints.join(" | ")}`);

for (const endpoint of endpoints) {
  const startedAt = Date.now();
  let timeout;

  try {
    console.log(`TEST ${endpoint}`);

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mathara-Digital-Sales-Bot/1.0 (+https://matharadigital.dev)"
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal
    });

    const elapsedMs = Date.now() - startedAt;
    const bodyText = await response.text();

    console.log(`RESULT endpoint=${endpoint}`);
    console.log(`  status=${response.status}`);
    console.log(`  elapsedMs=${elapsedMs}`);
    console.log(`  contentType=${response.headers.get("content-type") || "unknown"}`);
    console.log(`  bodyBytes=${Buffer.byteLength(bodyText, "utf8")}`);

    if (response.ok) {
      try {
        const payload = JSON.parse(bodyText);
        console.log(`  elements=${Array.isArray(payload.elements) ? payload.elements.length : "invalid"}`);
        console.log("  SUCCESS");
      } catch {
        console.log("  FAILURE invalid JSON response");
      }
    } else {
      console.log(`  FAILURE HTTP ${response.status}`);
      console.log(`  bodyPreview=${bodyText.slice(0, 300).replace(/\\s+/g, " ")}`);
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    console.log(`RESULT endpoint=${endpoint}`);
    console.log(`  elapsedMs=${elapsedMs}`);
    console.log(`  errorName=${error?.name || "unknown"}`);
    console.log(`  errorCode=${error?.code || "unknown"}`);
    console.log(`  errorMessage=${error?.message || String(error)}`);
    console.log("  FAILURE");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

console.log("OVERPASS_DIAGNOSTIC_END");
