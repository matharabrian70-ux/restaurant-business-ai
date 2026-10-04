import { normalizeAddress, validateOutboundEligibility } from "./compliance.js";
export function createDeliverabilityPolicy({allowedChannels=["email"],requireConsent=false,requireUnsubscribeMechanism=true,hasUnsubscribeMechanism=false,blockAll=false}={}) {
 return {allowedChannels:[...allowedChannels],requireConsent,requireUnsubscribeMechanism,hasUnsubscribeMechanism,blockAll};
}
export function evaluateOutbound(args={}){ return validateOutboundEligibility(args); }
export function normalizeProviderEvent(event={}) {
 const type=String(event.type??"").toLowerCase();
 const address=normalizeAddress(event.recipient??event.email??event.data?.recipient??event.data?.email);
 const map={unsubscribe:"unsubscribed",unsubscribed:"unsubscribed",bounce:"bounced",bounced:"bounced",complaint:"complaint",spam_complaint:"complaint"};
 return {type:map[type]??"ignored",address};
}