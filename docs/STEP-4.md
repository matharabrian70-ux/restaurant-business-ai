# Step 4 — Supervisor + First Sales Workflow

## Implemented

The supervisor checks required agent registration, agent errors, failed tasks, and qualified leads waiting for human ownership. It produces deterministic alerts and does not take unrestricted external actions.

The first sales state flow is:

NEW -> RESEARCHING -> READY_FOR_OUTREACH -> CONTACTED -> ENGAGED -> QUALIFIED -> HUMAN_HANDOFF -> YOU CLOSE THE DEAL -> CLOSED_WON -> Service onboarding

A positive response alone does not close a deal. Qualification is the gate into human handoff.

## Deliberate limitations

Step 4 does not yet send real messages, scrape/contact restaurants, connect external lead providers, connect to the DOS, modify DOS data, negotiate pricing, accept contracts, make payments, or deploy a restaurant.

## Human handoff

When a lead reaches HUMAN_HANDOFF:
- automation stops
- the lead is assigned to human
- the next action is human_close
- the supervisor can alert if the handoff is unowned

After you close the deal, CLOSED_WON moves the lead to service_onboarding.

## Commercial boundary

The approved package table is represented in code, but agents cannot change it or apply autonomous discounts in Step 4.
