import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {stripVTControlCharacters} from 'node:util';
import {runInteractive,createPromptGate} from './interactive.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve('.work/wechat-devtools-051c');
fs.mkdirSync(out,{recursive:true});
let n=0;const gate=createPromptGate(true,()=>n++);
gate.observe('IDE service port disabled. Please enter y to confirm enabling CLI capability.');
gate.observe('Trust project (y/N) ? Login required (y/N) ?');assert.equal(n,0);
gate.observe('\x1b[32mEnable IDE Serv');gate.observe('ice (y/N) ?\x1b[0m');assert.equal(n,1);
gate.observe('Enable IDE Service (y/N) ?');assert.equal(n,1);
let denied=0;createPromptGate(false,()=>denied++).observe('Enable IDE Service (y/N) ?');assert.equal(denied,0);
const report={result:'fail',backend:'windows-conpty',fixtureOnly:true};
try{
  assert.equal(process.platform,'win32');
  const logPath=path.join(out,'tty-control.log');
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|SYSTEMDRIVE|OS)$/i.test(k)));
  report.run=await runInteractive(process.execPath,[path.join(here,'tty-control.cjs')],{cwd:here,env,timeout:15000,logPath,allowService:true});
  const output=stripVTControlCharacters(fs.readFileSync(logPath,'utf8'));
  assert.equal(report.run.code,0,JSON.stringify(report.run));
  assert.match(output,/PUBLISHER_TTY_READY/);assert.match(output,/PUBLISHER_TTY_CONFIRM_OK/);
  assert.equal(report.run.serviceConfirmationSent,true);report.result='pass';
}catch(e){report.error=String(e);console.error(report.error);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'tty-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
