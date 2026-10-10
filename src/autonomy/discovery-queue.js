import { researchLead } from "../sales/research-engine.js";
import { createOutreachDraft } from "../sales/outreach.js";

/**
 * Researches and scores persisted discovery-only leads and stores a proposal draft.
 * This function never sends email; all drafts remain subject to eligibility checks.
 */
export async function processPersistedDiscoveryQueue(store, { limit = 50 } = {}) {
  if (!store?.listLeads || !store?.upsertLead || !store?.recordEvent) {
    throw new Error("A persistent autonomy store is required");
  }

  const leads = await store.listLeads({ limit: Math.min(500, Math.max(1, Number(limit) || 50)) });
  const queue = leads.filter((lead) =>
    lead.stage === "discovered" &&
    lead.payload?.discoveryOnly === true &&
    !lead.last_outreach_at &&
    !lead.handoff_at
  );

  let processed = 0;
  let failed = 0;
  for (const stored of queue) {
    try {
      const source = stored.payload ?? {};
      const businessType = source.businessType === "hotel" ? "hotel" : "restaurant";
      const location = stored.location || source.location || source.discoveryMarket || "Unknown location";
      const lead = {
        id: stored.lead_id,
        name: stored.name,
        businessType,
        location,
        country: source.country,
        website: stored.website || source.website || null,
        email: stored.email || source.email || null
      };

      // Only use observed fields. Do not infer that a business lacks a website,
      // ordering, delivery, or branches merely because the directory omitted them.
      const researchData = {
        name: lead.name,
        location,
        website: lead.website,
        email: lead.email,
        phone: source.phone || null,
        notes: Array.isArray(source.researchNotes) ? source.researchNotes : []
      };
      const researchResult = researchLead(
        { id: lead.id, name: lead.name, location, website: lead.website, source: source.source },
        researchData
      );
      const draft = createOutreachDraft({ lead, research: researchData, channel: "email" });

      const score = {
        ...researchResult.scoring,
        status: "provisional",
        note: "Scored from currently observed directory fields; verify business-specific claims before outreach."
      };
      const salesPipeline = {
        status: "proposal_drafted",
        researchedAt: new Date().toISOString(),
        completeness: researchResult.completeness,
        scoring: score,
        proposal: {
          id: draft.id,
          subject: draft.subject,
          body: draft.body,
          html: draft.html,
          businessType: draft.proposal.businessType,
          currency: draft.proposal.currency,
          packagePrice: draft.proposal.packagePrice,
          requiresHumanApproval: true,
          status: "draft"
        }
      };

      await store.upsertLead({
        identity: stored.identity,
        leadId: stored.lead_id,
        name: stored.name,
        email: stored.email,
        website: stored.website,
        stage: "researched",
        payload: { ...source, discoveryOnly: true, salesPipeline }
      });
      await store.recordEvent(
        "sales-pipeline:" + stored.identity,
        "prospect.researched_and_proposal_drafted",
        {
          identity: stored.identity,
          leadId: stored.lead_id,
          score: score.score,
          priority: score.priority,
          proposalId: draft.id,
          businessType: draft.proposal.businessType,
          currency: draft.proposal.currency,
          packagePrice: draft.proposal.packagePrice,
          requiresHumanApproval: true,
          emailSent: false
        }
      );
      processed++;
    } catch (error) {
      failed++;
      await store.recordEvent(
        "sales-pipeline-error:" + stored.identity,
        "prospect.research_failed",
        { identity: stored.identity, message: String(error?.message || error), emailSent: false }
      );
    }
  }

  return { queued: queue.length, processed, failed, emailsSent: 0 };
}
