# Step 9 — Controlled Resend Email Test

Step 9 adds a deliberately narrow live-email test path.

## Safety gates

The test endpoint is available only when all of these are true:

- `SALES_TEST_MODE=true`
- `SALES_PROVIDER_ENABLED=true`
- `SALES_TEST_RECIPIENT` is configured
- `SALES_TEST_TOKEN` is configured
- the request supplies the matching Bearer token

The endpoint never accepts a recipient address, subject, or message body from the caller. The recipient is fixed by server-side configuration and the message content is fixed in code.

This prevents the test endpoint from becoming a general-purpose outbound email relay.

## Runtime variables

For the controlled test, add these in Render:

```
SALES_TEST_MODE=true
SALES_TEST_RECIPIENT=<an email address you control>
SALES_TEST_TOKEN=<long random secret>
```

Keep the existing provider variables:

```
SALES_PROVIDER_ENABLED=true
SALES_PROVIDER_NAME=resend
RESEND_API_KEY=<secret>
RESEND_FROM=onboarding@resend.dev
```

After the test, set `SALES_PROVIDER_ENABLED=false` and `SALES_TEST_MODE=false`.

## Endpoint

`POST /test-email`

Authentication:

```
Authorization: Bearer <SALES_TEST_TOKEN>
```

No request body is required.

## Duplicate-send protection

The Resend transport supports an `Idempotency-Key` header. The controlled test uses the fixed key `restaurant-business-ai-resend-test-v1`, so repeated identical test requests within Resend's idempotency window return the same email ID instead of creating duplicate emails. Resend documents a 24-hour idempotency window.

## Expected response

A successful request returns a JSON object containing:

- `status: "sent"`
- `test: true`
- the configured test recipient
- the Resend provider result and message ID

The test does not create or modify a sales lead and does not bypass the human-approval workflow used for real outreach.

## Test procedure

1. Set the test variables in Render.
2. Temporarily enable both provider and test mode.
3. Deploy.
4. Send one POST request with the Bearer token.
5. Confirm the response contains a Resend message ID.
6. Confirm delivery in Resend and the controlled inbox.
7. Immediately disable provider and test mode.
8. Do not use the endpoint for prospect outreach.
