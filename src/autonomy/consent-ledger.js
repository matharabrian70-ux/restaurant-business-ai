import { createHash } from "node:crypto";

function normalizeEmail(email) {
  const value = String(email ?? "").trim().toLowerCase();
  if (!value || !value.includes("@") || value.length > 320) {
    throw new Error("A valid recipient email is required");
  }
  return value;
}

function normalizeTimestamp(value) {
  const date = new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new Error("A valid consent timestamp is required");
  }
  return date.toISOString();
}

function evidenceRef({ email, source, at, method }) {
  return createHash("sha256")
    .update(JSON.stringify({ email, source, at, method }))
    .digest("hex");
}

export class ConsentLedger {
  constructor(pool) {
    if (!pool) throw new Error("Postgres pool is required for consent ledger");
    this.pool = pool;
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS autonomy_consent (
        email TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK (state IN ('allowed','not_allowed','unknown')),
        source TEXT,
        consented_at TIMESTAMPTZ,
        method TEXT,
        evidence_ref TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async getByEmail(email) {
    const normalized = normalizeEmail(email);
    const { rows } = await this.pool.query(
      "SELECT * FROM autonomy_consent WHERE email = $1",
      [normalized]
    );
    return rows[0] ?? null;
  }

  async recordAllowed({
    email,
    source,
    at = new Date().toISOString(),
    method = "documented_external_consent"
  } = {}) {
    const normalized = normalizeEmail(email);
    const cleanSource = String(source ?? "").trim().slice(0, 500);
    if (!cleanSource) throw new Error("Consent source is required");

    const timestamp = normalizeTimestamp(at);
    const cleanMethod = String(method || "documented_external_consent").trim().slice(0, 100);
    const ref = evidenceRef({
      email: normalized,
      source: cleanSource,
      at: timestamp,
      method: cleanMethod
    });

    await this.pool.query(
      `INSERT INTO autonomy_consent(email,state,source,consented_at,method,evidence_ref)
       VALUES($1,'allowed',$2,$3,$4,$5)
       ON CONFLICT(email) DO UPDATE SET
         state='allowed',
         source=EXCLUDED.source,
         consented_at=EXCLUDED.consented_at,
         method=EXCLUDED.method,
         evidence_ref=EXCLUDED.evidence_ref,
         updated_at=NOW()`,
      [normalized, cleanSource, timestamp, cleanMethod, ref]
    );

    return this.getByEmail(normalized);
  }

  async revoke({
    email,
    source = "recipient opt-out",
    at = new Date().toISOString(),
    method = "opt_out"
  } = {}) {
    const normalized = normalizeEmail(email);
    const timestamp = normalizeTimestamp(at);
    const cleanSource = String(source).trim().slice(0, 500);
    const cleanMethod = String(method).trim().slice(0, 100);
    const ref = evidenceRef({
      email: normalized,
      source: cleanSource,
      at: timestamp,
      method: cleanMethod
    });

    await this.pool.query(
      `INSERT INTO autonomy_consent(email,state,source,consented_at,method,evidence_ref)
       VALUES($1,'not_allowed',$2,$3,$4,$5)
       ON CONFLICT(email) DO UPDATE SET
         state='not_allowed',
         source=EXCLUDED.source,
         consented_at=EXCLUDED.consented_at,
         method=EXCLUDED.method,
         evidence_ref=EXCLUDED.evidence_ref,
         updated_at=NOW()`,
      [normalized, cleanSource, timestamp, cleanMethod, ref]
    );

    return this.getByEmail(normalized);
  }
}
