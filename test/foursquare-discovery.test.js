import test from "node:test";
import assert from "node:assert/strict";
import { discoverFromFoursquare } from "../src/autonomy/foursquare-discovery.js";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

test("Foursquare discovery normalizes, deduplicates, and enriches restaurant leads", async () => {
  const calls = [];

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });

    if (String(url).startsWith("https://places-api.foursquare.com/places/search")) {
      return jsonResponse({
        results: [
          {
            fsq_place_id: "abc",
            name: "Example Restaurant",
            location: { formatted_address: "Westlands, Nairobi, Kenya" },
            tel: "+254700000000",
            website: "https://example.test",
            email: null
          },
          {
            fsq_place_id: "abc",
            name: "Duplicate Restaurant"
          },
          {
            fsq_place_id: "def",
            name: "Second Restaurant",
            location: { address: "1 Test Street", locality: "Nairobi", country: "Kenya" },
            website: null,
            email: "Info@second.test"
          }
        ]
      });
    }

    if (String(url) === "https://example.test") {
      return jsonResponse({});
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const leads = await discoverFromFoursquare({
    apiKey: "test-key",
    queries: ["restaurant"],
    near: "Nairobi, Kenya",
    maxPerQuery: 10,
    maxResults: 10,
    fetchImpl
  });

  assert.equal(leads.length, 2);
  assert.equal(leads[0].id, "fsq:abc");
  assert.equal(leads[0].location, "Westlands, Nairobi, Kenya");
  assert.equal(leads[0].signals.foursquare, true);
  assert.equal(leads[1].email, "info@second.test");

  const request = calls.find((call) =>
    call.url.startsWith("https://places-api.foursquare.com/places/search")
  );

  assert.match(request.url, /query=restaurant/);
  assert.match(request.url, /near=Nairobi%2C%20Kenya/);
  assert.equal(request.options.headers.authorization, "Bearer test-key");
  assert.equal(request.options.headers["X-Places-Api-Version"], "2025-06-17");
});

test("Foursquare discovery requires an API key", async () => {
  await assert.rejects(
    () => discoverFromFoursquare({ apiKey: "" }),
    /FOURSQUARE_API_KEY is required/
  );
});

test("Foursquare discovery reports provider HTTP errors", async () => {
  const fetchImpl = async () => jsonResponse(
    { message: "invalid service key" },
    401
  );

  await assert.rejects(
    () => discoverFromFoursquare({
      apiKey: "bad-key",
      queries: ["restaurant"],
      near: "Nairobi, Kenya",
      fetchImpl
    }),
    /Foursquare Places discovery failed: HTTP 401 — invalid service key/
  );
});
