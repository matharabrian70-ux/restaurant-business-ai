import { createProspect } from "./prospecting.js";

export const DISCOVERY_SOURCES = Object.freeze({
  MANUAL: "manual",
  PUBLIC_DIRECTORY: "public_business_directory",
  OFFICIAL_WEBSITE: "official_website",
  REFERRAL: "referral",
  INBOUND: "inbound",
  IMPORT: "approved_import"
});

const ALLOWED_FIELDS = new Set([
  "id","name","businessType","location","address","phone","email",
  "website","source","sourceUrl","sourceRef","discoveredAt","signals","notes","consentState"
]);

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeDiscoveryRecord(record) {
  if (!record || typeof record !== "object") throw new Error("Discovery record is required");
  const normalized = {};
  for (const key of ALLOWED_FIELDS) {
    if (record[key] !== undefined) normalized[key] = record[key];
  }
  normalized.name = cleanString(normalized.name);
  normalized.businessType = cleanString(normalized.businessType) ?? "restaurant";
  normalized.location = cleanString(normalized.location);
  normalized.address = cleanString(normalized.address);
  normalized.phone = cleanString(normalized.phone);
  normalized.email = cleanString(normalized.email);
  normalized.website = cleanString(normalized.website);
  normalized.source = cleanString(normalized.source) ?? DISCOVERY_SOURCES.MANUAL;
  normalized.sourceUrl = cleanString(normalized.sourceUrl);
  normalized.sourceRef = cleanString(normalized.sourceRef);
  normalized.discoveredAt = cleanString(normalized.discoveredAt) ?? new Date().toISOString();
  normalized.notes = Array.isArray(normalized.notes) ? normalized.notes : [];
  normalized.signals = normalized.signals && typeof normalized.signals === "object" ? { ...normalized.signals } : {};
  normalized.consentState = cleanString(normalized.consentState) ?? "unknown";

  if (!normalized.name) throw new Error("Restaurant name is required");
  if (!normalized.location) throw new Error("Restaurant location is required");
  if (!Object.values(DISCOVERY_SOURCES).includes(normalized.source)) throw new Error("Unsupported discovery source");
  return normalized;
}

export function prospectIdentity(record) {
  const normalized = normalizeDiscoveryRecord(record);
  const website = normalized.website?.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const phone = normalized.phone?.replace(/\D/g, "");
  const email = normalized.email?.toLowerCase();
  const location = normalized.location.toLowerCase();
  if (website) return "website:" + website;
  if (phone) return "phone:" + phone;
  if (email) return "email:" + email;
  return "name-location:" + normalized.name.toLowerCase() + "|" + location;
}

export function dedupeProspects(records) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];
  for (const record of records ?? []) {
    const normalized = normalizeDiscoveryRecord(record);
    const key = prospectIdentity(normalized);
    if (seen.has(key)) {
      duplicates.push({ ...normalized, identity: key });
      continue;
    }
    seen.add(key);
    unique.push({ ...normalized, identity: key });
  }
  return { unique, duplicates };
}

export function validateDiscoveryRecord(record) {
  try {
    const normalized = normalizeDiscoveryRecord(record);
    const warnings = [];
    if (!normalized.website) warnings.push("missing_website");
    if (!normalized.phone && !normalized.email) warnings.push("missing_business_contact");
    if (!normalized.sourceUrl && normalized.source !== DISCOVERY_SOURCES.MANUAL) warnings.push("missing_source_url");
    return { valid: true, warnings, record: normalized };
  } catch (error) {
    return { valid: false, warnings: [error.message], record: null };
  }
}

export function discoverProspects(records, { minQuality = 0 } = {}) {
  const valid = [];
  const rejected = [];
  for (const record of records ?? []) {
    const result = validateDiscoveryRecord(record);
    if (!result.valid) {
      rejected.push({ record, reason: result.warnings });
      continue;
    }
    const quality = qualityScore(result.record);
    if (quality < minQuality) {
      rejected.push({ record: result.record, reason: ["below_quality_threshold"] });
      continue;
    }
    valid.push(result.record);
  }
  const { unique, duplicates } = dedupeProspects(valid);
  return {
    prospects: unique.map((record) => createProspect({
      ...record,
      id: record.id ?? ("DISC-" + record.identity.replace(/[^a-z0-9]+/gi, "-").slice(0, 80)),
      source: record.source,
      website: record.website,
      contact: { phone: record.phone, email: record.email }
    })),
    duplicates,
    rejected,
    counts: { received: records?.length ?? 0, accepted: unique.length, duplicates: duplicates.length, rejected: rejected.length }
  };
}

export function qualityScore(record) {
  const r = normalizeDiscoveryRecord(record);
  let score = 0;
  if (r.name) score += 25;
  if (r.location) score += 20;
  if (r.website) score += 20;
  if (r.phone || r.email) score += 20;
  if (r.sourceUrl || r.source === DISCOVERY_SOURCES.MANUAL) score += 10;
  if (r.businessType === "restaurant") score += 5;
  return Math.min(score, 100);
}
