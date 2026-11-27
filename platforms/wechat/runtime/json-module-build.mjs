// The observed WX module loader appends .js to non-JS module names.
// JSON configuration/data files remain data; only runtime imports become JS.
import fs from 'node:fs';
import path from 'node:path';
export function jsonModuleSource(value){
  const json=JSON.stringify(value);
  if(json===undefined)throw Error('JSON module requires serializable data');
  const literal=JSON.stringify(json).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return "'use strict';\nmodule.exports=JSON.parse("+literal+");\n";
}
export function writeJsonModule(project,name,value){
  if(!/^[a-z][a-z0-9-]*\.js$/.test(name))throw Error('Invalid JS module filename');
  fs.writeFileSync(path.join(project,name),jsonModuleSource(value));
}
export function assertWechatEntryRequires(project){
  const entry=fs.readFileSync(path.join(project,'game.js'),'utf8');
  const imports=[...entry.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map(m=>m[2]);
  const count=(entry.match(/\brequire\s*\(/g)||[]).length;
  if(!count||count!==imports.length)throw Error('Unsupported dynamic entry require');
  for(const name of imports){
    if(!/^\.\/[a-zA-Z0-9_-]+\.js$/.test(name)||!fs.existsSync(path.join(project,name)))throw Error('WX entry requires an existing explicit JS module: '+name);
  }
  return imports;
}
