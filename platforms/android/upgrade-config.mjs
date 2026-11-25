import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function upgradeConfig(c){
  if(!Number.isSafeInteger(c.versionCode)||c.versionCode<1||c.versionCode>=2100000000)throw Error('Cannot increment version code');
  return {...c,versionCode:c.versionCode+1,versionName:c.versionName+'-upgrade-test'};
}
export function assertUpgradePair(base,next,c){
  const u=upgradeConfig(c);
  for(const k of ['id','appId','versionCode','versionName']){
    assert.equal(base[k],c[k],'baseline '+k);
    assert.equal(next[k],u[k],'upgrade '+k);
  }
  for(const k of ['framework','source','adapter','android','stagedFilesSha256','sourceFilesSha256','dependencyLock']){
    assert.notEqual(base[k],undefined,'Missing baseline '+k);
    assert.deepEqual(next[k],base[k],'Upgrade changed '+k);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [config,out]=process.argv.slice(2);
  if(!config||!out)throw Error('Usage: node platforms/android/upgrade-config.mjs <config> <output>');
  const c=JSON.parse(fs.readFileSync(config,'utf8'));
  const u=upgradeConfig(c);
  u.source=path.resolve(path.dirname(config),c.source);
  fs.writeFileSync(out,JSON.stringify(u,null,2)+'\n',{flag:'wx'});
}
