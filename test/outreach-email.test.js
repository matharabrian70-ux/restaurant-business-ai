import test from "node:test";
import assert from "node:assert/strict";
import { createOutreachDraft } from "../src/sales/outreach.js";

test("outreach draft has real line breaks, HTML presentation and prototype attachment", () => {
  const draft = createOutreachDraft({
    lead: { id: "L-PILI", name: "Pili Restaurant" },
    research: {
      name: "Pili Restaurant",
      notes: [
        "Already offers direct online ordering on its website; customers arrange their own delivery rider or pickup."
      ],
      hasOnlineOrdering: true,
      deliveryAvailable: true,
      multipleBranches: false
    },
    channel: "email"
  });

  assert.equal(draft.body.includes("\\n"), false);
  assert.match(draft.body, /Pili Restaurant/);
  assert.match(draft.html, /<!doctype html>/i);
  assert.match(draft.html, /View the Restaurant Prototype/);
  assert.match(draft.html, /matharabrian70-ux\.github\.io\/Restaurant-Website-Prototype/);
  assert.deepEqual(draft.attachments, [
    {
      path: "https://github.com/matharabrian70-ux/Restaurant-Website-Prototype/archive/refs/heads/main.zip",
      filename: "Restaurant-Website-Prototype.zip"
    }
  ]);
});

test("non-email outreach channels do not receive the email prototype attachment", () => {
  const draft = createOutreachDraft({
    lead: { id: "L-1", name: "Example Restaurant" },
    channel: "manual"
  });

  assert.deepEqual(draft.attachments, []);
});
