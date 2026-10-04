# Step 20 — Autonomous Sales + Human Handover

The sales system now has an explicit autonomous execution engine.

Operating model:

1. Prospect enters the pipeline.
2. Research and scoring run automatically.
3. Outreach is generated automatically.
4. An autonomous policy authorization is recorded.
5. Deliverability and compliance gates still run.
6. The Sales Control Plane remains the only send path.
7. Pilot limits and stop conditions remain active.
8. Positive responses are intended to become human handoffs.
9. Closing remains human-only.

Guardrails:

- Autonomous mode is disabled unless explicitly enabled.
- Pilot stages remain 50 -> 100 -> 250 -> 500.
- Daily and stage caps remain active.
- Duplicate recipients remain blocked.
- Bounce, complaint, suppression and provider-failure stops remain active.
- Existing suppression/compliance checks are not bypassed.
- Pricing and Restaurant DOS are not touched.
- Normal/manual outreach can still use human approval.

This step deliberately does not pretend that a persistent background AI already exists. Full hands-off production operation still needs a durable prospect source, durable lead/pilot state, and an inbound reply channel.

Resend supports inbound email and email.received webhooks, which is a good fit for the reply/handoff layer.
