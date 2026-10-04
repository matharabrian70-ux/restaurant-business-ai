# Step 14 — Lead Research + Scoring Engine

Step 14 turns structured prospects into research-ready, prioritized sales targets.

## Flow

PROSPECT -> RESEARCH -> SIGNAL EXTRACTION -> SCORE -> PRIORITY

## Added

- Controlled research normalization using the existing research field boundary.
- Deterministic opportunity scoring from five components:
  - digital gap
  - business fit
  - growth opportunity
  - contactability
  - data confidence
- Bounded 0–100 score and critical/high/normal/low priority.
- Research result object that preserves the original prospect.
- Target selection sorted by highest opportunity score.
- Completeness reporting before a prospect proceeds further.

## Research boundary

This engine evaluates research data supplied by approved discovery/research sources. It does not scrape websites, access private accounts, guess personal information, contact restaurants, or automatically send outreach.

Signals are explicit inputs; the engine does not invent evidence.

## Scoring

The score is transparent and deterministic. Maximum component contributions are:
- Digital gap: 30
- Business fit: 25
- Growth opportunity: 20
- Contactability: 15
- Data confidence: 10

Total maximum: 100.

## Safety

- No outreach is sent.
- No pricing or negotiation occurs.
- No DOS data is accessed or modified.
- No credentials are stored in research records.
- Research remains auditable because the score components are returned with the total.

## Next step

Step 15 can use these prioritized prospects to build the campaign engine while preserving the existing human approval and control-plane gates.
