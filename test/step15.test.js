import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_STATUS,
  createCampaign,
  selectCampaignAudience,
  requestCampaignApproval,
  decideCampaignApproval,
  buildCampaignDrafts,
  nextCampaignBatch
} from "../src/sales/campaign.js";

const target = (id, score) => ({
  prospect: { id, name: "Restaurant " + id, location: "Nairobi" },
  scoring: { score }
});

test("campaign creation normalizes unique audience and starts as draft", () => {
  const campaign = createCampaign({
    id: "CMP-1",
    name: "Nairobi restaurant pilot",
    audience: [{ leadId: "L1" }, { leadId: "L1" }, { leadId: "L2" }]
  });
  assert.equal(campaign.status, CAMPAIGN_STATUS.DRAFT);
  assert.deepEqual(campaign.audience, ["L1", "L2"]);
});

test("audience selection is deterministic, score-ranked, and bounded", () => {
  const selected = selectCampaignAudience([
    target("L1", 72),
    target("L2", 91),
    target("L3", 40),
    target("L4", 80)
  ], { minScore: 55, limit: 2 });
  assert.deepEqual(selected.map((x) => x.prospect.id), ["L2", "L4"]);
});

test("campaign requires human approval before drafts are generated", () => {
  const campaign = createCampaign({ id: "CMP-2", name: "Pilot", audience: [{ leadId: "L1" }] });
  assert.throws(
    () => buildCampaignDrafts(campaign, [{ id: "L1", name: "Savanna Bite" }]),
    /human-approved/
  );
  const pending = requestCampaignApproval(campaign);
  assert.equal(pending.status, CAMPAIGN_STATUS.PENDING_APPROVAL);
  const approved = decideCampaignApproval(pending, true);
  assert.equal(approved.status, CAMPAIGN_STATUS.APPROVED);
  const drafts = buildCampaignDrafts(
    approved,
    [{ id: "L1", name: "Savanna Bite" }],
    { L1: { name: "Savanna Bite" } }
  );
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].requiresHumanApproval, true);
});

test("campaign rejection pauses the campaign and blocks batching", () => {
  const campaign = createCampaign({ id: "CMP-3", name: "Pilot", audience: [{ leadId: "L1" }] });
  const pending = requestCampaignApproval(campaign);
  const rejected = decideCampaignApproval(pending, false);
  assert.equal(rejected.status, CAMPAIGN_STATUS.PAUSED);
  assert.throws(
    () => nextCampaignBatch(rejected, [{ id: "D1" }]),
    /must be approved/
  );
});

test("batching respects both campaign and daily limits", () => {
  const campaign = decideCampaignApproval(
    requestCampaignApproval(
      createCampaign({
        id: "CMP-4",
        name: "Pilot",
        audience: [{ leadId: "L1" }, { leadId: "L2" }, { leadId: "L3" }],
        maxRecipients: 3,
        dailyLimit: 2
      })
    ),
    true
  );
  const drafts = [{ id: "D1" }, { id: "D2" }, { id: "D3" }];
  assert.deepEqual(nextCampaignBatch(campaign, drafts).map((x) => x.id), ["D1", "D2"]);
  assert.deepEqual(nextCampaignBatch(campaign, drafts, { dailySent: 2 }), []);
  assert.deepEqual(nextCampaignBatch(campaign, drafts, { alreadySent: 2 }).map((x) => x.id), ["D1"]);
});
