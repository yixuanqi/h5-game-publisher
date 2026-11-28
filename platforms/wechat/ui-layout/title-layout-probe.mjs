import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {parseHTML} from 'linkedom/worker';
import {compileRuntimeCssPlan} from '../original-entry/css-plan-build.mjs';
import {resolvePlanStyle} from '../runtime/css-plan-runtime.mjs';
import {createLayoutSnapshot} from './dom-layout.mjs';
const {loadTaffy}=createRequire(import.meta.url)('./taffy-runtime.cjs');
const [checkout,wasm,out]=process.argv.slice(2);
const pin='cdb508594cc610733f248ec5d4123a3b9d954981';
const git=(...args)=>{const r=spawnSync('git',args,{cwd:checkout,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
assert.equal(git('rev-parse','HEAD'),pin);
assert.equal(git('status','--porcelain','--untracked-files=all'),'');
const source=path.join(checkout,'docs/ashen-bell-vow');
const html=fs.readFileSync(path.join(source,'index.html'),'utf8'),css=fs.readFileSync(path.join(source,'styles.css'),'utf8');
const plan=compileRuntimeCssPlan(css);
const backend=await loadTaffy({mode:'host',bytes:fs.readFileSync(wasm)});
const results=[];
for(const env of [{width:844,height:390,pointer:'coarse'},{width:640,height:360,pointer:'coarse'}]){
 const {document}=parseHTML(html);document.body.classList.add('is-mobile');
 const root=document.querySelector('.title-hero-column');
 assert.ok(root);
 const actualChildren=[...root.children];assert.equal(actualChildren.length,2);assert.ok(actualChildren[0].matches('.title-brand-col'));assert.ok(actualChildren[1].matches('.title-action-col'));
 function styleOf(el){const parent=el.parentElement;const r=resolvePlanStyle(plan,el,env,parent?styleOf(parent):{});assert.equal(r.unsupportedSelectors.length,0);return r.values;}
 const s=styleOf(root);
 assert.equal(s.display,'grid');
 // Only the horizontal track geometry is under test. Retain authored width and track
 // declarations. Empty synthetic leaves avoid claiming text/SVG/intrinsic or scroll parity.
 const allowed=['display','width','grid-template-columns','column-gap','row-gap','align-items','box-sizing'];
 const projected=Object.fromEntries(allowed.filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));
 const leaves=actualChildren.map(el=>({element:{childNodes:[]},style:{'min-width':styleOf(el)['min-width']??'0px'}}));
 const boundary={childNodes:[]};
 const snap=createLayoutSnapshot(backend,{element:boundary,style:projected,children:leaves},env);
 const rect=snap.rect(boundary),a=snap.rect(leaves[0].element),b=snap.rect(leaves[1].element);
 const width=Math.min(760,env.width*.94),gap=parseFloat(s['column-gap']);
 const tracks=s['grid-template-columns'].match(/^minmax\(0(?:px)?,\s*([\d.]+)fr\)\s+minmax\(([\d.]+)px,\s*([\d.]+)fr\)$/);
 assert.ok(tracks,'Unexpected source Grid template: '+s['grid-template-columns']);
 const [,left,min,right]=tracks.map(Number),free=width-gap;
 const bw=Math.max(min,free*right/(left+right)),aw=free-bw;
 const expected={rootWidth:width,leftWidth:aw,rightX:aw+gap,rightWidth:bw};
 const actual={rootWidth:rect.width,leftWidth:a.width,rightX:b.x,rightWidth:b.width};
 const delta=Math.max(...Object.keys(expected).map(k=>Math.abs(expected[k]-actual[k])));
 results.push({viewport:env,sourceStyle:projected,expected,actual,maxDeltaPx:delta});
 assert.ok(delta<=0.5,'Title track geometry deviation '+delta);
}
assert.equal(git('status','--porcelain','--untracked-files=all'),'');
const report={stage:'V0.5.4b1',sourceSha:pin,scope:'authored-title-horizontal-track-projection-empty-leaves',host:'pass',wx:'not-run',releaseReady:false,visualParity:false,results};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
