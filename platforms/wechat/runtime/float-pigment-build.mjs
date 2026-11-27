import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {FLOAT_PIGMENT} from './float-pigment-pin.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
function exec(cmd,args,cwd,timeout=18*60*1000){
  const r=spawnSync(cmd,args,{cwd,encoding:'utf8',timeout,maxBuffer:64*1024*1024,env:{...process.env,CARGO_TERM_COLOR:'never'}});
  if(r.error)throw r.error;
  if(r.status!==0)throw Error(['$ '+cmd+' '+args.join(' '),r.stdout||'',r.stderr||''].join('\n'));
  return r.stdout.trim();
}
function git(cwd,...args){return exec('git',args,cwd,30_000);}
function tomlPath(p){return fs.realpathSync(p).replaceAll('\\','/').replaceAll('"','\\"');}
export function buildFloatPigmentWasm({vendor,workDir,outFile}){
  vendor=fs.realpathSync(vendor);workDir=path.resolve(workDir);outFile=path.resolve(outFile);
  assert.equal(git(vendor,'rev-parse','HEAD'),FLOAT_PIGMENT.sha,'Unexpected float-pigment revision');
  const cargoRoot=fs.readFileSync(path.join(vendor,'Cargo.toml'),'utf8');
  const version=cargoRoot.match(/\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/)?.[1];
  assert.equal(version,FLOAT_PIGMENT.version);
  assert.match(cargoRoot,/license\s*=\s*"MIT"/);
  assert.match(fs.readFileSync(path.join(vendor,'LICENSE'),'utf8'),/Permission is hereby granted/);
  fs.rmSync(workDir,{recursive:true,force:true});fs.mkdirSync(path.join(workDir,'src'),{recursive:true});
  fs.copyFileSync(path.join(here,'float-pigment-bridge.rs'),path.join(workDir,'src/lib.rs'));
  const v=tomlPath(vendor);
  fs.writeFileSync(path.join(workDir,'Cargo.toml'),`[package]\nname = "h5publisher_float_pigment_bridge"\nversion = "0.0.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nfloat-pigment-css = { path = "${v}/float-pigment-css", default-features = false, features = ["std"] }\nfloat-pigment-layout = { path = "${v}/float-pigment-layout" }\nfloat-pigment-forest = { path = "${v}/float-pigment-forest" }\n\n[profile.release]\nopt-level = "s"\nlto = "fat"\ncodegen-units = 1\npanic = "abort"\n`);
  const rustc=exec('rustc',['--version'],workDir,30_000),cargo=exec('cargo',['--version'],workDir,30_000);
  const started=Date.now();exec('cargo',['build','--release','--target','wasm32-unknown-unknown'],workDir);const elapsedMs=Date.now()-started;
  const built=path.join(workDir,'target/wasm32-unknown-unknown/release/h5publisher_float_pigment_bridge.wasm');
  assert.ok(fs.existsSync(built),'Compiled WASM missing');
  fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.copyFileSync(built,outFile);
  const bytes=fs.readFileSync(outFile);
  return {vendor:{...FLOAT_PIGMENT},toolchain:{rustc,cargo},elapsedMs,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),outFile};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [vendor,outFile,workDir]=process.argv.slice(2);
  if(!vendor||!outFile)throw Error('usage: node float-pigment-build.mjs <vendor-checkout> <out.wasm> [work-dir]');
  console.log(JSON.stringify(buildFloatPigmentWasm({vendor,outFile,workDir:workDir||path.join(path.dirname(outFile),'.float-pigment-build')}),null,2));
}
