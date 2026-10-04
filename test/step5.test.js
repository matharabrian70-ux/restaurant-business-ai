import test from "node:test";
import assert from "node:assert/strict";
import { createLead, LEAD_STAGES } from "../src/core/types.js";
import { rankProspect } from "../src/sales/prospecting.js";
import { normalizeResearch, researchCompleteness } from "../src/sales/research.js";
import { createOutreachDraft, approveOutreach, markOutreachSent } from "../src/sales/outreach.js";
import { processResponse } from "../src/sales/pipeline.js";

test("prospects can be ranked without external side effects", () => {
  const result = rankProspect({
    id: "L-5",
    name: "Demo Restaurant",
    signals: { hasWebsite: false, hasOnlineOrdering: false, contactableDecisionMaker: true }
  });
  assert.equal(result.prospectScore, 65);
});

test("research is normalized and completeness is deterministic", () => {
  const research = normalizeResearch({ name: "Demo Restaurant", location: "Nairobi", secret: "drop-me" });
  assert.equal(research.name, "Demo Restaurant");
  assert.equal(research.secret, undefined);
  assert.equal(researchCompleteness(research).complete, true);
});

test("outreach requires human approval before send", () => {
  const lead = createLead({ id: "L-6", name: "Demo Restaurant" });
  const draft = createOutreachDraft({ lead, research: { name: "Demo Restaurant" } });
  assert.throws(() => markOutreachSent(draft), /human-approved/);
  const approved = approveOutreach(draft);
  const sent = markOutreachSent(approved, { provider: "not-connected" });
  assert.equal(sent.status, "sent");
});

test("positive response with buying signal creates human handoff", () => {
  const lead = createLead({ id: "L-7", name: "Demo Restaurant" });
  const ready = { ...lead, stage: LEAD_STAGES.READY_FOR_OUTREACH };
  const result = processResponse(ready, "Yes, send me the demo", ["asked_for_price"]);
  assert.equal(result.lead.stage, LEAD_STAGES.HUMAN_HANDOFF);
  assert.equal(result.lead.nextAction, "human_close");
});
