# AI Business OS Architecture

The existing Restaurant DOS is the protected product core. This repository is the business automation layer around it.

## Sectors

- Sales: prospecting, research, outreach, qualification
- Service: onboarding, configuration, deployment, testing
- Growth: marketing, retention, analytics
- Supervisor: agent health, orchestration, escalation

## Ownership

### AI Business OS owns
- lead/prospect workflow state
- agent orchestration
- tasks and queues
- authorized outreach workflows
- human handoffs
- onboarding orchestration
- growth service workflows
- agent health and metrics
- its own audit/event records

### DOS owns
- restaurant tenant runtime
- customer ordering
- manager dashboard
- rider dashboard
- Control Centre
- branding/tenant runtime
- orders, payments, delivery and tracking
- production application data
- DOS security and package enforcement

## Integration rule

The AI Business OS uses explicit, controlled DOS capabilities. The DOS remains authoritative for implementation and validation.

Agents may not edit arbitrary DOS source, bypass authentication/authorization, write directly to DOS production tables, alter DOS security controls, change DOS pricing rules, or silently deploy DOS code changes.

## Human approvals

Owner approval is required for commercial offer changes, unapproved discounts, agreements, payment exceptions/refunds, customer-specific commitments, material production risk, and DOS architectural changes.

## Initial build

Start with Sales and Supervisor foundations. Expand only after validation.
