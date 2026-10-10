import pg from "pg";
import { ConsentLedger } from "./consent-ledger.js";

const { Pool } = pg;

export class PostgresAutonomyStore {
  constructor({ connectionString = process.env.DATABASE_URL, ssl = true } = {}) {
    if (!connectionString) throw new Error("DATABASE_URL is required for persistent autonomy");
    this.pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      max: 3
    });
    this.consent = new ConsentLedger(this.pool);
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS autonomy_kv (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS autonomy_leads (
        identity TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        website TEXT,
        stage TEXT NOT NULL,
        payload JSONB NOT NULL,
        last_outreach_at TIMESTAMPTZ,
        handoff_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS autonomy_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.consent.init();
  }

  async get(key, fallback = null) {
    const { rows } = await this.pool.query(
      "SELECT value FROM autonomy_kv WHERE key = $1",
      [key]
    );
    return rows[0]?.value ?? fallback;
  }

  async set(key, value) {
    await this.pool.query(
      `INSERT INTO autonomy_kv(key,value) VALUES($1,$2)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
      [key, JSON.stringify(value)]
    );
    return value;
  }

  async getLead(identity) {
    const { rows } = await this.pool.query(
      "SELECT * FROM autonomy_leads WHERE identity = $1",
      [identity]
    );
    return rows[0] ?? null;
  }

  async upsertLead(lead) {
    await this.pool.query(
      `INSERT INTO autonomy_leads
       (identity,lead_id,name,email,website,stage,payload,last_outreach_at,handoff_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(identity) DO UPDATE SET
         lead_id=EXCLUDED.lead_id,name=EXCLUDED.name,email=EXCLUDED.email,
         website=EXCLUDED.website,stage=EXCLUDED.stage,payload=EXCLUDED.payload,
         last_outreach_at=COALESCE(EXCLUDED.last_outreach_at,autonomy_leads.last_outreach_at),
         handoff_at=COALESCE(EXCLUDED.handoff_at,autonomy_leads.handoff_at),
         updated_at=NOW()`,
      [
        lead.identity, lead.leadId, lead.name, lead.email ?? null,
        lead.website ?? null, lead.stage, JSON.stringify(lead.payload),
        lead.lastOutreachAt ?? null, lead.handoffAt ?? null
      ]
    );
    return lead;
  }

  async suppressEmail({ email, reason, source = "provider", at = new Date().toISOString() } = {}) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) throw new Error("A valid email address is required for suppression");
    if (!reason) throw new Error("Suppression reason is required");
    const key = "suppression:" + normalized;
    const existing = await this.get(key);
    const entry = {
      email: normalized,
      reason: String(reason),
      source: String(source),
      at,
      firstSuppressedAt: existing?.firstSuppressedAt || at
    };
    await this.set(key, entry);
    return entry;
  }

  async getSuppression(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return null;
    return this.get("suppression:" + normalized);
  }

  async isSuppressed(email) {
    return Boolean(await this.getSuppression(email));
  }

  async findLeadByEmail(email) {
    const { rows } = await this.pool.query(
      "SELECT * FROM autonomy_leads WHERE LOWER(email)=LOWER($1) LIMIT 1",
      [email]
    );
    return rows[0] ?? null;
  }

  async listHandoffs() {
    const { rows } = await this.pool.query(
      "SELECT * FROM autonomy_leads WHERE handoff_at IS NOT NULL ORDER BY handoff_at DESC"
    );
    return rows;
  }

  async listLeads({ limit = 500 } = {}) {
    const { rows } = await this.pool.query(
      "SELECT * FROM autonomy_leads ORDER BY updated_at DESC LIMIT $1",
      [Math.min(Math.max(Number(limit) || 500, 1), 1000)]
    );
    return rows;
  }

  async listEvents({ limit = 1000 } = {}) {
    const { rows } = await this.pool.query(
      "SELECT event_id, event_type, payload, created_at FROM autonomy_events ORDER BY created_at DESC LIMIT $1",
      [Math.min(Math.max(Number(limit) || 1000, 1), 2000)]
    );
    return rows;
  }

  async recordEvent(eventId, eventType, payload) {
    const result = await this.pool.query(
      `INSERT INTO autonomy_events(event_id,event_type,payload)
       VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING`,
      [eventId, eventType, JSON.stringify(payload)]
    );
    return result.rowCount === 1;
  }

  async getConsentByEmail(email) {
    return this.consent.getByEmail(email);
  }

  async recordConsent({ email, source, at, method } = {}) {
    return this.consent.recordAllowed({ email, source, at, method });
  }

  async revokeConsent({ email, source, at, method } = {}) {
    return this.consent.revoke({ email, source, at, method });
  }

  async close() {
    await this.pool.end();
  }
}
