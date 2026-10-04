import test from "node:test";
import assert from "node:assert/strict";
import { scoreResearch, researchLead, selectResearchTargets } from "../src/sales/research-engine.js";

test("research scoring is deterministic and bounded", () => {
  const result = scoreResearch({
    name:"Restaurant A", location:"Nairobi", website:null, email:"hello@example.com",
    phone:"+254700000000", hasWebsite:false, hasOnlineOrdering:false, deliveryAvailable:false,
    multipleBranches:true, socialLinks:["https://social.example"],
    signals:{ restaurantTypeMatch:true, localMarketMatch:true, activeSocialPresence:true,
      weakOnlineConversion:true, deliveryDemand:true, contactableDecisionMaker:true }
  });
  assert.equal(result.score, 97);
  assert.equal(result.priority, "critical");
});

test("research lead preserves prospect and reports completeness", () => {
  const result = researchLead({id:"DISC-1",name:"Demo Restaurant"}, {location:"Nairobi",website:"https://demo.example"});
  assert.equal(result.prospect.id, "DISC-1");
  assert.equal(result.completeness.complete, true);
  assert.equal(result.researched, true);
});

test("research targets are ranked highest score first", () => {
  const result = selectResearchTargets([
    {id:"1",name:"A",location:"Nairobi",research:{name:"A",location:"Nairobi"}},
    {id:"2",name:"B",location:"Nairobi",research:{name:"B",location:"Nairobi",website:"https://b.example",email:"b@example.com",multipleBranches:true}}
  ]);
  assert.equal(result[0].prospect.id,"2");
});
