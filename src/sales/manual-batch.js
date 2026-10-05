import { EndToEndSalesPipeline } from "./end-to-end-pipeline.js";
import { createDeliverabilityPolicy } from "./deliverability.js";
import PILOT_PROSPECTS from "./pilot-prospects.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createManualSalesRuntime({
  controlPlane,
  transport,
  suppressionStore,
  clock
} = {}) {
  const pipeline = new EndToEndSalesPipeline({
    controlPlane,
    transport,
    suppressionStore,
    clock
  });

  const preparedLeadIds = new Set();

  function preparePilotBatch({ limit = 25 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > PILOT_PROSPECTS.length) {
      throw new Error(`limit must be between 1 and ${PILOT_PROSPECTS.length}`);
    }

    const results = [];

    for (const record of PILOT_PROSPECTS.slice(0, limit)) {
      if (preparedLeadIds.has(record.id)) {
        results.push({ id: record.id, status: "already_prepared" });
        continue;
      }

      const researchData = {
        name: record.name,
        website: record.website,
        email: record.email,
        phone: record.phone,
        location: record.location,
        notes: record.notes
      };

      try {
        const { lead, research } = pipeline.addProspect(record, researchData);

        if (record.email) {
          const outreach = pipeline.prepareOutreach(lead.id, "email");
          results.push({
            id: record.id,
            leadId: lead.id,
            status: "draft_ready",
            email: record.email,
            draftId: outreach.draft.id,
            subject: outreach.draft.subject,
            strategy: outreach.draft.personalization?.strategy ?? "direct-ordering",
            research
          });
        } else {
          results.push({
            id: record.id,
            leadId: lead.id,
            status: "no_verified_email",
            research
          });
        }

        preparedLeadIds.add(record.id);
      } catch (error) {
        results.push({
          id: record.id,
          status: "error",
          error: error.message
        });
      }
    }

    return {
      prepared: results.filter((item) => item.status === "draft_ready").length,
      noVerifiedEmail: results.filter((item) => item.status === "no_verified_email").length,
      errors: results.filter((item) => item.status === "error").length,
      results
    };
  }

  function listPreparedDrafts() {
    return PILOT_PROSPECTS
      .filter((record) => preparedLeadIds.has(record.id))
      .map((record) => {
        const state = pipeline.getLeadState(record.id);
        return state;
      })
      .filter(Boolean)
      .map(clone);
  }

  async function sendApprovedBatch({
    limit = 25,
    sender,
    policy = createDeliverabilityPolicy({
      allowedChannels: ["email"],
      requireConsent: true,
      requireUnsubscribeMechanism: true,
      hasUnsubscribeMechanism: true
    })
  } = {}) {
    if (!sender) throw new Error("Sender is required");

    const states = listPreparedDrafts();
    const approved = [];

    for (const state of states) {
      for (const draft of state.drafts ?? []) {
        if (draft.status === "approved" && state.lead.contact?.email) {
          approved.push({
            draft,
            recipientAddress: state.lead.contact.email
          });
        }
      }
    }

    const batch = approved.slice(0, limit);
    const results = [];

    for (const item of batch) {
      try {
        const result = await pipeline.sendApprovedOutreach({
          draftId: item.draft.id,
          recipientAddress: item.recipientAddress,
          sender,
          policy,
          consent: { state: "allowed" }
        });
        results.push({ status: "sent", ...result });
      } catch (error) {
        results.push({
          status: "blocked",
          draftId: item.draft.id,
          recipient: item.recipientAddress,
          error: error.message
        });
      }
    }

    return {
      attempted: batch.length,
      sent: results.filter((item) => item.status === "sent").length,
      blocked: results.filter((item) => item.status === "blocked").length,
      results
    };
  }

  return {
    pipeline,
    preparePilotBatch,
    listPreparedDrafts,
    sendApprovedBatch
  };
}
