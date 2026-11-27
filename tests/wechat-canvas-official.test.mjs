import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasDecision,canvasGate,screenshotGate} from '../platforms/wechat/skill-cli/canvas-contract.mjs';
const samples=['title','playing'].flatMap((phase,i)=>[1,10,30].map(n=>({phase,frame:n+i*30,width:844,height:390,opaque:576,colors:100,hash:n.toString(16).padStart(8,'0')})));
const ready={phase:'CANVAS_PLAYING_OBSERVED',moduleLoaded:true,booted:true,releaseReady:false,syntheticDomStart:true,domPaint:'not-wired',inputBridge:'not-wired',layoutBackend:'intentionally-isolated',canvas:{bootMarker:true,moduleMarker:true,titleReady:true,playingReady:true,playingCallbacks:30,completedCallbacks:60,samples}};
test('Canvas evidence gate rejects booting, errors, insufficient frames, static pixels',()=>{
 assert.equal(canvasDecision(null),'retry');assert.equal(canvasDecision({...ready,phase:'BOOTING'}),'retry');
 assert.equal(canvasDecision({...ready,error:'fatal'}),'stop');assert.equal(canvasGate(ready).nativeTouchVerified,false);
 assert.throws(()=>canvasGate({...ready,canvas:{...ready.canvas,playingCallbacks:29}}));
 assert.throws(()=>canvasGate({...ready,canvas:{...ready.canvas,samples:samples.map(s=>({...s,hash:'00000000'}))}}));
 assert.throws(()=>canvasGate({...ready,canvas:{...ready.canvas,samples:samples.map(s=>({...s,frame:1}))}}));
});
test('blank screenshot cannot pass',()=>{
 const data=new Uint8Array(64*36*4);assert.throws(()=>screenshotGate({width:64,height:36,data}));
 for(let i=0;i<data.length;i+=4){data[i]=(i/4)%251;data[i+3]=255;}
 assert.ok(screenshotGate({width:64,height:36,data}).colors>=8);
});
