# Step 18 — End-to-End Sales Pipeline

Step 18 connects the existing sales modules into one controlled per-lead workflow:

1. Prospect discovery and deduplication.
2. Lead research and scoring.
3. Lead creation and transition to ready-for-outreach.
4. Outreach draft generation.
5. Human approval gate.
6. Deliverability/compliance evaluation.
7. Send through the Sales Control Plane.
8. Response classification and qualification.
9. Human handoff.
10. Human close won/lost.

## Safety boundaries

- No autonomous outreach.
- Every outbound draft still requires explicit human approval.
- Suppressed recipients are blocked before transport.
- Sender verification and channel policy are checked before sending.
- Actual sending goes through the existing Sales Control Plane.
- Pricing and DOS remain outside this workflow.
- State is intentionally in-memory at this step; durable persistence is not added here.

## Main API

Use `EndToEndSalesPipeline` from `src/sales/end-to-end-pipeline.js`.

The main operations are:

- `addProspect(record, researchData)`
- `prepareOutreach(leadId, channel)`
- `approveOutreach(draftId)`
- `rejectOutreach(draftId)`
- `sendApprovedOutreach(...)`
- `recordResponse(leadId, response, buyingSignals)`
- `closeWon(leadId)`
- `closeLost(leadId)`
- `getLeadState(leadId)`

Step 18 does not expose an unauthenticated public endpoint. The existing authenticated Control Centre remains the human oversight boundary.
