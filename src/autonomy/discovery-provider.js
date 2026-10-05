import { discoverFromFoursquare } from "./foursquare-discovery.js";

export async function discoverFromConfiguredSource({
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const provider = String(env.AUTONOMOUS_DISCOVERY_PROVIDER || "foursquare").toLowerCase();

  if (provider !== "foursquare" && provider !== "fsq") {
    throw new Error(
      `Unsupported autonomous discovery provider: ${provider}. Foursquare is the only supported production provider.`
    );
  }

  return discoverFromFoursquare({
    apiKey: env.FOURSQUARE_API_KEY,
    queries: String(env.AUTONOMOUS_DISCOVERY_QUERIES || "restaurant")
      .split("|")
      .map((q) => q.trim())
      .filter(Boolean),
    near: env.AUTONOMOUS_DISCOVERY_NEAR || "Nairobi, Kenya",
    maxPerQuery: Number(env.AUTONOMOUS_DISCOVERY_PAGE_SIZE || 20),
    maxResults: Number(
      env.AUTONOMOUS_DISCOVERY_DAILY_TARGET ||
      env.AUTONOMOUS_DISCOVERY_PAGE_SIZE ||
      20
    ),
    fetchImpl
  });
}
