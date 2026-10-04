import test from "node:test";
import assert from "node:assert/strict";
import {createSuppressionStore,suppress,isSuppressed,recordUnsubscribe,recordBounce,recordComplaint,SUPPRESSION_REASONS,CONSENT_STATES,validateOutboundEligibility} from "../src/sales/compliance.js";
import {createDeliverabilityPolicy,evaluateOutbound,normalizeProviderEvent} from "../src/sales/deliverability.js";
import {ComplianceStore} from "../src/sales/compliance-store.js";

test("unsubscribe bounce and complaint suppress recipients",()=>{
 const s=createSuppressionStore(); recordUnsubscribe(s," Restaurant@Example.com "); recordBounce(s,"bounce@example.com"); recordComplaint(s,"complaint@example.com");
 assert.equal(isSuppressed(s,"restaurant@example.com"),true); assert.equal(isSuppressed(s,"bounce@example.com"),true); assert.equal(isSuppressed(s,"complaint@example.com"),true); assert.equal(s.get("restaurant@example.com").reason,SUPPRESSION_REASONS.UNSUBSCRIBED);
});
test("suppression blocks outbound eligibility",()=>{
 const s=createSuppressionStore(); suppress(s,"blocked@example.com",SUPPRESSION_REASONS.BLOCKED);
 assert.throws(()=>validateOutboundEligibility({recipient:{address:"blocked@example.com"},suppressionStore:s,sender:{address:"verified@example.com",verified:true}}),/suppressed/);
});
test("verified sender and optional consent are enforced",()=>{
 const s=createSuppressionStore(), p=createDeliverabilityPolicy({requireConsent:true,hasUnsubscribeMechanism:true});
 assert.throws(()=>evaluateOutbound({recipient:{address:"restaurant@example.com"},channel:"email",suppressionStore:s,sender:{address:"verified@example.com",verified:false},consent:CONSENT_STATES.ALLOWED,policy:p}),/verified/);
 assert.throws(()=>evaluateOutbound({recipient:{address:"restaurant@example.com"},channel:"email",suppressionStore:s,sender:{address:"verified@example.com",verified:true},consent:CONSENT_STATES.UNKNOWN,policy:p}),/consent/);
 assert.deepEqual(evaluateOutbound({recipient:{address:"restaurant@example.com"},channel:"email",suppressionStore:s,sender:{address:"verified@example.com",verified:true},consent:CONSENT_STATES.ALLOWED,policy:p}),{eligible:true,address:"restaurant@example.com"});
});
test("email requires unsubscribe mechanism by default",()=>{
 const s=createSuppressionStore(),p=createDeliverabilityPolicy();
 assert.throws(()=>evaluateOutbound({recipient:{address:"restaurant@example.com"},channel:"email",suppressionStore:s,sender:{address:"verified@example.com",verified:true},policy:p}),/unsubscribe/);
});
test("provider events normalize and become suppressions",()=>{
 const s=new ComplianceStore(); assert.deepEqual(normalizeProviderEvent({type:"bounce",recipient:"BAD@EXAMPLE.COM"}),{type:"bounced",address:"bad@example.com"});
 const r=s.applyProviderEvent({type:"bounce",address:"BAD@EXAMPLE.COM"}); assert.equal(r.applied,true); assert.equal(s.isSuppressed("bad@example.com"),true); assert.equal(s.listEvents().length,1);
});
test("unknown provider events are ignored safely",()=>{
 const s=new ComplianceStore(); assert.deepEqual(normalizeProviderEvent({type:"delivered",recipient:"ok@example.com"}),{type:"ignored",address:"ok@example.com"});
 assert.deepEqual(s.applyProviderEvent({type:"delivered",address:"ok@example.com"}),{applied:false,reason:"ignored"});
});