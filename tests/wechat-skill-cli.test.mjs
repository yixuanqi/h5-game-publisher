import test from 'node:test';
import assert from 'node:assert/strict';
import {argsFor,statusGate,unwrapResponse,responseGate,fixtureGate,wxWasmFixtureGate,imageTap,pendingDecision} from '../platforms/wechat/skill-cli/contract.mjs';
test('CLI gate requires compatible version and login, distinguishes CLI token from MCP',()=>{
  const ready={versionRelation:'equal',loginExpired:false,mcpTokenRequired:true};
  assert.equal(statusGate(ready),null);
  assert.equal(statusGate({...ready,versionRelation:'agent_behind'}),'RELOAD_SKILL_REQUIRED');
  assert.equal(statusGate({...ready,loginExpired:true}),'LOGIN_REQUIRED');
  assert.equal(statusGate({...ready,cliTokenRequired:true}),'CLI_TOKEN_REQUIRED');
  assert.equal(statusGate({...ready,cliTokenRequired:true},true),null);
  assert.equal(statusGate({...ready,success:false}),'STATUS_FAILED');
  assert.equal(statusGate({versionRelation:'equal'}),'LOGIN_STATE_UNKNOWN');
});
test('allowlist rejects publishing and arbitrary shell, screenshot coordinates remain image-space',()=>{
  assert.throws(()=>argsFor('upload'),/Unapproved/);
  assert.throws(()=>argsFor('quit'),/Unapproved/);
  assert.deepEqual(argsFor('check_wechatide_status',['--skill-version','0.3.11'],'secret'),['-c','H5GamePublisher','check_wechatide_status','--skill-version','0.3.11']);
  assert.deepEqual(imageTap(750,1334),['--action','tap','--x','375','--y','667','--coordinate-space','image','--image-width','750','--image-height','1334']);
});
test('pending cannot count as success and uncertain results fail closed',()=>{
  assert.deepEqual(responseGate({status:'pending',taskId:'a'}),{pending:true,taskId:'a'});
  assert.throws(()=>responseGate({status:'pending'}));
  assert.throws(()=>responseGate({}));
  assert.equal(pendingDecision({status:'pending'}),'wait');
  assert.equal(pendingDecision({status:'success'}),'advance');
  for(const s of ['failed','expired','cancelled','unknown'])assert.equal(pendingDecision({status:s}),'stop');
  assert.equal(unwrapResponse({success:false,data:{success:true}}).success,false);
});
test('refresh or login is not runtime proof: original marker storage bin and increasing touch count mandatory',()=>{
  assert.throws(()=>fixtureGate({success:true}));
  const v={marker:'PUBLISHER_OFFICIAL_READY_051C',taps:0,storage:{immediate:true,removed:true},files:{bin:{ok:true}}};
  assert.equal(fixtureGate(v),true);
  assert.throws(()=>fixtureGate(v,{after:true,previousTaps:0}),/touch/);
  assert.equal(fixtureGate({...v,taps:1},{after:true,previousTaps:0}),true);
});

test('reviewed 0.3.11 runtime-info and phone-preview tools are diagnostic-only allowlisted',()=>{
  assert.doesNotThrow(()=>argsFor('automation_runtime_info',['--action','systemInfo']));
  assert.doesNotThrow(()=>argsFor('auto_preview',[]));
  assert.throws(()=>argsFor('upload'),/Unapproved/);
});
test('WX float-pigment fixture requires real WX runtime, exact Grid result and increasing touch',()=>{
  const v={marker:'PUBLISHER_FLOAT_PIGMENT_WX_052D',phase:'pass',runtime:'wx',taps:0,actualX:103,delta:0};
  assert.equal(wxWasmFixtureGate(v),true);
  assert.throws(()=>wxWasmFixtureGate({...v,runtime:'standard'}),/not ready/);
  assert.throws(()=>wxWasmFixtureGate({...v,actualX:104,delta:1}),/Grid/);
  assert.throws(()=>wxWasmFixtureGate(v,{after:true,previousTaps:0}),/touch/);
  assert.equal(wxWasmFixtureGate({...v,taps:1},{after:true,previousTaps:0}),true);
});
