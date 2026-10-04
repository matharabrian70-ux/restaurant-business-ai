# Step 5 — Real Sales Agent Foundation

Step 5 adds the first safe operational layer for the Sales sector without giving the system unrestricted access to external messaging platforms.

## Added

- Prospect creation and deterministic prospect scoring.
- Research normalization with an explicit allowed-field boundary.
- Outreach draft generation for email/WhatsApp/SMS/manual channels.
- Mandatory human approval before an outreach draft can be marked sent.
- Response classification and buying-signal qualification.
- Automatic transition to HUMAN_HANDOFF when genuine buying interest is detected.
- Tests for the above behavior.

## Operating model

PROSPECT -> RESEARCH -> OUTREACH DRAFT -> HUMAN APPROVAL -> SEND -> RESPONSE -> QUALIFICATION -> HUMAN HANDOFF

The system does not negotiate, close deals, change pricing, sign contracts, take payment, or modify the DOS.

## External integrations

No live email, WhatsApp, SMS, scraping, lead-provider, or DOS integration is enabled in this step. Provider adapters should be added only after the interface and approval boundary are stable.

## Human gate

Outbound messaging remains human-approved in Step 5. This is intentional: the foundation can be tested with real prospect data and approved messages before any provider credentials or automated sending are introduced.

## Next step

Step 6 can add a provider adapter behind the existing outreach interface, with secrets kept in the runtime environment and with rate/consent controls. The provider should be chosen explicitly rather than assumed.
