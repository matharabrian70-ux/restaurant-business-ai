import test from "node:test";
import assert from "node:assert/strict";
import { createOutreachDraft } from "../src/sales/outreach.js";

const lead = (id, extra = {}) => ({ id, name: "Sample Business", ...extra });

test("international restaurant proposal offers exactly two USD packages and relevant proof", () => {
  const draft = createOutreachDraft({
    lead: lead("restaurant-intl", { businessType: "restaurant", country: "Uganda" }),
    research: { name: "Sample Restaurant", country: "Uganda", notes: ["The menu is available online."] }
  });
  assert.equal(draft.proposal.currency, "USD");
  assert.equal(draft.proposal.businessType, "restaurant");
  assert.match(draft.body, /Website: US\$230/);
  assert.match(draft.body, /Website \+ Ordering System: US\$615/);
  assert.match(draft.html, /US\$230/);
  assert.match(draft.html, /US\$615/);
  assert.match(draft.body, /Restaurant-Website-Prototype/);
  assert.equal(draft.requiresHumanApproval, true);
});

test("Kenyan restaurant proposal keeps KSh pricing", () => {
  const draft = createOutreachDraft({
    lead: lead("restaurant-ke", { businessType: "restaurant", location: "Nairobi, Kenya" }),
    research: { name: "Nairobi Restaurant", location: "Nairobi, Kenya" }
  });
  assert.equal(draft.proposal.currency, "KES");
  assert.match(draft.body, /Website: KSh 30,000/);
  assert.match(draft.body, /Website \+ Ordering System: KSh 80,000/);
  assert.match(draft.html, /KSh 30,000/);
  assert.match(draft.html, /KSh 80,000/);
});

test("international hotel proposal offers website only and hotel-specific proof", () => {
  const draft = createOutreachDraft({
    lead: lead("hotel-intl", { businessType: "hotel", country: "Rwanda" }),
    research: { name: "Sample Lodge", businessType: "hotel", country: "Rwanda", notes: ["The property lists several room types."] }
  });
  assert.equal(draft.proposal.currency, "USD");
  assert.equal(draft.proposal.businessType, "hotel");
  assert.equal(draft.proposal.packagePrice, "US$230");
  assert.match(draft.body, /Website package: US\$230/);
  assert.match(draft.body, /hotel-website-demo/);
  assert.match(draft.body, /mathara-digital-portfolio/);
  assert.doesNotMatch(draft.body, /Ordering System|Customer Menu|Checkout System|restaurant-ordering-platform/i);
  assert.doesNotMatch(draft.html, /Ordering System|Customer Menu|Checkout System|restaurant-ordering-platform/i);
  assert.deepEqual(draft.attachments, []);
});

test("Kenyan hotel proposal is website-only at KSh 30,000", () => {
  const draft = createOutreachDraft({
    lead: lead("hotel-ke", { businessType: "hotel", country: "Kenya" }),
    research: { name: "Kenya Lodge", businessType: "hotel", country: "Kenya" }
  });
  assert.equal(draft.proposal.currency, "KES");
  assert.equal(draft.proposal.packagePrice, "KSh 30,000");
  assert.doesNotMatch(draft.body, /Ordering System|Customer Menu|Checkout System/i);
});

test("proposal draft does not send automatically and remains subject to human approval", () => {
  const draft = createOutreachDraft({ lead: lead("safe", { businessType: "restaurant", country: "Kenya" }) });
  assert.equal(draft.status, "draft");
  assert.equal(draft.requiresHumanApproval, true);
});
