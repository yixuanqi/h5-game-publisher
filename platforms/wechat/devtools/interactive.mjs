import fs from 'node:fs';
import {stripVTControlCharacters} from 'node:util';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Explicit actual prompt only. An explanatory error mentioning 'enter y'
// is not an interactive authorization request.
export function createPromptGate(allowed,send){
  let raw='',sent=false;
  return {get sent(){return sent;},observe(chunk){
    if(!allowed||sent)return;
    raw=(raw+chunk).slice(-8192);
    const text=stripVTControlCharacters(raw);
    if(/Enable IDE Service\s*\(y\/N\)\s*\?/i.test(text)){sent=true;send();}
  }};
}
export function runInteractive(file,args,{cwd,env,timeout=60000,logPath,allowService=false}){
  const pty=require('node-pty');
  fs.writeFileSync(logPath,'');
  return new Promise((resolve,reject)=>{
    let proc,timer,done=false,gate,outputError;
    function finish(v){
      if(done)return;done=true;clearTimeout(timer);
      resolve({...v,backend:'windows-conpty',serviceConfirmationSent:gate?.sent||false,...(outputError?{error:outputError}:{})});
    }
    try{
      proc=pty.spawn(file,args,{name:'xterm-256color',cols:160,rows:40,cwd,env,useConpty:true});
      gate=createPromptGate(allowService,()=>{try{proc.write('y\r');}catch(e){outputError=String(e);}});
      proc.onData(chunk=>{if(done)return;fs.appendFileSync(logPath,chunk,'utf8');gate.observe(chunk);});
      proc.onExit(e=>finish({code:e.exitCode,signal:e.signal}));
      timer=setTimeout(()=>{finish({timeout:true});try{proc.kill();}catch{}},timeout);
    }catch(e){finish({error:String(e)});try{proc?.kill();}catch{}}
  });
}
