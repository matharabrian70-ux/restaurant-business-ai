import test from "node:test";
import assert from "node:assert/strict";
import { discoverFromOpenStreetMap } from "../src/autonomy/osm-discovery.js";
import { discoverFromConfiguredSource } from "../src/autonomy/discovery-provider.js";

test("OpenStreetMap discovery returns public restaurant records without an API key", async () => {
  const fetchImpl = async (url, options) => {
    assert.match(url, /overpass-api\.de/);
    assert.equal(options.method, "POST");
    return new Response(JSON.stringify({
      elements: [
        {
          type: "node",
          id: 123,
          lat: -1.29,
          lon: 36.82,
          tags: {
            name: "Test Restaurant",
            "addr:city": "Nairobi",
            website: "https://example.com",
            email: "hello@example.com"
          }
        }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const records = await discoverFromOpenStreetMap({
    fetchImpl,
    maxResults: 20,
    bbox: "-1.4,36.7,-1.2,36.9"
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Test Restaurant");
  assert.equal(records[0].email, "hello@example.com");
  assert.equal(records[0].source, "public_business_directory");
});

test("configured discovery defaults to OpenStreetMap and needs no Google key", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    elements: [{
      type: "node",
      id: 456,
      tags: { name: "No Google Restaurant", email: "info@example.com" }
    }]
  }), { status: 200, headers: { "content-type": "application/json" } });

  const records = await discoverFromConfiguredSource({
    env: { AUTONOMOUS_DISCOVERY_PROVIDER: "osm", AUTONOMOUS_DISCOVERY_PAGE_SIZE: "5" },
    fetchImpl
  });

  assert.equal(records[0].name, "No Google Restaurant");
});
