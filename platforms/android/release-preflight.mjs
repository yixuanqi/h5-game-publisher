import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifyRun,collectEvidence} from './release-evidence.mjs';
import {assertReleaseIdentity} from './quality.mjs';
const [phase,game,runId,sha,approved,mode]=process.argv.slice(2);
assert.ok(['run','artifacts'].includes(phase));
assert.ok(['demo','ashen-bell-vow','curio-box'].includes(game));
assert.match(runId,/^[1-9]\d*$/);assert.match(sha,/^[a-f0-9]{40}$/);assert.match(approved,/^[a-f0-9]{64}$/);
assert.ok(['rehearsal','upload'].includes(mode));
const c=JSON.parse(fs.readFileSync('configs/'+game+'.json','utf8'));
assertReleaseIdentity(c,{upload:mode==='upload'});
assert.equal(process.env.GITHUB_REF,'refs/heads/main','Release workflow must be launched on main');
assert.equal(process.env.GITHUB_SHA,sha,'Expected exact workflow commit');
if(phase==='run'){
  const repo=process.env.GITHUB_REPOSITORY,token=process.env.GH_TOKEN;
  assert.ok(repo&&token,'Missing GitHub API context');
  const base=process.env.GITHUB_API_URL||'https://api.github.com';
  async function get(p){
    const r=await fetch(base+'/repos/'+repo+p,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('GitHub API failed: '+r.status);
    return r.json();
  }
  const run=await get('/actions/runs/'+runId),j=await get('/actions/runs/'+runId+'/jobs?per_page=100');
  assert.equal(j.total_count,j.jobs.length,'Incomplete job listing');verifyRun(run,j.jobs,sha,repo,runId);
  console.log('Verified fresh successful framework CI run '+runId+' @ '+sha);
}else{
  const e=collectEvidence(c,'candidate/apk','candidate/aab','candidate/upgrade','candidate/report',sha,runId);
  assert.deepEqual(e,JSON.parse(fs.readFileSync('candidate/report/release-evidence.json','utf8')),'CI evidence differs from independently computed evidence');
  assert.equal(e.unsignedAabSha256,approved,'Selected AAB SHA256 mismatch');
  const version=c.versionCode+'-'+c.versionName;
  const src=path.join('candidate','aab',version),dest=path.join('dist',game,version);
  fs.mkdirSync(dest,{recursive:true});
  for(const n of [game+'-unsigned.aab',game+'-unsigned.aab.sha256',game+'-unsigned.aab.validation.json','build-info.json','package-lock.json']){
    fs.copyFileSync(path.join(src,n),path.join(dest,n),fs.constants.COPYFILE_EXCL);
  }
  fs.writeFileSync(path.join(dest,'release-evidence.json'),JSON.stringify(e,null,2)+'\n',{flag:'wx'});
  console.log('Candidate confirmed: '+game+' '+approved);
}
