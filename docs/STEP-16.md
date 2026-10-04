# Step 16 — Deliverability & Compliance

Adds a hard outbound eligibility layer before communication can be sent.

## Added
- Recipient suppression store.
- Unsubscribe, bounce, complaint and spam-complaint suppression.
- Verified-sender requirement.
- Channel allow-list.
- Optional consent requirement.
- Email unsubscribe-mechanism requirement.
- Provider-event normalization.
- Compliance event storage.
- Fail-closed outbound eligibility.

## Flow
PROVIDER EVENT -> NORMALIZE -> SUPPRESS -> FUTURE SENDS BLOCKED

OUTBOUND REQUEST -> SENDER/POLICY/SUPPRESSION CHECK -> ELIGIBLE OR BLOCKED -> EXISTING HUMAN APPROVAL -> SALES CONTROL PLANE -> TRANSPORT

## Boundary
Step 16 does not make outreach autonomous. Campaign approval, per-message human approval, and Sales Control Plane authorization remain intact.

It does not invent consent or claim legal compliance for a specific country. Consent enforcement is configurable because outreach rules vary by jurisdiction and context.

The compliance store is intentionally in-memory for this step. Production persistence and authenticated provider webhooks are not added yet.

No mass sending, DOS changes, pricing changes, credential handling, or legal claims.

## Next
Step 17 — Production Email Domain: establish production sender identity, DNS authentication and sender configuration on top of this eligibility layer.