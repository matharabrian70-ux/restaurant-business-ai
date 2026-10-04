# Step 19 — Controlled Pilot

Step 19 makes the sales agents operationally ready without turning them into an unrestricted bulk sender.

## Pilot progression

The only supported rollout path is:

**50 → evaluate → 100 → evaluate → 250 → evaluate → 500 → evaluate**

The stage must reach its recipient cap before it can advance. Advancement is a human action.

## Guardrails

- Pilot is disabled by default.
- Daily send limits are enforced separately from the stage cap.
- A recipient can only be attempted once per pilot stage.
- Human approval of every outreach draft remains mandatory.
- Existing Sales Control Plane approval remains mandatory.
- Existing deliverability/compliance checks remain mandatory.
- Provider failures can automatically stop the pilot.
- Complaint threshold automatically stops the pilot.
- Bounce and suppression rates are evaluated against explicit thresholds.
- Agents cannot advance a pilot stage.
- Agents cannot change pilot limits.
- Agents cannot change pricing or touch the Restaurant DOS.
- No public unauthenticated pilot endpoint is added.
- Pilot state is in-memory in this step; persistent storage is intentionally deferred to avoid unnecessary maintenance cost.

## Default stop thresholds

- Bounce rate > 10%
- Complaint count >= 1
- Suppression rate > 5%
- Provider failures >= 3

These are engineering guardrails, not legal/compliance advice.

## Production use

Step 19 does **not** authorize immediate mass outreach. The first live cohort is 50 recipients. After the cohort is completed, review delivery/response outcomes before manually advancing the pilot to 100.

The AI agents are ready for controlled work once the runtime is deployed with the existing provider, control-plane, compliance, and human-approval configuration. They are not autonomous bulk senders.
