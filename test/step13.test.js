import test from "node:test";
import assert from "node:assert/strict";
import {
  DISCOVERY_SOURCES, normalizeDiscoveryRecord, prospectIdentity,
  dedupeProspects, discoverProspects, validateDiscoveryRecord, qualityScore
} from "../src/sales/discovery.js";

test("normalizes only approved prospect fields", () => {
  const result = normalizeDiscoveryRecord({
    name: "  Savanna Bite  ", location: "Nairobi",
    website: "https://savannabite.example/", secretToken: "must-not-enter",
    source: DISCOVERY_SOURCES.OFFICIAL_WEBSITE, sourceUrl: "https://savannabite.example/menu"
  });
  assert.equal(result.name, "Savanna Bite");
  assert.equal(result.secretToken, undefined);
});

test("rejects records without restaurant name or location", () => {
  assert.equal(validateDiscoveryRecord({ name: "", location: "Nairobi" }).valid, false);
  assert.equal(validateDiscoveryRecord({ name: "Test Restaurant" }).valid, false);
});

test("deduplicates by stable business identity", () => {
  const a = { name: "Test Restaurant", location: "Nairobi", website: "https://test.example" };
  const b = { name: "Same Restaurant", location: "Nairobi", website: "https://test.example/" };
  const result = dedupeProspects([a, b]);
  assert.equal(result.unique.length, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(prospectIdentity(a), prospectIdentity(b));
});

test("discovery structures legitimate records without contacting anyone", () => {
  const result = discoverProspects([
    { name: "Restaurant One", location: "Nairobi", website: "https://one.example", phone: "+254700000001",
      source: DISCOVERY_SOURCES.PUBLIC_DIRECTORY, sourceUrl: "https://directory.example/one" },
    { name: "Restaurant Two", location: "Kilimani", email: "hello@two.example",
      source: DISCOVERY_SOURCES.OFFICIAL_WEBSITE, sourceUrl: "https://two.example" }
  ]);
  assert.equal(result.counts.accepted, 2);
  assert.equal(result.counts.rejected, 0);
});

test("quality score is deterministic and capped", () => {
  assert.equal(qualityScore({
    name: "A", location: "Nairobi", website: "https://a.example", phone: "+254700000000",
    source: DISCOVERY_SOURCES.OFFICIAL_WEBSITE, sourceUrl: "https://a.example"
  }), 100);
});
