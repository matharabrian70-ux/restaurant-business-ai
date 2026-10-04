# Step 17 — Production Email Domain

Moves the Sales email layer from the Resend test identity toward a real production sender.

## Added

- Explicit production/testing email environment.
- Production sender-domain validation.
- Sender/domain alignment checks.
- Explicit domain-verification gate.
- Production rejection of `onboarding@resend.dev` / `resend.dev`.
- Render configuration placeholders for the production sender.
- Automated tests for production sender safety.

## Required production configuration

Set these runtime values only after the domain is configured in Resend:

```text
SALES_PROVIDER_ENABLED=true
SALES_PROVIDER_NAME=resend
SALES_EMAIL_ENV=production
RESEND_API_KEY=<sending-only key>
RESEND_FROM=Sales <sales@your-domain.example>
RESEND_SENDING_DOMAIN=your-domain.example
RESEND_DOMAIN_VERIFIED=true
```

Never commit `RESEND_API_KEY`.

## Domain setup

1. Own a production domain or a dedicated sending subdomain.
2. Add the domain in Resend.
3. Add the DNS records Resend provides to the domain DNS provider.
4. Wait for Resend to verify the domain.
5. Confirm the domain has sending enabled.
6. Use a sender address on that verified domain.
7. Set the production environment variables above.
8. Keep provider sending disabled until the DNS/domain verification is complete.
9. Perform a controlled test to an address you control before any prospect outreach.

Resend's current domain workflow uses DNS verification and can show which authentication records are still pending. Resend also supports separate sending domains, which is useful for separating production/staging traffic.

## Safety gates

Production sending is fail-closed if:

- the sender is missing;
- the sender address is malformed;
- the sender domain does not match the configured sending domain;
- the sending domain is not marked verified;
- the sender uses `resend.dev` in production.

The existing unsubscribe/suppression layer, human approval, and Sales Control Plane remain mandatory. Step 17 does not enable autonomous outreach.

## DNS/authentication

The application does not attempt to manufacture DNS records or claim that DNS is verified. Resend remains the source of truth for the records and verification status.

Use SPF/DKIM records supplied by Resend. Publish a DMARC policy for the organizational/sending domain and monitor it before tightening enforcement. Do not add guessed DNS values to the application.

## Scope

No mass outreach, automatic domain purchase, DNS mutation, autonomous sending, pricing changes, DOS changes, or credential storage was added.

## Next

Step 18 — End-to-End Sales Pipeline.
