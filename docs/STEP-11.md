# Step 11 — Enforce the Sales Control Plane

Step 11 makes the control plane an actual enforcement boundary instead of a parallel helper.

## Enforcement

Outbound sales sends must now pass through:

`sendThroughControlPlane()`

The path is:

`OUTREACH DRAFT -> HUMAN APPROVAL -> CONTROL-PLANE GATE -> TRANSPORT -> CONTACTED`

The control plane verifies:

- the draft is explicitly approved;
- the approval belongs to the same lead and draft;
- the lead is in `ready_for_outreach`;
- the stage transition is valid;
- the send is recorded in the audit log.

A direct `outreach_sent` transition without a matching approved control-plane request is rejected.

## What remains separate

The lower-level `sendApproved()` function remains a transport-level primitive for isolated provider tests and internal composition. Production sales workflow code should use `sendThroughControlPlane()` so the approval gate cannot be skipped by the normal path.

## Safety

This step does not enable live prospect outreach. It does not activate Resend, add scraping, change pricing, or modify DOS.

The controlled Resend test endpoint remains separate and is still governed by its existing test-mode gates.

## Verification

`test/control-plane-send.test.js` verifies:

- direct send-state transitions are blocked without control-plane approval;
- an unapproved control-plane send is rejected;
- an approved send advances the lead to `contacted` and writes an audit event.
