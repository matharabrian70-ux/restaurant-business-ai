# Step 10 — Sales Control Plane

Step 10 adds the operational control layer for the sales workflow without enabling autonomous outreach.

## What it provides

- A lead queue with deterministic priority ordering.
- Explicit allowed lead-stage transitions.
- Append-only audit events for lead creation, workflow transitions, and outreach approval decisions.
- Human-only outreach approval decisions.
- Single-use approval decisions.
- Read-only lead and audit retrieval through the control-plane API.
- No external database or provider dependency yet; state is intentionally in-memory until a persistence layer is justified.

## Workflow

PROSPECT -> RESEARCH -> READY_FOR_OUTREACH -> HUMAN APPROVAL -> SEND -> CONTACTED -> ENGAGED -> HUMAN HANDOFF -> CLOSED

The control plane does not itself send email.

## Safety boundaries

- Agents cannot approve their own outreach.
- Invalid stage jumps are rejected.
- Closed leads cannot re-enter the pipeline.
- Approval decisions cannot be changed after they are recorded.
- The control plane does not accept arbitrary message content for approval decisions.
- No pricing changes, DOS access, scraping, bulk sending, or provider activation were added.

## Queue behavior

Leads are sorted by:
1. Critical
2. High
3. Normal
4. Low

Within the same priority, older updatedAt values are first.

## Persistence

This implementation is deliberately in-memory. A database should be introduced only when durable lead history, multi-instance Render deployment, or concurrent operator access requires it. The API boundary is kept small so persistence can be added later without changing the sales workflow.

## Verification

test/step10.test.js covers:
- queue ordering
- valid transitions
- invalid transition blocking
- human-only approval
- single-use approvals
- transition matrix boundaries
