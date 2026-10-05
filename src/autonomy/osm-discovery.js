const DEFAULT_OVERPASS_ENDPOINT = "https://overpass.private.coffee/api/interpreter";
const DEFAULT_BBOX = "-1.45,36.65,-1.15,37.05";

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

function normalizeWebsite(value) {
  const website = String(value ?? "").trim();
  return website || null;
}

function tag(tags, ...keys) {
  for (const key of keys) {
    if (tags?.[key]) return String(tags[key]).trim();
  }
  return null;
}

async function fetchWebsiteEmail(website, fetchImpl) {
  if (!website) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(website, {
      signal: controller.signal,
      headers: { "user-agent": "Mathara-Digital-Sales-Bot/1.0 (+https://matharadigital.dev)" }
    });
    if (!response.ok) return null;
    const html = await response.text();
    const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    return normalizeEmail(matches[0]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverFromOpenStreetMap({
  bbox = process.env.AUTONOMOUS_DISCOVERY_BBOX || DEFAULT_BBOX,
  maxResults = Number(process.env.AUTONOMOUS_DISCOVERY_PAGE_SIZE || 20),
  endpoint = process.env.AUTONOMOUS_OVERPASS_ENDPOINT || DEFAULT_OVERPASS_ENDPOINT,
  fetchImpl = globalThis.fetch
} = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number(maxResults) || 20));
  const query = `[out:json][timeout:25];nwr["amenity"="restaurant"](${bbox});out center tags;`;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mathara-Digital-Sales-Bot/1.0 (+https://matharadigital.dev)"
    },
    body: new URLSearchParams({ data: query }).toString()
  });

  if (!response.ok) {
    throw new Error(`OpenStreetMap discovery failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const records = [];

  for (const element of data.elements ?? []) {
    if (records.length >= safeLimit) break;
    const tags = element.tags ?? {};
    const name = tag(tags, "name");
    if (!name) continue;

    const website = normalizeWebsite(tag(tags, "contact:website", "website"));
    const email = normalizeEmail(tag(tags, "contact:email", "email")) || await fetchWebsiteEmail(website, fetchImpl);

    records.push({
      id: `osm:${element.type}:${element.id}`,
      name,
      location: tag(tags, "addr:full") || [
        tag(tags, "addr:housenumber"),
        tag(tags, "addr:street"),
        tag(tags, "addr:city")
      ].filter(Boolean).join(", ") || "Nairobi, Kenya",
      phone: tag(tags, "contact:phone", "phone"),
      email,
      website,
      source: "public_business_directory",
      sourceUrl: "https://www.openstreetmap.org/",
      sourceRef: `${element.type}/${element.id}`,
      consentState: "unknown",
      signals: {
        openStreetMap: true,
        publicBusinessContact: Boolean(email)
      }
    });
  }

  return records;
}
