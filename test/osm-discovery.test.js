import test from "node:test";
import assert from "node:assert/strict";
import { discoverFromOpenStreetMap } from "../src/autonomy/osm-discovery.js";

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    body: { cancel: async () => {} },
    json: async () => data
  };
}

test("OSM discovery splits a bbox into tiles, retries transient failures, deduplicates, and stops at the target", async () => {
  const calls = [];
  const delays = [];
  let firstTileAttempts = 0;

  const result = await discoverFromOpenStreetMap({
    bbox: "0,0,0.5,0.5",
    maxResults: 3,
    tileDegrees: 0.25,
    maxTiles: 10,
    maxAttempts: 3,
    fetchImpl: async (_url, options) => {
      const query = new URLSearchParams(options.body).get("data");
      calls.push(query);

      if (calls.length === 1) {
        firstTileAttempts++;
        if (firstTileAttempts === 1) return jsonResponse({}, 502);
      }

      return jsonResponse({
        elements: [
          {
            type: "node",
            id: 1,
            tags: {
              name: "Restaurant One",
              "contact:email": "one@example.com"
            }
          },
          {
            type: "node",
            id: 2,
            tags: {
              name: "Restaurant Two",
              "contact:email": "two@example.com"
            }
          },
          {
            type: "node",
            id: 1,
            tags: {
              name: "Restaurant One",
              "contact:email": "one@example.com"
            }
          }
        ]
      });
    },
    sleepImpl: async (delay) => {
      delays.push(delay);
    },
    now: new Date("2026-10-05T00:00:00Z")
  });

  assert.equal(result.length, 3);
  assert.equal(new Set(result.map((record) => record.id)).size, 3);
  assert.ok(calls.length >= 2);
  assert.equal(delays.length, 1);
  assert.equal(result[0].signals.publicBusinessContact, true);
});

test("OSM discovery isolates website enrichment failures", async () => {
  const result = await discoverFromOpenStreetMap({
    bbox: "0,0,0.1,0.1",
    maxResults: 1,
    tileDegrees: 0.1,
    fetchImpl: async (url) => {
      if (url === "https://example.com/bad") {
        throw new Error("website unavailable");
      }

      return jsonResponse({
        elements: [
          {
            type: "node",
            id: 99,
            tags: {
              name: "Restaurant With Website",
              website: "https://example.com/bad"
            }
          }
        ]
      });
    }
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].email, null);
  assert.equal(result[0].name, "Restaurant With Website");
  assert.equal(result[0].signals.publicBusinessContact, false);
});
