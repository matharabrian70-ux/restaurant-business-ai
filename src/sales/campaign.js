import { createOutreachDraft } from "./outreach.js";

export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  PAUSED: "paused",
  COMPLETED: "completed"
});

export const CAMPAIGN_CHANNELS = Object.freeze(["email", "whatsapp", "sms", "manual"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireCampaign(campaign) {
  if (!campaign?.id) throw new Error("Campaign id is required");
  return campaign;
}

export function createCampaign({
  id,
  name,
  channel = "email",
  audience = [],
  maxRecipients = 50,
  dailyLimit = 10,
  createdAt = new Date().toISOString()
} = {}) {
  if (!id || !name) throw new Error("Campaign id and name are required");
  if (!CAMPAIGN_CHANNELS.includes(channel)) throw new Error("Unsupported campaign channel");
  if (!Number.isInteger(maxRecipients) || maxRecipients < 1) {
    throw new Error("maxRecipients must be a positive integer");
  }
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
    throw new Error("dailyLimit must be a positive integer");
  }

  const uniqueLeadIds = [...new Set(audience.map((item) => item?.leadId ?? item?.id).filter(Boolean))];

  return {
    id,
    name,
    channel,
    status: CAMPAIGN_STATUS.DRAFT,
    audience: uniqueLeadIds,
    maxRecipients,
    dailyLimit,
    sentCount: 0,
    createdAt,
    updatedAt: createdAt
  };
}

export function selectCampaignAudience(targets = [], {
  minScore = 55,
  limit = 50
} = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");

  return targets
    .filter((target) => {
      const score = target?.scoring?.score ?? target?.score ?? 0;
      const prospect = target?.prospect ?? target;
      return Boolean(prospect?.id) && score >= minScore;
    })
    .sort((a, b) => {
      const as = a?.scoring?.score ?? a?.score ?? 0;
      const bs = b?.scoring?.score ?? b?.score ?? 0;
      return bs - as;
    })
    .slice(0, limit)
    .map((target) => clone(target));
}

export function requestCampaignApproval(campaign) {
  const current = requireCampaign(campaign);
  if (current.status !== CAMPAIGN_STATUS.DRAFT) {
    throw new Error("Only draft campaigns can request approval");
  }
  return {
    ...clone(current),
    status: CAMPAIGN_STATUS.PENDING_APPROVAL,
    updatedAt: new Date().toISOString()
  };
}

export function decideCampaignApproval(campaign, approved, approver = "human") {
  const current = requireCampaign(campaign);
  if (approver !== "human") throw new Error("Campaign approval requires a human actor");
  if (current.status !== CAMPAIGN_STATUS.PENDING_APPROVAL) {
    throw new Error("Campaign is not awaiting approval");
  }
  return {
    ...clone(current),
    status: approved ? CAMPAIGN_STATUS.APPROVED : CAMPAIGN_STATUS.PAUSED,
    approvedBy: approved ? approver : null,
    approvedAt: new Date().toISOString(),
    approvalReason: approved ? "Human approved campaign" : "Human rejected campaign",
    updatedAt: new Date().toISOString()
  };
}

export function buildCampaignDrafts(campaign, leads, researchByLead = {}) {
  const current = requireCampaign(campaign);
  if (current.status !== CAMPAIGN_STATUS.APPROVED) {
    throw new Error("Campaign must be human-approved before drafts are generated");
  }
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  return current.audience.map((leadId) => {
    const lead = byId.get(leadId);
    if (!lead) throw new Error("Campaign audience lead not found: " + leadId);
    return createOutreachDraft({
      lead,
      research: researchByLead[leadId],
      channel: current.channel
    });
  });
}

export function nextCampaignBatch(campaign, drafts, {
  alreadySent = 0,
  dailySent = 0
} = {}) {
  const current = requireCampaign(campaign);
  if (current.status !== CAMPAIGN_STATUS.APPROVED) {
    throw new Error("Campaign must be approved before batching");
  }
  const remaining = Math.max(0, current.maxRecipients - alreadySent);
  const dailyRemaining = Math.max(0, current.dailyLimit - dailySent);
  const capacity = Math.min(remaining, dailyRemaining);
  return drafts.slice(0, capacity).map(clone);
}
