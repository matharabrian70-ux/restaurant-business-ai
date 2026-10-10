import { discoverFromFoursquare } from "./src/autonomy/foursquare-discovery.js";
import { PostgresAutonomyStore } from "./src/autonomy/postgres-store.js";
import { processPersistedDiscoveryQueue } from "./src/autonomy/discovery-queue.js";
import { enrichPersistedContactQueue } from "./src/autonomy/contact-enrichment-queue.js";

const AFRICAN_MARKETS = [
  "Nairobi, Kenya", "Mombasa, Kenya", "Kampala, Uganda", "Kigali, Rwanda",
  "Dar es Salaam, Tanzania", "Zanzibar, Tanzania", "Addis Ababa, Ethiopia",
  "Lagos, Nigeria", "Abuja, Nigeria", "Accra, Ghana", "Dakar, Senegal",
  "Abidjan, Côte d’Ivoire", "Johannesburg, South Africa", "Cape Town, South Africa",
  "Lusaka, Zambia", "Harare, Zimbabwe", "Gaborone, Botswana",
  "Windhoek, Namibia", "Maputo, Mozambique", "Cairo, Egypt",
  "Casablanca, Morocco", "Marrakech, Morocco", "Tunis, Tunisia",
  "Kampala, Uganda", "Monrovia, Liberia", "Freetown, Sierra Leone"
];
const QUERIES = ["restaurant", "hotel", "lodge"];
const DAILY_TARGET = Math.min(50, Math.max(1, Number(process.env.AUTONOMOUS_DISCOVERY_DAILY_TARGET || 50)));

function identityFor(record) {
  if (record.website) return "website:" + record.website.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (record.email) return "email:" + record.email.toLowerCase();
  return "place:" + String(record.id);
}

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the Africa discovery cron");
  }
  if (!process.env.FOURSQUARE_API_KEY) {
    throw new Error("FOURSQUARE_API_KEY is missing from the Render research cron environment; no discovery request was made");
  }
  const store = new PostgresAutonomyStore({ connectionString: process.env.DATABASE_URL });
  try {
    await store.init();
    const day = utcDay();
    const state = await store.get("africa_discovery_daily_state", { day, count: 0, cursor: 0 });
    const daily = state?.day === day ? state : { day, count: 0, cursor: state?.cursor || 0 };
    const contactEnrichment = await enrichPersistedContactQueue(store, { limit: 20 });
    const pipeline = await processPersistedDiscoveryQueue(store, { limit: 50 });
    const remaining = DAILY_TARGET - Number(daily.count || 0);
    if (remaining <= 0) {
      console.log(JSON.stringify({ status: "daily_target_reached", day, discoveredToday: daily.count, target: DAILY_TARGET, contactEnrichment, pipeline, contacted: 0, emailsSent: 0 }));
      return;
    }

    const marketIndex = Number(daily.cursor || 0) % AFRICAN_MARKETS.length;
    const near = AFRICAN_MARKETS[marketIndex];
    const records = [];
    const perQuery = Math.max(1, Math.min(10, Math.ceil(remaining / QUERIES.length)));
    for (const query of QUERIES) {
      if (records.length >= remaining) break;
      const found = await discoverFromFoursquare({
        apiKey: process.env.FOURSQUARE_API_KEY,
        near,
        queries: [query],
        maxPerQuery: perQuery,
        maxResults: Math.min(perQuery, remaining - records.length)
      });
      records.push(...found.map(record => ({ ...record, businessType: query === "restaurant" ? "restaurant" : "hotel", discoveryMarket: near, discoveryQuery: query })));
    }

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
      await store.upsertLead({
        identity,
        leadId: existing?.lead_id || "discovery-" + String(record.id),
        name: record.name || "Unnamed business",
        email: record.email,
        website: record.website,
        stage: "discovered",
        payload: {
          ...record,
          discoveryOnly: true,
          discoveredAt: existing?.payload?.discoveredAt || new Date().toISOString()
        }
      });
      await store.recordEvent("africa-discovery:" + day + ":" + identity, "prospect.discovered", {
        identity, name: record.name, location: record.location, website: record.website,
        email: record.email, businessType: record.businessType, market: near,
        source: record.source, discoveryOnly: true, contacted: false
      });
      existing ? updated++ : stored++;
    }

    const nextState = {
      day,
      count: Number(daily.count || 0) + records.length,
      cursor: (marketIndex + 1) % AFRICAN_MARKETS.length,
      lastMarket: near,
      lastRunAt: new Date().toISOString()
    };
    await store.set("africa_discovery_daily_state", nextState);
    console.log(JSON.stringify({
      status: "ok", mode: "discovery_only", day, market: near,
      queries: QUERIES, found: records.length, stored, updated, skipped,
      discoveredToday: nextState.count, dailyTarget: DAILY_TARGET,
      contactEnrichment, pipeline, contacted: 0, emailsSent: 0
    }));
  } finally {
    await store.close();
  }
}

main().catch(error => {
  console.error("Africa discovery cron failed:", error?.message || error);
  process.exitCode = 1;
});
