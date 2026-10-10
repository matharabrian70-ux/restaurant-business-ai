import { EndToEndSalesPipeline } from "./end-to-end-pipeline.js";
import { createDeliverabilityPolicy } from "./deliverability.js";
import PILOT_PROSPECTS from "./pilot-prospects.js";
import { createDirectMarketingPolicy } from "./direct-marketing-policy.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createManualSalesRuntime({
  controlPlane,
  transport,
  suppressionStore,
  clock,
  env = process.env
} = {}) {
  const pipeline = new EndToEndSalesPipeline({
    controlPlane,
    transport,
    suppressionStore,
    clock
  });

  const preparedLeadIds = new Set();
  const consentOverrides = new Map();
  const sendOutcomes = new Map();
  // In-memory emergency stop defaults ON after every process restart.

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
        return state ? { ...state, pilotRecord: record } : null;
      })
      .filter(Boolean)
      .map((state) => {
        const copy = clone(state);
        copy.consentRecord = consentOverrides.get(state.pilotRecord.id) || null;
        copy.drafts = (copy.drafts || []).map((draft) => ({
          ...draft,
          sendOutcome: sendOutcomes.get(draft.id) || null
        }));
        return copy;
      });
  }

  function findDraftState(draftId) {
    for (const state of listPreparedDrafts()) {
      const draft = (state.drafts || []).find((item) => item.id === draftId);
      if (draft) return { state, draft };
    }
    throw new Error("Outreach draft not found: " + draftId);
  }

  function decideDraft(draftId, approved, reason = "") {
    const { state, draft } = findDraftState(draftId);
    if (draft.status !== "draft") throw new Error("Draft is already " + draft.status);
    const result = approved
      ? pipeline.approveOutreach(draftId, { reason: reason || "Approved by human operator" })
      : pipeline.rejectOutreach(draftId, { reason: reason || "Rejected by human operator" });
    sendOutcomes.set(draftId, approved
      ? { status: "approved", reason: "Human approval recorded; sending will be attempted if all safety gates pass.", updatedAt: new Date().toISOString() }
      : { status: "rejected", reason: reason || "Rejected by human operator", updatedAt: new Date().toISOString() });
    return { ...result, lead: state.lead, sendOutcome: sendOutcomes.get(draftId) };
  }

  let uiKillSwitchOn = true;

  function sendGateReasons({ ignoreUiKillSwitch = false } = {}) {
    const reasons = [];
    if (uiKillSwitchOn && !ignoreUiKillSwitch) reasons.push("Control Centre emergency kill switch is ON.");
    if (env.SALES_SEND_KILL_SWITCH !== "false") reasons.push("Sending kill switch is ON (SALES_SEND_KILL_SWITCH must be explicitly set to false).");
    if (env.SALES_B2B_OUTREACH_ENABLED !== "true") reasons.push("B2B outreach is disabled (SALES_B2B_OUTREACH_ENABLED is not true).");
    if (env.SALES_PROVIDER_ENABLED !== "true") reasons.push("Email provider sending is disabled (SALES_PROVIDER_ENABLED is not true).");
    if (env.SALES_TEST_MODE === "true") reasons.push("Test mode is enabled; real prospect sending is blocked.");
    if (env.RESEND_DOMAIN_VERIFIED !== "true") reasons.push("Sender domain verification is not confirmed.");
    if (!env.DATABASE_URL) reasons.push("Persistent consent and suppression database is not configured.");
    if (!env.RESEND_API_KEY) reasons.push("Resend API key is not configured.");
    if (!env.RESEND_FROM) reasons.push("Verified sender address is not configured.");
    if (!env.RESEND_REPLY_TO) reasons.push("Reply-to address is not configured.");
    return reasons;
  }

  async function sendApprovedDraft({ draftId, sender } = {}) {
    const { state, draft } = findDraftState(draftId);
    if (draft.status !== "approved") {
      const outcome = { status: "blocked", reason: "Draft must be approved before sending.", updatedAt: new Date().toISOString() };
      sendOutcomes.set(draftId, outcome);
      return { draftId, ...outcome };
    }
    const gateReasons = sendGateReasons();
    if (gateReasons.length) {
      const outcome = { status: "blocked", reason: gateReasons.join(" "), reasons: gateReasons, updatedAt: new Date().toISOString() };
      sendOutcomes.set(draftId, outcome);
      return { draftId, ...outcome };
    }
    const record = state.pilotRecord;
    const consent = consentOverrides.get(record.id);
    if (!consent || consent.state !== "allowed" || !consent.source) {
      const outcome = { status: "blocked", reason: "Recipient consent evidence is missing. Record the lawful basis/evidence before sending.", updatedAt: new Date().toISOString() };
      sendOutcomes.set(draftId, outcome);
      return { draftId, ...outcome };
    }
    try {
      const result = await pipeline.sendApprovedOutreach({
        draftId,
        recipientAddress: state.lead.contact?.email,
        sender: sender || {
          address: env.RESEND_FROM,
          replyTo: env.RESEND_REPLY_TO || env.RESEND_FROM,
          verified: env.RESEND_DOMAIN_VERIFIED === "true"
        },
        policy: {
          allowedChannels: ["email"],
          requireConsent: true,
          requireUnsubscribeMechanism: true,
          hasUnsubscribeMechanism: true
        },
        consent: "allowed",
        consentEvidence: consent,
        directMarketingPolicy: createDirectMarketingPolicy()
      });
      const outcome = {
        status: "sent",
        reason: "Provider accepted the approved message.",
        messageId: result.record?.result?.messageId || null,
        provider: result.record?.result?.provider || null,
        updatedAt: new Date().toISOString()
      };
      sendOutcomes.set(draftId, outcome);
      return { draftId, ...outcome, result };
    } catch (error) {
      const outcome = { status: "failed", reason: error.message || "Unknown send failure", updatedAt: new Date().toISOString() };
      sendOutcomes.set(draftId, outcome);
      return { draftId, ...outcome };
    }
  }

  function recordSendOutcome(draftId, outcome) {
    findDraftState(draftId);
    const normalized = {
      status: outcome?.status || "blocked",
      reason: String(outcome?.reason || "No reason supplied").slice(0, 1000),
      updatedAt: outcome?.updatedAt || new Date().toISOString()
    };
    sendOutcomes.set(draftId, normalized);
    return { draftId, ...normalized };
  }

  function setUiKillSwitchOn(paused) {
    if (typeof paused !== "boolean") throw new Error("paused must be a boolean");
    if (!paused) {
      const blockers = sendGateReasons({ ignoreUiKillSwitch: true });
      if (blockers.length) throw new Error("Cannot resume sending: " + blockers.join(" "));
    }
    uiKillSwitchOn = paused;
    return getSendingStatus();
  }

  function getSendingStatus() {
    const reasons = sendGateReasons();
    const masterKillSwitchOn = env.SALES_SEND_KILL_SWITCH !== "false";
    return {
      enabled: reasons.length === 0,
      killSwitchOn: uiKillSwitchOn || masterKillSwitchOn,
      uiKillSwitchOn,
      masterKillSwitchOn,
      canResume: sendGateReasons({ ignoreUiKillSwitch: true }).length === 0,
      providerEnabled: env.SALES_PROVIDER_ENABLED === "true",
      b2bOutreachEnabled: env.SALES_B2B_OUTREACH_ENABLED === "true",
      testMode: env.SALES_TEST_MODE === "true",
      senderDomainVerified: env.RESEND_DOMAIN_VERIFIED === "true",
      reasons
    };
  }

  function recordRecipientConsent({ id, source, at = new Date().toISOString() } = {}) {
    if (!id || !source) throw new Error("Prospect id and consent source are required");
    if (!preparedLeadIds.has(id)) throw new Error("Prospect must be prepared before consent can be recorded");
    consentOverrides.set(id, {
      state: "allowed",
      source: String(source).slice(0, 500),
      at
    });
    return { id, ...consentOverrides.get(id) };
  }

  async function sendApprovedBatch({
    limit = 25,
    sender,
    policy = createDeliverabilityPolicy({
      allowedChannels: ["email"],
      requireConsent: true,
      requireUnsubscribeMechanism: true,
      hasUnsubscribeMechanism: true
    }),
    directMarketingPolicy = createDirectMarketingPolicy()
  } = {}) {
    if (!sender) throw new Error("Sender is required");

    const states = listPreparedDrafts();
    const approved = [];

    for (const state of states) {
      for (const draft of state.drafts ?? []) {
        if (
          draft.status === "approved" &&
          state.lead.contact?.email &&
          consentOverrides.get(state.pilotRecord.id)?.state === "allowed"
        ) {
          approved.push({
            draft,
            recipientAddress: state.lead.contact.email,
            consentEvidence: consentOverrides.get(state.pilotRecord.id)
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
          consent: { state: "allowed" },
          consentEvidence: item.consentEvidence,
          directMarketingPolicy
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
    recordRecipientConsent,
    decideDraft,
    sendApprovedDraft,
    recordSendOutcome,
    getSendingStatus,
    setUiKillSwitchOn,
    sendApprovedBatch
  };
}
