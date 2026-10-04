import { createSuppressionStore, suppress } from "./compliance.js";
export class ComplianceStore {
 constructor(){this.suppressions=createSuppressionStore();this.events=[];}
 applyProviderEvent(event,{source="provider"}={}) {
  const reason=event?.type==="unsubscribe"||event?.type==="unsubscribed"?"unsubscribed":event?.type==="bounce"||event?.type==="bounced"?"bounced":event?.type==="complaint"||event?.type==="spam_complaint"?"complaint":null;
  if(!reason||!event.address)return {applied:false,reason:"ignored"};
  const entry=suppress(this.suppressions,event.address,reason,{source}); this.events.push({type:event.type,address:entry.address,at:entry.at}); return {applied:true,entry};
 }
 isSuppressed(address){return this.suppressions.has(String(address).trim().toLowerCase());}
 listEvents(){return this.events.map(e=>({...e}));}
}