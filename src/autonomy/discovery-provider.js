import { discoverFromGooglePlaces } from "./google-places-discovery.js";
import { discoverFromFoursquare } from "./foursquare-discovery.js";
import { discoverFromOpenStreetMap } from "./osm-discovery.js";

export async function discoverFromConfiguredSource({
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const provider = String(env.AUTONOMOUS_DISCOVERY_PROVIDER || "foursquare").toLowerCase();

  if (provider === "osm" || provider === "openstreetmap") {
    return discoverFromOpenStreetMap({
      bbox: env.AUTONOMOUS_DISCOVERY_BBOX,
      maxResults: Number(env.AUTONOMOUS_DISCOVERY_PAGE_SIZE || 20),
      endpoint: env.AUTONOMOUS_OVERPASS_ENDPOINT,
      fallbackEndpoints: env.AUTONOMOUS_OVERPASS_FALLBACK_ENDPOINTS,
      fetchImpl
    });
  }

  if (provider === "foursquare" || provider === "fsq") {
    return discoverFromFoursquare({
      apiKey: env.FOURSQUARE_API_KEY,
      queries: String(env.AUTONOMOUS_DISCOVERY_QUERIES || "restaurant")
        .split("|")
        .map((q) => q.trim())
        .filter(Boolean),
      near: env.AUTONOMOUS_DISCOVERY_NEAR || "Nairobi, Kenya",
      maxPerQuery: Number(env.AUTONOMOUS_DISCOVERY_PAGE_SIZE || 20),
      maxResults: Number(env.AUTONOMOUS_DISCOVERY_DAILY_TARGET || env.AUTONOMOUS_DISCOVERY_PAGE_SIZE || 20),
      fetchImpl
    });
  }

  if (provider === "google") {
    return discoverFromGooglePlaces({
      apiKey: env.GOOGLE_PLACES_API_KEY,
      queries: String(env.AUTONOMOUS_DISCOVERY_QUERIES || "restaurants in Nairobi, Kenya")
        .split("|")
        .map((q) => q.trim())
        .filter(Boolean),
      maxPerQuery: Number(env.AUTONOMOUS_DISCOVERY_PAGE_SIZE || 20),
      maxResults: Number(env.AUTONOMOUS_DISCOVERY_DAILY_TARGET || env.AUTONOMOUS_DISCOVERY_PAGE_SIZE || 20),
      fetchImpl
    });
  }

  throw new Error(`Unsupported autonomous discovery provider: ${provider}`);
}
