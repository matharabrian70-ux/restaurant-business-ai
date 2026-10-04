const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
}

function extractBusinessEmail(html) {
  const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi) ?? [];
  const generic = matches.find((email) =>
    /^(info|hello|contact|reservations|booking|bookings|orders|sales|admin|office|enquiries|enquiry)@/i.test(email)
  );
  return normalizeEmail(generic ?? matches[0]);
}

async function fetchWebsiteEmail(website, fetchImpl = globalThis.fetch) {
  if (!website) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
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

export async function discoverFromGooglePlaces({
  apiKey = process.env.GOOGLE_PLACES_API_KEY,
  queries = ["restaurants in Nairobi, Kenya"],
  maxPerQuery = 20,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is required for autonomous discovery");

  const records = [];

  for (const textQuery of queries) {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber"
      },
      body: JSON.stringify({
        textQuery,
        pageSize: Math.min(20, Math.max(1, maxPerQuery))
      })
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
        // Keep the diagnostic safe and useful even if Google returns non-JSON.
      }

      throw new Error(
        `Google Places discovery failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`
      );
    }

    const data = await response.json();

    for (const place of data.places ?? []) {
      const website = place.websiteUri ?? null;
      const email = await fetchWebsiteEmail(website, fetchImpl);
      records.push({
        id: place.id,
        name: place.displayName?.text,
        location: place.formattedAddress ?? "Nairobi, Kenya",
        phone: place.nationalPhoneNumber ?? null,
        email,
        website,
        source: "public_business_directory",
        sourceUrl: "https://developers.google.com/maps/documentation/places/web-service/text-search",
        sourceRef: place.id,
        consentState: "unknown",
        signals: {
          googlePlaces: true,
          publicBusinessContact: Boolean(email)
        }
      });
    }
  }

  return records;
}
