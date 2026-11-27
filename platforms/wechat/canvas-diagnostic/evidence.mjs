// Read-only screen evidence. Never paints, changes source game state, or sets its boot marker.
export function samplePixels(surface){
  const w=surface.width,h=surface.height;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<32||h<18||w*h>16777216)throw Error('Unsupported screen dimensions');
  const data=surface.getContext('2d').getImageData(0,0,w,h).data;
  if(data.length!==w*h*4)throw Error('Invalid screen readback');
  let hash=2166136261,opaque=0;const colors=new Set();
  for(let y=0;y<18;y++)for(let x=0;x<32;x++){
    const i=(Math.min(h-1,Math.floor((y+.5)*h/18))*w+Math.min(w-1,Math.floor((x+.5)*w/32)))*4;
    const [r,g,b,a]=data.subarray(i,i+4);
    if(a)opaque++;
    colors.add(r+','+g+','+b+','+a);
    for(const v of [r,g,b,a])hash=Math.imul(hash^v,16777619)>>>0;
  }
  return {width:w,height:h,hash:hash.toString(16).padStart(8,'0'),opaque,colors:colors.size};
}
export function createCanvasEvidence({surface,window,document,onError}){
  const state={bootMarker:false,moduleMarker:false,completedCallbacks:0,playingCallbacks:0,samples:[],titleReady:false,playingReady:false,error:null};
  let lastPhase=null,phaseFrames=0;
  function afterFrame(){
    if(state.error||state.playingReady)return;
    try{
      state.moduleMarker=window.__ABV_MODULE_LOADED__===true;
      state.bootMarker=window.__ABV_BOOTED__===true;
      if(!state.moduleMarker||!state.bootMarker)return;
      state.completedCallbacks++;
      const phase=document.body.dataset.gameState;
      if(phase!==lastPhase){lastPhase=phase;phaseFrames=0;}
      phaseFrames++;
      if(phase==='playing')state.playingCallbacks++;
      if(phaseFrames===1||phaseFrames===10||phaseFrames===30){
        const sample={phase,frame:state.completedCallbacks,...samplePixels(surface)};
        state.samples.push(sample);
      }
      function ready(p){
        const v=state.samples.filter(s=>s.phase===p&&s.opaque>=100&&s.colors>=8);
        return v.length>=3&&new Set(v.map(s=>s.hash)).size>=2;
      }
      state.titleReady=state.titleReady||ready('title');
      state.playingReady=state.playingCallbacks>=30&&ready('playing');
    }catch(e){state.error=String(e.stack||e);onError?.(e);}
  }
  return {state,afterFrame};
}
