// Contract for reviewed wechatide-skill 0.3.11. No subprocesses in this file.
export const skillVersion='0.3.11';
export const clientName='H5GamePublisher';
export const allowedTools=new Set(['check_wechatide_status','project_import','open_project_window','simulator_refresh','simulator_screenshot','automation_runtime_info','automation_evaluate','automation_game_action','get_simulator_console','get_simulator_network','auto_preview','polling_task_result']);
export function argsFor(tool,flags=[],token){
  if(!allowedTools.has(tool))throw Error('Unapproved tool: '+tool);
  const args=['-c',clientName,tool,...flags];
  if(token&&tool!=='check_wechatide_status')args.push('--token',token);
  if(args.some(a=>typeof a!=='string'||/[\0\r\n]/.test(a)))throw Error('Invalid CLI argument');
  return args;
}
export function statusGate(s,hasToken=false){
  if(!s||typeof s!=='object')return 'STATUS_UNRECOGNIZED';
  if(s.status==='pending')return 'STATUS_PENDING';
  if(s.success===false||['failed','cancelled','expired','error'].includes(s.status))return 'STATUS_FAILED';
  if(s.versionRelation==='agent_behind')return 'RELOAD_SKILL_REQUIRED';
  if(!['equal','agent_ahead'].includes(s.versionRelation))return 'SKILL_VERSION_UNVERIFIED';
  if(s.loginExpired===true)return 'LOGIN_REQUIRED';
  if(s.loginExpired!==false)return 'LOGIN_STATE_UNKNOWN';
  if((s.cliTokenRequired===true||s.tokenRequired===true)&&!hasToken)return 'CLI_TOKEN_REQUIRED';
  return null; // MCP token is unrelated to this CLI transport.
}
export function unwrapResponse(v){
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Unrecognized CLI JSON response');
  // Preserve outer failure/pending state. Never let nested success mask it.
  if(v.success===false||['pending','failed','cancelled','expired','error'].includes(v.status))return v;
  if(v.data&&typeof v.data==='object'&&!Array.isArray(v.data))return {...v,...v.data};
  if(v.result&&typeof v.result==='object'&&!Array.isArray(v.result))return {...v,...v.result};
  return v;
}
export function responseGate(v){
  if(v.status==='pending'){
    if(typeof v.taskId!=='string'||!v.taskId)throw Error('Pending without taskId; do not replay');
    return {pending:true,taskId:v.taskId};
  }
  if(v.success===false||['failed','cancelled','expired','error'].includes(v.status)||v.error)throw Error('CLI tool failed; inspect local IDE');
  if(v.success!==true&&v.status!=='success')throw Error('Unrecognized CLI success envelope; do not replay');
  return {pending:false};
}
export function fixtureGate(v,{after=false,previousTaps=0}={}){
  if(v?.marker!=='PUBLISHER_OFFICIAL_READY_051C')throw Error('Original fixture marker not observed');
  if(v.storage?.immediate!==true||v.storage?.removed!==true||v.files?.bin?.ok!==true)throw Error('Native storage or binary file check failed');
  if(!Number.isInteger(v.taps)||v.taps<0||(after&&v.taps<=previousTaps))throw Error('Native touch not verified');
  return true;
}
export function wxWasmFixtureGate(v,{after=false,previousTaps=0}={}){
  if(v?.marker!=='PUBLISHER_FLOAT_PIGMENT_WX_052D')throw Error('WX WASM fixture marker not observed');
  if(v.phase!=='pass'||v.runtime!=='wx')throw Error('WXWebAssembly float-pigment probe not ready');
  if(!Number.isFinite(v.actualX)||!Number.isFinite(v.delta)||Math.abs(v.actualX-103)>0.05||v.delta>0.05)throw Error('WX float-pigment Grid result mismatch');
  if(!Number.isInteger(v.taps)||v.taps<0||(after&&v.taps<=previousTaps))throw Error('WX WASM native touch not verified');
  return true;
}
export function imageTap(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2)throw Error('Invalid screenshot dimensions');
  return ['--action','tap','--x',String(Math.floor(width/2)),'--y',String(Math.floor(height/2)),'--coordinate-space','image','--image-width',String(width),'--image-height',String(height)];
}
export function pendingDecision(v){
  if(v?.status==='pending')return 'wait';
  if(v?.status==='success'&&v.success!==false)return 'advance';
  return 'stop'; // No automatic retries for failed, cancelled, expired, unknown.
}
