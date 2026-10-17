# Personal Morning Voice Agent

## V1 scope

Every morning at 7:00 Africa/Nairobi, the agent generates a short daily plan from configured goals, tasks, and sales targets, then calls the owner's phone and reads the plan aloud.

The Render cron uses `0 4 * * *` because Render cron schedules are evaluated in UTC; 04:00 UTC is 07:00 in Nairobi. Render documents that cron schedules use UTC. 

## Inputs

- `DAILY_GOALS`: the owner's current outcomes.
- `DAILY_TASKS`: today's known tasks. V1 is intentionally explicit rather than pretending to have calendar access.
- `SALES_TARGET`: the day's sales objective.
- `OPENAI_API_KEY`: generates the spoken plan.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `MORNING_AGENT_TO_NUMBER`: place the outbound call.
- `MORNING_AGENT_ENABLED`: safety switch. Keep `false` until credentials and the test call are verified.

## BUILD → CONNECT → TEST → DEPLOY

### BUILD

The agent lives in `personal-agent/morning-brief.js` and has unit tests in `personal-agent/morning-brief.test.js`.

### CONNECT

Add the required Render environment variables. Do not commit credentials. Twilio requires a voice-enabled number and E.164 phone numbers for outbound calls. OpenAI credentials remain server-side.

### TEST

1. Run `npm test`.
2. Set `MORNING_AGENT_ENABLED=true` only after credentials are present.
3. Trigger the Render cron manually once.
4. Confirm the call arrives and the briefing is accurate.
5. Confirm no invented calendar events, deadlines, sales numbers, or completed work are spoken.

### DEPLOY

After the manual call succeeds, leave the cron enabled. The current schedule is 07:00 Africa/Nairobi.

## V2 planned

- Two-way voice conversation.
- Natural-language changes to the daily plan.
- Calendar and task integration.
- Persistent action history.
- Evening review that feeds the next morning's plan.

V2 is deliberately not included in V1 so the first system remains small, testable, and observable.
