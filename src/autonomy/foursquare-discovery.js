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

function decodeEmailText(value) {
  return String(value ?? "")
    .replace(/&#64;|&#x40;|&commat;/gi, "@")
    .replace(/&#46;|&#x2e;|&period;/gi, ".")
    .replace(/\s*(?:\[at\]|\(at\)|\{at\})\s*/gi, "@")
    .replace(/\s+(?:at)\s+/gi, "@")
    .replace(/\s*(?:\[dot\]|\(dot\)|\{dot\})\s*/gi, ".")
    .replace(/\s+(?:dot)\s+/gi, ".");
}

function extractBusinessEmail(html) {
  const source = decodeEmailText(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const candidates = [
    ...[...source.matchAll(/mailto:\s*([^"'? >]+)/gi)].map((match) => match[1]),
    ...(source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
  ];
  const blocked = /^(?:noreply|no-reply|donotreply|do-not-reply|example|test)@/i;
  const emails = [...new Set(candidates.map(normalizeEmail).filter(Boolean))]
    .filter((email) => !blocked.test(email) && !/\.(?:png|jpe?g|gif|svg|webp|css|js)$/i.test(email));
  const generic = emails.find((email) =>
    /^(info|hello|contact|reservations|booking|bookings|orders|sales|admin|office|enquiries|enquiry|reception|frontdesk|events|stay)@/i.test(email)
  );
  return generic ?? emails[0] ?? null;
}

function isSafePublicWebsite(website) {
  let url;
  try {
    url = new URL(website);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^(?:0|10|127|169\.254|192\.168)\./.test(host)) return false;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((n) => n > 255) || octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)) return false;
  }
  return true;
}

function contactLinksFromHtml(html, base) {
  const links = [];
  const hrefPattern = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  for (const match of html.matchAll(hrefPattern)) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";
    if (!/(contact|about|reservation|booking|enquir|impressum|reach-us|visit-us)/i.test(href)) continue;
    try {
      const url = new URL(href.replace(/&amp;/gi, "&"), base);
      if (url.origin === base.origin && ["http:", "https:"].includes(url.protocol)) {
        url.hash = "";
        links.push(url.toString());
      }
    } catch {
      // Ignore malformed links on third-party websites.
    }
  }
  return links;
}

async function fetchPageText(url, origin, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBSITE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Mathara-Digital-Sales-Bot/1.0" }
    });

    if (!response.ok) return null;

    if (response.url) {
      const finalUrl = new URL(response.url);
      if (finalUrl.origin !== origin || !isSafePublicWebsite(response.url)) return null;
    }

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function findPublicBusinessEmail(website, fetchImpl = globalThis.fetch) {
  if (!website || !isSafePublicWebsite(website)) return null;

  const base = new URL(website);
  base.hash = "";
  base.search = "";
  const homepageUrl = base.toString();
  const homepage = await fetchPageText(homepageUrl, base.origin, fetchImpl);
  if (homepage) {
    const email = extractBusinessEmail(homepage);
    if (email) return email;
  }

  // Keep requests bounded: inspect the homepage and at most two additional
  // same-origin contact pages, prioritizing links actually published by the site.
  const linkedPages = homepage ? contactLinksFromHtml(homepage, base) : [];
  const fallbackPages = [
    "/contact", "/contact-us", "/about", "/reservations", "/booking",
    "/contact.html", "/about-us", "/enquiries", "/pages/contact"
  ].map((path) => new URL(path, base.origin).toString());
  const candidates = [...new Set([...linkedPages, ...fallbackPages])]
    .filter((url) => url !== homepageUrl)
    .slice(0, 2);

  for (const url of candidates) {
    const html = await fetchPageText(url, base.origin, fetchImpl);
    if (!html) continue;
    const email = extractBusinessEmail(html);
    if (email) return email;
  }
  return null;
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

      const email = await findPublicBusinessEmail(record.website, fetchImpl);
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
