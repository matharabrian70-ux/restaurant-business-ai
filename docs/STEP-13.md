# Step 13 — Prospect Discovery Engine

Step 13 adds a provider-neutral engine for finding and structuring legitimate restaurant prospects.

## Flow

DISCOVERY SOURCE -> NORMALIZE -> VALIDATE -> QUALITY CHECK -> DEDUPE -> PROSPECT

## What it does

- Accepts prospect records from approved discovery sources.
- Normalizes business information into a controlled schema.
- Keeps provenance through source and source URL/reference fields.
- Validates minimum business identity and location requirements.
- Calculates a deterministic data-quality score.
- Deduplicates using website, business phone, business email, or name + location.
- Converts accepted records into the existing Sales prospect/lead structure.
- Reports accepted, duplicate, and rejected counts.

## Legitimate-source boundary

Supported source categories are:
- manual
- public business directory
- official restaurant website
- referral
- inbound
- approved import

This step does not implement scraping, credentialed directory access, purchased lead lists, private-data harvesting, or autonomous outreach.

The engine should only receive data that the business is permitted to collect/use. Business contact data should be limited to appropriate business-facing information.

## Safety boundaries

- No emails, SMS, WhatsApp messages, calls, or other outreach are sent.
- No human approval is bypassed.
- No DOS data is read or changed.
- No pricing is changed.
- No production credentials are stored in prospect records.
- Unknown fields are discarded rather than propagated through the sales pipeline.

## Output

discoverProspects(records) returns prospects, duplicates, rejected, and counts.

The output is deterministic so Step 14 can build deeper research and scoring on a clean prospect set.

## Next step

Step 14 can add deeper lead research and scoring on the structured prospect records produced here.
