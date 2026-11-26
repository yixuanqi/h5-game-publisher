import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {snapshot,assertSnapshot,digestManifest} from '../../../scripts/source-integrity.mjs';
import {openPreview,pixelDelta} from './preview-session.mjs';
const mode=process.argv[2];assert.ok(['control','frozen-game'].includes(mode));
const out=path.resolve('.work/wechat-helper-051b',mode);fs.mkdirSync(out,{recursive:true});
const project=mode==='control'?path.resolve('platforms/wechat/helper/interaction-fixture'):path.resolve('.work/wechat-helper-051b/input/project');
const spec={runId:45825728399,projectArtifact:15119442798,reportArtifact:15119432777,sourceSha:'cdb508594cc610733f248ec5d4123a3b9d954981',frameworkSha:'5e9a0282fb4af06f123ba3b2e9a0c1dc11544306',projectDigest:'1804a1d704885d646682ba38ecf6e647ec286d50876ca4d350bc40d57a9085ae'};
const report={stage:'0.5.1b',mode,scope:'diagnostics-only',officialDevTools:'not-run',device:'not-run',releaseReady:false,strictCompatibility:'not-established',knownHelperBlockers:['WX_SYNC_STORAGE_MISMATCH','MCP_LOG_STREAM_MISSING'],checks:{},steps:[],result:'fail'};
let s,before;
function write(){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
function traceHas(rows,re){return rows.some(x=>re.test(x.s));}
function errors(events,from=0){return events.slice(from).filter(x=>x.type==='pageerror'||x.type==='console:error');}
try{
  before=snapshot(project);
  if(mode==='frozen-game'){
    const info=JSON.parse(fs.readFileSync('.work/wechat-helper-051b/input/evidence/build-info.json','utf8'));
    assert.equal(info.kind,'wechat-progress-not-release');assert.equal(info.releaseReady,false);assert.equal(info.sourceSha,spec.sourceSha);assert.equal(info.framework.commit,spec.frameworkSha);assert.equal(info.framework.dirty,false);assert.equal(info.projectFilesSha256,spec.projectDigest);assert.equal(digestManifest(before),spec.projectDigest);assert.deepEqual(before,info.projectFiles);report.baseline=spec;
  }
  report.checks.immutableInput=true;
  s=await openPreview(project,out);report.checks.helperStarted=true;
  const ready=mode==='control'?/CONTROL_READY/:/^(灰钟残誓|Ashen Bell Vow)$/;
  const painted=await s.until(async()=>traceHas(await s.trace(),ready),20000);
  const first=await s.capture('01-initial');report.initial=first.stats;
  report.checks.initialScreenshot=true;
  if(mode==='control'){
    assert.ok(painted,'Control did not draw expected title');
    assert.ok(s.events.some(e=>e.text.includes('HELPER_051B_CONTROL_READY')));
    const index=s.events.length,when=Date.now(),point=await s.tap(422,195);
    const touched=await s.until(async()=>traceHas(await s.trace(when),/CONTROL_TOUCHED/)&&s.events.slice(index).some(e=>e.text.includes('HELPER_051B_CONTROL_TOUCHED')));
    const after=await s.capture('02-touch');const diff=pixelDelta(first.bytes,after.bytes);
    assert.ok(touched&&diff!==null&&diff>.1,'Control touch did not change visible game');
    assert.ok(errors(s.events,index).some(e=>e.text.includes('HELPER_051B_CONTROL_EXPECTED_ERROR')),'Expected error not captured');
    Object.assign(report.checks,{controlTouch:true,controlPixelDelta:true,controlErrorCapture:true});report.steps.push({point,diff});report.gameResult='not-applicable';
  }else{
    report.checks.titleRendered=!!painted;
    const initialErrors=errors(s.events);report.initialErrors=initialErrors;
    if(!painted){
      // Record the actual blocker and keep the diagnostic pipeline honest.
      assert.ok(initialErrors.length>0,'No title and no actionable runtime error; diagnostic incomplete');
      report.gameResult='blocked-at-startup';report.blocker=initialErrors.at(-1).text;report.checks.menuTouch=false;report.checks.startAttempt=false;
    }else{
      assert.ok(first.stats.colors>100&&first.stats.nonBlack>first.stats.area*.1,'Title frame is blank');
      const beforeTap=Date.now(),menuPoint=await s.tap(153,235);
      const settings=await s.until(async()=>traceHas(await s.trace(beforeTap),/^(动态光影：|Dynamic lighting:)/),8000);
      const menuShot=await s.capture('02-settings');const diff=pixelDelta(first.bytes,menuShot.bytes);
      report.steps.push({action:'settings',point:menuPoint,painted:!!settings,pixelDelta:diff});report.checks.menuTouch=!!settings&&diff!==null&&diff>.01;
      if(!report.checks.menuTouch){report.gameResult='blocked-at-menu-touch';report.blocker='No verified settings route after actual touch';}
      else{
        const backAt=Date.now(),backPoint=await s.tap(698,61);
        const back=await s.until(async()=>traceHas(await s.trace(backAt),ready),8000);report.steps.push({action:'back',point:backPoint,painted:!!back});
        assert.ok(back,'Settings opened but return to title not verified');report.checks.returnTitle=true;
        const idx=s.events.length,started=Date.now(),startPoint=await s.tap(153,143);report.checks.startAttempt=true;
        const outcome=await s.until(async()=>{const e=errors(s.events,idx);if(e.length)return {error:e};if(traceHas(await s.trace(started),/^(生命|HP)$/))return {playing:true};return null;},12000);
        const after=await s.capture('03-start');report.steps.push({action:'start',point:startPoint,outcome,pixelDelta:pixelDelta(first.bytes,after.bytes)});
        if(outcome?.error){report.gameResult='blocked-after-start';report.blocker=outcome.error.map(x=>x.text).join('\n');}
        else if(outcome?.playing){report.gameResult='gameplay-hud-rendered';report.checks.gameplayHud=true;}
        else{report.gameResult='blocked-after-start';report.blocker='Start tap produced neither gameplay HUD nor explicit error within timeout';}
      }
    }
  }
  report.result='pass'; // Diagnostic execution completed. Never a gameplay/release verdict.
}catch(e){report.error=String(e?.stack||e);console.error(report.error);process.exitCode=1;}
finally{
  if(s){try{fs.writeFileSync(path.join(out,'paint-trace.json'),JSON.stringify(await s.trace(),null,2));await s.close();}catch(e){report.cleanupError=String(e);report.result='fail';process.exitCode=1;}}
  if(before){try{assertSnapshot(project,before,'Diagnostic input');report.checks.inputUnchanged=true;}catch(e){report.result='fail';report.integrityError=String(e);process.exitCode=1;}}
  write();
  const summary=['## V0.5.1b '+mode,'- Diagnostic: '+report.result,'- Game result: '+(report.gameResult||'not established'),'- Blocker: '+(report.blocker||report.error||'none'),'- Official DevTools: NOT RUN','- Release ready: false'].join('\n')+'\n';
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
}
