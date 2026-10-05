const DEFAULT_OVERPASS_ENDPOINT = "https://overpass.private.coffee/api/interpreter";
const DEFAULT_BBOX = "-1.45,36.65,-1.15,37.05";
const DEFAULT_TILE_DEGREES = 0.25;
const DEFAULT_MAX_TILES = 64;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RUNTIME_MS = 180_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND"
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectNetworkErrorCodes(error, seen = new Set()) {
  if (!error || (typeof error !== "object" && typeof error !== "function") || seen.has(error)) {
    return [];
  }

  seen.add(error);
  const codes = [];
  if (typeof error.code === "string") codes.push(error.code);
  if (error.cause) codes.push(...collectNetworkErrorCodes(error.cause, seen));
  if (Array.isArray(error.errors)) {
    for (const nestedError of error.errors) {
      codes.push(...collectNetworkErrorCodes(nestedError, seen));
    }
  }
  return codes;
}

function isRetryableNetworkError(error) {
  return collectNetworkErrorCodes(error).some((code) => RETRYABLE_NETWORK_CODES.has(code));
}

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

function parseBbox(value) {
  const parts = String(value).split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error("AUTONOMOUS_DISCOVERY_BBOX must be south,west,north,east");
  }

  const [south, west, north, east] = parts;
  if (south >= north || west >= east) {
    throw new Error("AUTONOMOUS_DISCOVERY_BBOX must have south < north and west < east");
  }

  return { south, west, north, east };
}

function createTiles(bbox, tileDegrees) {
  const tiles = [];

  for (let south = bbox.south; south < bbox.north; south += tileDegrees) {
    for (let west = bbox.west; west < bbox.east; west += tileDegrees) {
      tiles.push({
        south,
        west,
        north: Math.min(south + tileDegrees, bbox.north),
        east: Math.min(west + tileDegrees, bbox.east)
      });
    }
  }

  return tiles;
}

function formatBbox(tile) {
  return [
    tile.south.toFixed(6),
    tile.west.toFixed(6),
    tile.north.toFixed(6),
    tile.east.toFixed(6)
  ].join(",");
}

function rotateTiles(tiles, offset) {
  if (!tiles.length) return tiles;
  const start = ((offset % tiles.length) + tiles.length) % tiles.length;
  return [...tiles.slice(start), ...tiles.slice(0, start)];
}

function dailyTileOffset(length, now = new Date()) {
  if (!length) return 0;
  const day = Math.floor(now.getTime() / 86_400_000);
  return day % length;
}

async function fetchWebsiteEmail(website, fetchImpl) {
  if (!website) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetchImpl(website, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mathara-Digital-Sales-Bot/1.0 (+https://matharadigital.dev)"
      }
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

async function fetchOverpassTile({
  endpoint,
  tile,
  perTileLimit,
  fetchImpl,
  maxAttempts,
  retryDelayMs,
  sleepImpl,
  requestTimeoutMs
}) {
  const bbox = formatBbox(tile);
  const query = `[out:json][timeout:25];nwr["amenity"="restaurant"](${bbox});out center tags ${perTileLimit};`;

  const request = {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mathara-Digital-Sales-Bot/1.0 (+https://matharadigital.dev)"
    },
    body: new URLSearchParams({ data: query }).toString()
  };

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      const response = await fetchImpl(endpoint, {
        ...request,
        signal: controller.signal
      });

      if (RETRYABLE_STATUSES.has(response.status)) {
        await response.body?.cancel();
        const retryAfter = Number(response.headers?.get?.("retry-after"));
        const error = new Error(`OpenStreetMap discovery failed: HTTP ${response.status}`);
        error.retryableStatus = response.status;
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
        throw error;
      }

      if (!response.ok) {
        throw new Error(`OpenStreetMap discovery failed: HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      lastError = error;

      if (error?.name === "AbortError") {
        lastError = new Error(`OpenStreetMap discovery request timed out after ${requestTimeoutMs}ms`);
        lastError.retryableStatus = 504;
      }

      const retryable =
        RETRYABLE_STATUSES.has(error?.retryableStatus) ||
        isRetryableNetworkError(error);

      if (timeout) clearTimeout(timeout);
      if (!retryable || attempt >= maxAttempts) {
        throw lastError;
      }

      const jitteredDelay = retryDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random());
      const delay = Math.max(jitteredDelay, Number(error?.retryAfterMs) || 0);
      await sleepImpl(delay);
    }
  }

  throw lastError;
}

function normalizeElement(element) {
  const tags = element.tags ?? {};
  const name = tag(tags, "name");
  if (!name) return null;

  const website = normalizeWebsite(tag(tags, "contact:website", "website"));
  const email = normalizeEmail(tag(tags, "contact:email", "email"));

  return {
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
  };
}

async function enrichWebsiteEmails(records, fetchImpl) {
  const enriched = [];

  for (const record of records) {
    if (record.email || !record.website) {
      enriched.push(record);
      continue;
    }

    const email = await fetchWebsiteEmail(record.website, fetchImpl);
    enriched.push({
      ...record,
      email,
      signals: {
        ...record.signals,
        publicBusinessContact: Boolean(email)
      }
    });
  }

  return enriched;
}

export async function discoverFromOpenStreetMap({
  bbox = process.env.AUTONOMOUS_DISCOVERY_BBOX || DEFAULT_BBOX,
  maxResults = Number(process.env.AUTONOMOUS_DISCOVERY_PAGE_SIZE || 20),
  endpoint = process.env.AUTONOMOUS_OVERPASS_ENDPOINT || DEFAULT_OVERPASS_ENDPOINT,
  tileDegrees = Number(process.env.AUTONOMOUS_DISCOVERY_TILE_DEGREES || DEFAULT_TILE_DEGREES),
  maxTiles = Number(process.env.AUTONOMOUS_DISCOVERY_MAX_TILES || DEFAULT_MAX_TILES),
  maxAttempts = Number(process.env.AUTONOMOUS_DISCOVERY_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS),
  retryDelayMs = Number(process.env.AUTONOMOUS_DISCOVERY_RETRY_DELAY_MS || DEFAULT_RETRY_DELAY_MS),
  requestTimeoutMs = Number(process.env.AUTONOMOUS_DISCOVERY_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS),
  maxRuntimeMs = Number(process.env.AUTONOMOUS_DISCOVERY_MAX_RUNTIME_MS || DEFAULT_MAX_RUNTIME_MS),
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  now = new Date()
} = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number(maxResults) || 20));
  const safeTileDegrees = Math.min(2, Math.max(0.05, Number(tileDegrees) || DEFAULT_TILE_DEGREES));
  const safeMaxTiles = Math.min(256, Math.max(1, Number(maxTiles) || DEFAULT_MAX_TILES));
  const safeMaxAttempts = Math.min(6, Math.max(1, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS));
  const safeRetryDelayMs = Math.min(30_000, Math.max(100, Number(retryDelayMs) || DEFAULT_RETRY_DELAY_MS));
  const safeRequestTimeoutMs = Math.min(120_000, Math.max(5_000, Number(requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS));
  const safeMaxRuntimeMs = Math.min(600_000, Math.max(30_000, Number(maxRuntimeMs) || DEFAULT_MAX_RUNTIME_MS));
  const startedAt = Date.now();

  const parsedBbox = parseBbox(bbox);
  const tiles = rotateTiles(
    createTiles(parsedBbox, safeTileDegrees),
    dailyTileOffset(createTiles(parsedBbox, safeTileDegrees).length, now)
  ).slice(0, safeMaxTiles);

  const perTileLimit = Math.min(50, Math.max(safeLimit, 10));
  const records = [];
  const seen = new Set();
  const failures = [];

  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
    const tile = tiles[tileIndex];
    if (records.length >= safeLimit) break;
    if (Date.now() - startedAt >= safeMaxRuntimeMs) {
      console.log(`OSM discovery runtime limit reached after ${tileIndex} tile(s); returning ${records.length} record(s)`);
      break;
    }

    console.log(`OSM discovery tile ${tileIndex + 1}/${tiles.length}: ${formatBbox(tile)}`);

    try {
      const data = await fetchOverpassTile({
        endpoint,
        tile,
        perTileLimit,
        fetchImpl,
        maxAttempts: safeMaxAttempts,
        retryDelayMs: safeRetryDelayMs,
        sleepImpl,
        requestTimeoutMs: safeRequestTimeoutMs
      });

      console.log(`OSM discovery tile ${tileIndex + 1}/${tiles.length} returned ${(data.elements ?? []).length} element(s)`);

      for (const element of data.elements ?? []) {
        if (records.length >= safeLimit) break;

        const record = normalizeElement(element);
        if (!record || seen.has(record.id)) continue;

        seen.add(record.id);
        records.push(record);
      }
    } catch (error) {
      console.warn(`OSM discovery tile ${tileIndex + 1}/${tiles.length} failed: ${error?.message || String(error)}`);
      failures.push({
        bbox: formatBbox(tile),
        message: error?.message || String(error)
      });
    }
  }

  console.log(`OSM discovery collected ${records.length} unique restaurant(s) across ${tiles.length} tile(s); ${failures.length} tile(s) failed`);

  if (!records.length && failures.length) {
    throw new Error(
      `OpenStreetMap discovery failed after ${failures.length} tile(s): ${failures[0].message}`
    );
  }

  return enrichWebsiteEmails(records, fetchImpl);
}
