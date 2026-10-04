# Step 15 — Campaign Engine

Step 15 turns prioritized research targets into controlled, human-approved campaigns.

## Flow

RESEARCH + SCORE -> AUDIENCE -> CAMPAIGN DRAFT -> HUMAN APPROVAL -> DRAFT GENERATION -> CONTROLLED BATCH

## Added

- Campaign object with explicit status, channel, audience and send limits.
- Deterministic audience selection from Step 14 scoring.
- Duplicate lead removal and bounded campaign audience.
- Human campaign approval gate before campaign drafts can be generated.
- Campaign rejection moves the campaign to paused state.
- Batch calculation respects both campaign-wide and daily limits.
- Existing outreach drafts remain human-approved before any actual send.

## Safety boundary

Step 15 does **not**:
- send email, WhatsApp or SMS;
- choose or store provider credentials;
- bypass the Sales Control Plane;
- change pricing;
- scrape prospects;
- contact restaurants automatically;
- modify the Restaurant DOS;
- handle unsubscribe, bounce, complaint or suppression rules.

Actual delivery and compliance controls belong to Step 16.

## Why the double approval remains

A campaign approval is not permission to bypass per-message approval. The campaign controls audience, channel and volume. Existing outreach approval and the Sales Control Plane remain the final gates before communication is recorded or sent.

## Pilot defaults

The engine supports small bounded campaigns. It does not default to mass outreach. A later production configuration can choose appropriate limits after deliverability/compliance controls are implemented.

## Next step

Step 16 — Deliverability & Compliance can add suppression, unsubscribe, bounce/complaint handling, sender safety, and compliance policy checks without changing the campaign interface.
