import test from "node:test";
import assert from "node:assert/strict";

import { createOutreachDraft } from "../src/sales/outreach.js";
import { SalesControlPlane } from "../src/sales/control-plane.js";

test("Step 22 generates genuinely personalized outreach from research notes", () => {
  const leadA = {
    id: "LEAD-A",
    name: "Mode Café",
    contact: { email: "info@example.com" }
  };

  const leadB = {
    id: "LEAD-B",
    name: "Pili Restaurant",
    contact: { email: "info@example.com" }
  };

  const draftA = createOutreachDraft({
    lead: leadA,
    research: {
      name: "Mode Café",
      website: "https://example.com",
      notes: [
        "The current site supports reservations and direct WhatsApp ordering."
      ],
      hasOnlineOrdering: true
    }
  });

  const draftB = createOutreachDraft({
    lead: leadB,
    research: {
      name: "Pili Restaurant",
      website: "https://example.com",
      notes: [
        "The restaurant already accepts direct online orders, but customers arrange their own delivery rider or pickup."
      ],
      hasOnlineOrdering: true,
      deliveryAvailable: true
    }
  });

  assert.notEqual(draftA.body, draftB.body);
  assert.notEqual(draftA.subject, draftB.subject);
  assert.match(draftA.body, /WhatsApp ordering/);
  assert.match(draftB.body, /delivery rider or pickup/);
  assert.match(draftA.body, /Restaurant-Website-Prototype/);
  assert.match(draftA.body, /STOP/);
});

test("Step 22 batch approval remains a human actor and does not use autonomous authorization", () => {
  const controlPlane = new SalesControlPlane();
  const lead = controlPlane.addLead({
    id: "LEAD-1",
    name: "Test Restaurant",
    contact: { email: "test@example.com" }
  });

  controlPlane.transitionLead(lead.id, { type: "researched" }, { actor: "agent" });
  controlPlane.requestOutreachApproval(lead.id, "OUT-1", { actor: "agent" });

  const result = controlPlane.approveAllPendingOutreach({
    limit: 25,
    reason: "Human approved pilot batch"
  });

  assert.equal(result.approved, 1);
  assert.equal(result.approvals[0].status, "approved");
  assert.equal(result.approvals[0].decidedBy, "human");
  assert.equal(result.approvals[0].mode, undefined);
  assert.equal(controlPlane.isOutreachApproved(lead.id, "OUT-1"), true);
});
