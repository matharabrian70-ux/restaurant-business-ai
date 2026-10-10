import { findPublicBusinessEmail } from "./foursquare-discovery.js";

/**
 * Enriches persisted leads using only publicly visible contact pages on their
 * own websites. No paid finder or outbound message provider is used.
 * Attempts are throttled for seven days per lead.
 */
export async function enrichPersistedContactQueue(store, {
  limit = 20,
  fetchImpl = globalThis.fetch,
  now = () => new Date()
} = {}) {
  if (!store?.listLeads || !store?.upsertLead) {
    throw new Error("A persistent autonomy store is required");
  }
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const current = now();
  const leads = await store.listLeads({ limit: 500 });
  const queue = leads.filter((lead) => {
    const payload = lead.payload ?? {};
    if (!lead.website || lead.email || payload.email) return false;
    if (lead.last_outreach_at || lead.handoff_at) return false;
    const attempted = Date.parse(payload.contactEnrichmentAttemptedAt ?? "");
    const currentVersion = "public_website_contact_pages_v2";
    // Revisit leads once when the enrichment algorithm changes; otherwise keep
    // the seven-day cooldown to avoid repeatedly crawling the same site.
    if (payload.contactEnrichmentVersion !== currentVersion) return true;
    return !Number.isFinite(attempted) || current.getTime() - attempted >= 7 * 24 * 60 * 60 * 1000;
  }).slice(0, safeLimit);

  let enriched = 0;
  let noEmailFound = 0;
  let failed = 0;
  for (const lead of queue) {
    const payload = lead.payload ?? {};
    try {
      const email = await findPublicBusinessEmail(lead.website, fetchImpl);
      const nextPayload = {
        ...payload,
        contactEnrichmentAttemptedAt: current.toISOString(),
        contactEnrichmentSource: "public_website_contact_pages",
        contactEnrichmentVersion: "public_website_contact_pages_v2",
        contactEnrichmentStatus: email ? "email_found" : "no_public_email_found"
      };
      await store.upsertLead({
        identity: lead.identity,
        leadId: lead.lead_id,
        name: lead.name,
        email: email ?? lead.email ?? null,
        website: lead.website,
        stage: lead.stage,
        payload: email ? { ...nextPayload, email } : nextPayload,
        lastOutreachAt: lead.last_outreach_at,
        handoffAt: lead.handoff_at
      });
      if (email) enriched++;
      else noEmailFound++;
    } catch (error) {
      failed++;
      const nextPayload = {
        ...payload,
        contactEnrichmentAttemptedAt: current.toISOString(),
        contactEnrichmentSource: "public_website_contact_pages",
        contactEnrichmentVersion: "public_website_contact_pages_v2",
        contactEnrichmentStatus: "failed",
        contactEnrichmentError: String(error?.message || error).slice(0, 240)
      };
      await store.upsertLead({
        identity: lead.identity,
        leadId: lead.lead_id,
        name: lead.name,
        email: lead.email ?? null,
        website: lead.website,
        stage: lead.stage,
        payload: nextPayload,
        lastOutreachAt: lead.last_outreach_at,
        handoffAt: lead.handoff_at
      });
    }
  }
  return { queued: queue.length, enriched, noEmailFound, failed };
}
