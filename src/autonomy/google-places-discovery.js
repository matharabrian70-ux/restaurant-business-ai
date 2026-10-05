const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_REQUEST_TIMEOUT_MS = 15_000;
const WEBSITE_REQUEST_TIMEOUT_MS = 5_000;
const WEBSITE_ENRICH_CONCURRENCY = 4;

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
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

    const html = await response.text();
    return extractBusinessEmail(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleSearch({
  apiKey,
  textQuery,
  pageSize,
  fetchImpl
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber"
      },
      body: JSON.stringify({
        textQuery,
        pageSize
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      let detail = "";

      try {
        const errorBody = await response.json();
        const apiError = errorBody?.error;

        if (apiError && typeof apiError === "object") {
          const status = apiError.status ? String(apiError.status) : "";
          const message = apiError.message ? String(apiError.message) : "";
          const reasons = Array.isArray(apiError.details)
            ? apiError.details
                .map((item) => item?.reason || item?.description)
                .filter(Boolean)
                .map(String)
            : [];

          detail = [status, message, ...reasons].filter(Boolean).join(" — ");
        } else if (typeof errorBody?.error === "string") {
          detail = errorBody.error;
        }
      } catch {
        // Preserve the HTTP status when the API does not return JSON.
      }

      throw new Error(
        `Google Places discovery failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`
      );
    }

    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Google Places discovery request timed out after ${GOOGLE_REQUEST_TIMEOUT_MS}ms`
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

export async function discoverFromGooglePlaces({
  apiKey = process.env.GOOGLE_PLACES_API_KEY,
  queries = ["restaurants in Nairobi, Kenya"],
  maxPerQuery = 20,
  maxResults = 20,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY is required for autonomous discovery");
  }

  const safeMaxPerQuery = Math.min(20, Math.max(1, Number(maxPerQuery) || 20));
  const safeMaxResults = Math.min(100, Math.max(1, Number(maxResults) || 20));
  const records = [];
  const seen = new Set();

  for (const textQuery of queries) {
    if (records.length >= safeMaxResults) break;

    const data = await fetchGoogleSearch({
      apiKey,
      textQuery,
      pageSize: Math.min(safeMaxPerQuery, safeMaxResults - records.length),
      fetchImpl
    });

    for (const place of data.places ?? []) {
      if (!place.id || seen.has(place.id)) continue;
      seen.add(place.id);

      records.push({
        id: place.id,
        name: place.displayName?.text,
        location: place.formattedAddress ?? "Nairobi, Kenya",
        phone: place.nationalPhoneNumber ?? null,
        email: null,
        website: place.websiteUri ?? null,
        source: "public_business_directory",
        sourceUrl: "https://developers.google.com/maps/documentation/places/web-service/text-search",
        sourceRef: place.id,
        consentState: "unknown",
        signals: {
          googlePlaces: true,
          publicBusinessContact: false
        }
      });

      if (records.length >= safeMaxResults) break;
    }
  }

  return enrichWebsiteEmails(records, fetchImpl);
}
