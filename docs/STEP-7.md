# Step 7 — Provider Configuration Boundary

Step 7 prepares the sales system for its first real communication provider without activating live outreach.

## Added
- Provider configuration with an explicit disabled-by-default flag.
- Provider validation before activation.
- Email transport adapter using dependency injection; vendor code is not embedded yet.
- Tests for disabled-by-default behavior and provider isolation.

## Safety boundary
Human approval from Step 6 remains mandatory. Step 7 does not send messages, store credentials, bypass policy checks, or choose a vendor automatically.

A real provider can be connected later by injecting its sending implementation into EmailTransport. Secrets stay in the runtime secret store/environment, never in Git.

## Flow
OUTREACH DRAFT -> HUMAN APPROVAL -> SEND POLICY -> PROVIDER TRANSPORT -> SEND RECORD

No DOS source, production data, pricing, or deployment behavior is changed by this step.
