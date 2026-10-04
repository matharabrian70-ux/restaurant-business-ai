# Step 6 — Controlled Outreach Provider Layer

Step 6 adds the boundary between the Sales Agent and an external communication service.

## Flow

OUTREACH DRAFT -> HUMAN APPROVAL -> SEND POLICY -> TRANSPORT -> SEND RECORD

## Added

- A transport interface so the Sales Agent does not depend directly on a vendor.
- A dry-run transport for testing without contacting a restaurant.
- A send policy gate for approval, recipient validation, message length, and a configurable block.
- A send service that records the lead, channel, recipient, transport, result, and timestamp.
- Automated tests for approval, policy blocking, and dry-run delivery.

## Safety boundary

The system cannot pass an unapproved draft to the transport.

No external vendor credentials are stored in the repository.

No live communication service is enabled by this step.

## Live integration

A real transport can be added later behind the same interface. Its credentials should live in runtime secrets, not source code. The chosen service must be appropriate for the selected channel and comply with applicable messaging, consent, and anti-spam requirements.

## DOS boundary

This step does not connect to or modify the Restaurant DOS.

## Testing

The dry-run transport exercises the send path while producing no external communication.
