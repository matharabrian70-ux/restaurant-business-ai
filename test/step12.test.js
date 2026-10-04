import test from "node:test";
import assert from "node:assert/strict";
import { SalesControlPlane } from "../src/sales/control-plane.js";
import { createControlCentreApi } from "../src/sales/control-centre-api.js";
import { LEAD_STAGES, PRIORITIES } from "../src/core/types.js";
import http from "node:http";

async function start(handler){
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  return {server,base:`http://127.0.0.1:${port}`};
}

test("control centre API requires authorization", async () => {
  const cp=new SalesControlPlane();
  const handler=createControlCentreApi({controlPlane:cp,isAuthorized:req=>req.headers.authorization==="Bearer test"});
  const {server,base}=await start(handler);
  try{
    const response=await fetch(base+"/control/queue");
    assert.equal(response.status,401);
  } finally { server.close(); }
});

test("control centre exposes queue to authorized operator", async () => {
  const cp=new SalesControlPlane();
  cp.addLead({id:"lead-12",name:"Test Restaurant",priority:PRIORITIES.HIGH});
  const handler=createControlCentreApi({controlPlane:cp,isAuthorized:req=>req.headers.authorization==="Bearer test"});
  const {server,base}=await start(handler);
  try{
    const response=await fetch(base+"/control/queue",{headers:{Authorization:"Bearer test"}});
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.queue[0].id,"lead-12");
    assert.equal(data.stats.total,1);
  } finally { server.close(); }
});

test("operator can decide a pending outreach approval through API", async () => {
  const cp=new SalesControlPlane();
  cp.addLead({id:"lead-13",name:"Approval Restaurant"});
  cp.transitionLead("lead-13",{type:"researched"});
  cp.requestOutreachApproval("lead-13","draft-13");
  const handler=createControlCentreApi({controlPlane:cp,isAuthorized:req=>req.headers.authorization==="Bearer test"});
  const {server,base}=await start(handler);
  try{
    const response=await fetch(base+"/control/approvals/draft-13/decide",{
      method:"POST",
      headers:{Authorization:"Bearer test","content-type":"application/json"},
      body:JSON.stringify({approved:true})
    });
    assert.equal(response.status,200);
    assert.equal(cp.getApproval("draft-13").status,"approved");
  } finally { server.close(); }
});

test("approval decision is human-owned", async () => {
  const cp=new SalesControlPlane();
  cp.addLead({id:"lead-14",name:"Human Gate"});
  cp.transitionLead("lead-14",{type:"researched"});
  cp.requestOutreachApproval("lead-14","draft-14");
  assert.throws(()=>cp.decideOutreachApproval("draft-14",true,{actor:"agent"}),/human actor/);
  assert.equal(cp.getApproval("draft-14").status,"pending");
  assert.equal(cp.getLead("lead-14").stage,LEAD_STAGES.READY_FOR_OUTREACH);
});
