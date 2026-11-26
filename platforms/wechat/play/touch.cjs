'use strict';
// Track ownership by finger ID; same action held by two fingers releases only after last.
const ACTIONS=new Set(['left','right','up','down','jump','attack','parry','dash','spell','grapple','heal','seal','interact']);
function createTouch(setAction,clearEdges){
  const fingers=new Map(),counts=new Map();
  function start(id,action){
    if(!Number.isFinite(id)||!ACTIONS.has(action)||fingers.has(id))return false;
    fingers.set(id,action);const n=counts.get(action)||0;counts.set(action,n+1);if(!n)setAction(action,true);return true;
  }
  function end(id){
    if(!fingers.has(id))return false;const a=fingers.get(id);fingers.delete(id);
    const n=counts.get(a)-1;if(n)counts.set(a,n);else{counts.delete(a);setAction(a,false);}return true;
  }
  function reset(){for(const a of counts.keys())setAction(a,false);fingers.clear();counts.clear();clearEdges();}
  return {start,end,reset,get count(){return fingers.size}};
}
module.exports={createTouch,ACTIONS};
