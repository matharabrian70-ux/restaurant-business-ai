import test from "node:test";
import assert from "node:assert/strict";
import { createLead } from "../src/core/types.js";
import { createOutreachDraft, approveOutreach } from "../src/sales/outreach.js";
import { DryRunTransport } from "../src/sales/transport.js";
import { sendApproved } from "../src/sales/send.js";

test("controlled send uses dry-run transport", async () => {
  const lead = createLead({ id: "L-11", name: "Demo Restaurant" });
  const draft = approveOutreach(
    createOutreachDraft({ lead, research: { name: "Demo Restaurant" } })
  );

  const result = await sendApproved({
    draft,
    recipient: { address: "demo@example.com" },
    policy: { blocked: false },
    transport: new DryRunTransport()
  });

  assert.equal(result.draft.status, "sent");
  assert.equal(result.record.transport, "dry-run");
  assert.equal(result.record.result.status, "simulated");
});

test("unapproved draft is blocked", async () => {
  const lead = createLead({ id: "L-12", name: "Demo Restaurant" });
  const draft = createOutreachDraft({ lead, research: { name: "Demo Restaurant" } });

  await assert.rejects(
    () => sendApproved({
      draft,
      recipient: { address: "demo@example.com" },
      policy: { blocked: false },
      transport: new DryRunTransport()
    }),
    /Approved draft required/
  );
});

test("policy can block a send", async () => {
  const lead = createLead({ id: "L-13", name: "Demo Restaurant" });
  const draft = approveOutreach(
    createOutreachDraft({ lead, research: { name: "Demo Restaurant" } })
  );

  await assert.rejects(
    () => sendApproved({
      draft,
      recipient: { address: "demo@example.com" },
      policy: { blocked: true },
      transport: new DryRunTransport()
    }),
    /blocked/
  );
});
