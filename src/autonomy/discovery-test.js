import { discoverFromConfiguredSource } from "./discovery-provider.js";

function identityFor(record) {
  if (record.website) {
    return "website:" + record.website.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  if (record.email) return "email:" + record.email.toLowerCase();
  return "place:" + String(record.id);
}

export async function runDiscoveryOnlyTest({
  env = process.env,
  store,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!store) throw new Error("store is required for discovery-only test");
  await store.init();

  const records = await discoverFromConfiguredSource({ env, fetchImpl });

  let stored = 0;
  let updated = 0;
  let skipped = 0;

  for (const record of records) {
    const identity = identityFor(record);
    const existing = await store.getLead(identity);

    if (existing?.last_outreach_at || existing?.handoff_at) {
      skipped++;
      continue;
    }

    const leadId = existing?.lead_id || "discovery-" + String(record.id);

    await store.upsertLead({
      identity,
      leadId,
      name: record.name || "Unnamed restaurant",
      email: record.email,
      website: record.website,
      stage: "discovered",
      payload: {
        ...record,
        discoveryTest: true,
        discoveredAt: existing?.payload?.discoveredAt || new Date().toISOString()
      }
    });

    await store.recordEvent(
      "discovery-test:" + String(record.id),
      "prospect.discovered",
      {
        identity,
        leadId,
        name: record.name,
        email: record.email,
        website: record.website,
        source: record.source,
        discoveryTest: true
      }
    );

    existing ? updated++ : stored++;
  }

  return {
    mode: "discovery_only",
    autonomousSalesEnabled: env.AUTONOMOUS_SALES_ENABLED === "true",
    discovered: records.length,
    stored,
    updated,
    skipped,
    contacted: 0,
    emailsSent: 0
  };
}
