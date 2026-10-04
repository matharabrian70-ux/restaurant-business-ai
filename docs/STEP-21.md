# Step 21 — Persistent Autonomous Worker + Reply Handover

This step turns the sales workflow into a scheduled autonomous worker with durable state.

Flow:
Google Places discovery -> public business website contact extraction -> research/scoring -> personalized email + live prototype -> controlled send -> persistent lead ledger -> Resend inbound webhook -> reply classification -> hot human handover.

The worker does not touch Restaurant DOS or pricing.

PostgreSQL stores the pilot, discovered leads, outbound events and inbound events because Render's default filesystem is ephemeral.

Google Places Text Search (New) is used with a narrow field mask. The worker only uses public business listing data and generic business email addresses found on the restaurant's public website. No private databases are queried.

Positive replies become human_handoff and trigger an owner notification. Negative replies suppress the lead from further outreach. Neutral replies are retained without handoff.

Production configuration:
- DATABASE_URL
- GOOGLE_PLACES_API_KEY
- AUTONOMOUS_SALES_ENABLED=true
- AUTONOMOUS_DAILY_LIMIT=10
- AUTONOMOUS_REQUIRE_CONSENT=false only after confirming the intended direct-marketing basis and compliance requirements
- AUTONOMY_HANDOFF_RECIPIENT
- RESEND_API_KEY
- RESEND_FROM
- RESEND_WEBHOOK_SECRET

Configure Resend email.received webhook at /webhooks/resend.
