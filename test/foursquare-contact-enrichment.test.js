import test from "node:test";
import assert from "node:assert/strict";
import { discoverFromFoursquare } from "../src/autonomy/foursquare-discovery.js";

test("contact enrichment checks a bounded same-domain contact page", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    requested.push(value);
    if (value.startsWith("https://places-api.foursquare.com/")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { results: [{
            fsq_place_id: "fixture-1",
            name: "Example Restaurant",
            location: { locality: "Nairobi", country: "Kenya" },
            website: "https://example.test/"
          }] };
        }
      };
    }
    if (value === "https://example.test/") {
      return { ok: true, status: 200, url: value, async text() { return "<html><body>Welcome</body></html>"; } };
    }
    if (value === "https://example.test/contact") {
      return { ok: true, status: 200, url: value, async text() { return "<a href='mailto:info@example.test'>Contact us</a>"; } };
    }
    throw new Error("Unexpected request: " + value);
  };

  const records = await discoverFromFoursquare({
    apiKey: "test-key-not-a-real-secret",
    queries: ["restaurant"],
    near: "Nairobi, Kenya",
    maxPerQuery: 1,
    maxResults: 1,
    fetchImpl
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].email, "info@example.test");
  assert.equal(records[0].signals.publicBusinessContact, true);
  assert.ok(requested.includes("https://example.test/contact"));
  assert.ok(requested.length <= 3);
});

test("contact enrichment rejects non-http website schemes without fetching them", async () => {
  let websiteRequested = false;
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://places-api.foursquare.com/")) {
      return { ok: true, status: 200, async json() {
        return { results: [{ fsq_place_id: "fixture-2", name: "Unsafe URL Cafe", website: "file:///etc/passwd" }] };
      }};
    }
    websiteRequested = true;
    throw new Error("Website fetch should not occur");
  };
  const records = await discoverFromFoursquare({
    apiKey: "test-key",
    queries: ["restaurant"],
    maxPerQuery: 1,
    maxResults: 1,
    fetchImpl
  });
  assert.equal(records[0].email, null);
  assert.equal(websiteRequested, false);
});
