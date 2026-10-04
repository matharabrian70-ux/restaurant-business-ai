# Step 8 — Resend Email Provider

Step 8 connects the sales transport boundary to a real email provider: Resend.

## Runtime configuration

Set these only in the runtime secret/environment configuration:

- SALES_PROVIDER_ENABLED=true
- SALES_PROVIDER_NAME=resend
- RESEND_API_KEY=<sending-only Resend API key>
- RESEND_FROM=<verified sender/domain>

Never commit the API key.

Resend supports API-based sending and sending-only API-key permissions. It also supports idempotency for duplicate/retry protection. 

## Safety

Live sending remains disabled until SALES_PROVIDER_ENABLED is explicitly set to true and valid credentials are present.

The existing human approval and send-policy gates remain upstream. The provider adapter cannot create or approve an outreach draft.

## Flow

OUTREACH DRAFT -> HUMAN APPROVAL -> SEND POLICY -> RESEND -> SEND RECORD

## Test procedure

1. Create a Resend account and a sending-only API key.
2. Verify the sender/domain required for the intended From address.
3. Add the secrets to the runtime environment, never Git.
4. Keep provider disabled while wiring/testing.
5. Send one approved test message to an address you control.
6. Confirm the provider message ID is recorded.
7. Only then consider controlled prospect outreach.
