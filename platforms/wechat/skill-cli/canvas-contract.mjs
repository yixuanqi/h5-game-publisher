import fs from 'node:fs';
import path from 'node:path';
import {snapshot,digestManifest} from '../../../scripts/source-integrity.mjs';
export function checkCanvasProject(project,info){
  if(info?.kind!=='wechat-canvas-diagnostic-052g-not-release'||info.sourceSha!=='cdb508594cc610733f248ec5d4123a3b9d954981'||info.mainBlob!=='b7ec66093bb03ccd498b75b500f968b3af7c04ed'||info.sourceIntegrity!=='pass'||info.frameworkDirty!==false||info.releaseReady!==false||info.engineInputs!==67||info.floatPigment!=='intentionally-isolated'||!/^[a-f0-9]{40}$/.test(info.framework))throw Error('Canvas build-info mismatch');
  const actual=snapshot(project);
  if(JSON.stringify(actual)!==JSON.stringify(info.projectFiles)||digestManifest(actual)!==info.projectFilesSha256)throw Error('Canvas project digest mismatch');
  for(const f of ['game.js','host.js','engine.js','html.js','layout-plan.js','game.json','project.config.json','diagnostic-contract.json'])if(!actual.some(x=>x.path===f))throw Error('Missing '+f);
  const c=JSON.parse(fs.readFileSync(path.join(project,'project.config.json'),'utf8')),d=JSON.parse(fs.readFileSync(path.join(project,'diagnostic-contract.json'),'utf8'));
  if(c.appid!=='touristappid'||c.compileType!=='game'||c.miniprogramRoot!=='./'||d.kind!==info.kind||d.sourceSha!==info.sourceSha||d.releaseReady!==false||d.expectedStateGlobal!=='__H5PUBLISHER_CANVAS_PROBE__'||d.successPhase!=='CANVAS_PLAYING_OBSERVED')throw Error('Canvas diagnostic identity mismatch');
  return {sourceSha:info.sourceSha,framework:info.framework,projectFilesSha256:info.projectFilesSha256};
}
export function canvasDecision(v){
  if(v==null)return 'retry';
  if(v.error||v.canvas?.error||v.releaseReady!==false||v.layoutBackend!=='intentionally-isolated')return 'stop';
  if(['PREPARING','CANVAS_HOST_READY','BOOTING'].includes(v.phase))return 'retry';
  return v.phase==='CANVAS_PLAYING_OBSERVED'?'ready':'stop';
}
export function canvasGate(v){
  if(canvasDecision(v)!=='ready'||v.moduleLoaded!==true||v.booted!==true||v.syntheticDomStart!==true||v.domPaint!=='not-wired'||v.inputBridge!=='not-wired')throw Error('Original Canvas runtime not ready');
  const c=v.canvas;
  if(c?.bootMarker!==true||c.moduleMarker!==true||c.titleReady!==true||c.playingReady!==true||!Number.isInteger(c.playingCallbacks)||c.playingCallbacks<30||!Number.isInteger(c.completedCallbacks)||c.completedCallbacks<c.playingCallbacks||!Array.isArray(c.samples))throw Error('Missing original frame evidence');
  for(const phase of ['title','playing']){
    const s=c.samples.filter(x=>x.phase===phase&&Number.isInteger(x.frame)&&x.frame>0&&x.frame<=c.completedCallbacks&&x.width>=32&&x.height>=18&&x.opaque>=100&&x.colors>=8&&/^[0-9a-f]{8}$/.test(x.hash));
    if(new Set(s.map(x=>x.frame)).size<3||new Set(s.map(x=>x.hash)).size<2)throw Error('Missing changing '+phase+' screen evidence');
  }
  return {completedCallbacks:c.completedCallbacks,playingCallbacks:c.playingCallbacks,samples:c.samples,syntheticDomStart:true,nativeTouchVerified:false};
}
export function screenshotGate(p){
  if(!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<32||p.height<18||p.data.length!==p.width*p.height*4)throw Error('Invalid simulator PNG');
  let visible=0;const colors=new Set();
  for(let y=0;y<18;y++)for(let x=0;x<32;x++){
    const i=(Math.floor((y+.5)*p.height/18)*p.width+Math.floor((x+.5)*p.width/32))*4;
    if(p.data[i+3])visible++;
    colors.add(Array.from(p.data.subarray(i,i+4)).join(','));
  }
  if(visible<100||colors.size<8)throw Error('Blank simulator screenshot');
  return {width:p.width,height:p.height,visible,colors:colors.size};
}
