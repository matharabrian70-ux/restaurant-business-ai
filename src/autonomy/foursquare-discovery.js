const ENDPOINT = "https://places-api.foursquare.com/places/search";
const API_VERSION = "2025-06-17";
const REQUEST_TIMEOUT_MS = 15_000;
const WEBSITE_REQUEST_TIMEOUT_MS = 5_000;
const WEBSITE_ENRICH_CONCURRENCY = 4;
const DEFAULT_NEAR = "Nairobi, Kenya";
const DEFAULT_QUERIES = ["restaurant"];

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
}

function normalizeWebsite(value) {
  const website = String(value ?? "").trim();
  return website || null;
}

function formatLocation(location) {
  if (!location || typeof location !== "object") return "Nairobi, Kenya";

  return (
    location.formatted_address ||
    [location.address, location.locality, location.region, location.postcode, location.country]
      .filter(Boolean)
      .join(", ") ||
    "Nairobi, Kenya"
  );
}

function extractBusinessEmail(html) {
  const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const generic = matches.find((email) =>
    /^(info|hello|contact|reservations|booking|bookings|orders|sales|admin|office|enquiries|enquiry)@/i.test(email)
  );
  return normalizeEmail(generic ?? matches[0]);
}

async function fetchWebsiteEmail(website, fetchImpl = globalThis.fetch) {
  if (!website) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBSITE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(website, {
      signal: controller.signal,
      headers: { "user-agent": "Mathara-Digital-Sales-Bot/1.0" }
    });

    if (!response.ok) return null;

    return extractBusinessEmail(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFoursquareSearch({
  apiKey,
  query,
  near,
  limit,
  fetchImpl
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const params = new URLSearchParams({
    query,
    near,
    limit: String(limit),
    sort: "RELEVANCE",
    fields: "fsq_place_id,name,location,tel,website,email,latitude,longitude"
  });

  try {
    const response = await fetchImpl(`${ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "X-Places-Api-Version": API_VERSION
      },
      signal: controller.signal
    });

    if (!response.ok) {
      let detail = "";

      try {
        const body = await response.json();
        if (body?.message) detail = String(body.message);
        else if (body?.error) detail = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
      } catch {
        // Preserve the HTTP status when the API does not return JSON.
      }

      throw new Error(
        `Foursquare Places discovery failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`
      );
    }

    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Foursquare Places discovery request timed out after ${REQUEST_TIMEOUT_MS}ms`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichWebsiteEmails(records, fetchImpl) {
  const enriched = [...records];
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= enriched.length) return;

      const record = enriched[index];
      if (record.email || !record.website) continue;

      const email = await fetchWebsiteEmail(record.website, fetchImpl);
      enriched[index] = {
        ...record,
        email,
        signals: {
          ...record.signals,
          publicBusinessContact: Boolean(email)
        }
      };
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(WEBSITE_ENRICH_CONCURRENCY, enriched.length) },
      () => worker()
    )
  );

  return enriched;
}

export async function discoverFromFoursquare({
  apiKey = process.env.FOURSQUARE_API_KEY,
  queries = DEFAULT_QUERIES,
  near = process.env.AUTONOMOUS_DISCOVERY_NEAR || DEFAULT_NEAR,
  maxPerQuery = 20,
  maxResults = 20,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!apiKey) {
    throw new Error("FOURSQUARE_API_KEY is required for Foursquare discovery");
  }

  const safeMaxPerQuery = Math.min(50, Math.max(1, Number(maxPerQuery) || 20));
  const safeMaxResults = Math.min(100, Math.max(1, Number(maxResults) || 20));
  const safeNear = String(near || DEFAULT_NEAR).trim();

  if (!safeNear) {
    throw new Error("AUTONOMOUS_DISCOVERY_NEAR is required for Foursquare discovery");
  }

  const normalizedQueries = (Array.isArray(queries) ? queries : [queries])
    .map((query) => String(query ?? "").trim())
    .filter(Boolean);

  if (!normalizedQueries.length) {
    throw new Error("At least one Foursquare discovery query is required");
  }

  const records = [];
  const seen = new Set();

  for (const query of normalizedQueries) {
    if (records.length >= safeMaxResults) break;

    const data = await fetchFoursquareSearch({
      apiKey,
      query,
      near: safeNear,
      limit: Math.min(safeMaxPerQuery, safeMaxResults - records.length),
      fetchImpl
    });

    for (const place of data.results ?? []) {
      const id = place.fsq_place_id;
      if (!id || seen.has(id)) continue;

      seen.add(id);
      records.push({
        id: `fsq:${id}`,
        name: place.name ?? null,
        location: formatLocation(place.location),
        phone: place.tel ?? null,
        email: normalizeEmail(place.email),
        website: normalizeWebsite(place.website),
        source: "public_business_directory",
        sourceUrl: "https://foursquare.com/",
        sourceRef: id,
        consentState: "unknown",
        signals: {
          foursquare: true,
          publicBusinessContact: Boolean(place.email)
        }
      });

      if (records.length >= safeMaxResults) break;
    }
  }

  return enrichWebsiteEmails(records, fetchImpl);
}
