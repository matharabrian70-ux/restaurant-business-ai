export const SUPPRESSION_REASONS = Object.freeze({ UNSUBSCRIBED:"unsubscribed", BOUNCED:"bounced", COMPLAINT:"complaint", BLOCKED:"blocked", INVALID:"invalid" });
export const CONSENT_STATES = Object.freeze({ UNKNOWN:"unknown", ALLOWED:"allowed", NOT_ALLOWED:"not_allowed" });
export function normalizeAddress(address){ return String(address ?? "").trim().toLowerCase(); }
export function createSuppressionStore(){ return new Map(); }
export function suppress(store,address,reason,{source="system",at=new Date().toISOString()}={}) {
  const normalized=normalizeAddress(address); if(!normalized) throw new Error("Recipient address is required");
  if(!Object.values(SUPPRESSION_REASONS).includes(reason)) throw new Error("Unsupported suppression reason");
  store.set(normalized,{address:normalized,reason,source,at}); return {...store.get(normalized)};
}
export function isSuppressed(store,address){ return store.has(normalizeAddress(address)); }
export function getSuppression(store,address){ const e=store.get(normalizeAddress(address)); return e?{...e}:null; }
export function recordUnsubscribe(store,address,meta={}){ return suppress(store,address,SUPPRESSION_REASONS.UNSUBSCRIBED,meta); }
export function recordBounce(store,address,meta={}){ return suppress(store,address,SUPPRESSION_REASONS.BOUNCED,meta); }
export function recordComplaint(store,address,meta={}){ return suppress(store,address,SUPPRESSION_REASONS.COMPLAINT,meta); }
export function validateOutboundEligibility({recipient,channel="email",suppressionStore,consent=CONSENT_STATES.UNKNOWN,sender={},policy={}}={}) {
  const address=normalizeAddress(recipient?.address); if(!address) throw new Error("Recipient address is required");
  if(!suppressionStore) throw new Error("Suppression store is required");
  if(isSuppressed(suppressionStore,address)) throw new Error("Recipient is suppressed");
  if(policy.blockAll) throw new Error("Outbound compliance policy blocked this send");
  if(policy.allowedChannels && !policy.allowedChannels.includes(channel)) throw new Error("Channel is not allowed by outbound policy");
  if(policy.requireConsent && consent!==CONSENT_STATES.ALLOWED) throw new Error("Required recipient consent is not present");
  if(!sender.address) throw new Error("Verified sender is required");
  if(sender.verified!==true) throw new Error("Sender is not verified");
  if(policy.requireUnsubscribeMechanism && channel==="email" && policy.hasUnsubscribeMechanism!==true) throw new Error("Email unsubscribe mechanism is required");
  return {eligible:true,address};
}