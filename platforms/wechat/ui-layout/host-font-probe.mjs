import {composeFontLineMetrics} from './font-line-metrics.mjs';
// Host diagnostic only. A separate neutral typography page asks Chromium for
// used font identities (CDP), NOT layout rectangles, computed widths or heights.
// The source game tree and its geometry oracle are never consulted here.
// System font stacks only; custom web-font transfer and WX provider are pending.
export async function measureHostFontRuns(context,descriptors){
 if(!Array.isArray(descriptors)||descriptors.length>8192)throw Error('Invalid font descriptors');
 const page=await context.newPage();
 let session;
 try{
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.evaluate(ds=>{
   for(const [i,d] of ds.entries()){
    const el=document.createElement('div');el.id='metric-'+i;
    el.style.font=d.font;el.style.letterSpacing=d.letterSpacing+'px';
    el.style.whiteSpace='nowrap';el.textContent=d.text;document.body.append(el);
   }
  },descriptors);
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  session=await context.newCDPSession(page);
  await session.send('DOM.enable');await session.send('CSS.enable');
  const {root}=await session.send('DOM.getDocument',{depth:0});
  const fontLists=[];
  for(let i=0;i<descriptors.length;i++){
   const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#metric-'+i});
   const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});
   fontLists.push(fonts.filter(f=>f.glyphCount>0));
  }
  const raw=await page.evaluate(({ds,fontLists})=>{
   const c=document.createElement('canvas').getContext('2d');
   const ext=m=>({ascent:m.fontBoundingBoxAscent,descent:m.fontBoundingBoxDescent});
   return ds.map((d,i)=>{
    c.font=d.font;c.letterSpacing=d.letterSpacing+'px';c.fontKerning='auto';
    const m=c.measureText(d.text),primary=ext(m),width=m.width;
    const widths={auto:width};
    for(const mode of ['normal','none']){c.fontKerning=mode;widths[mode]=c.measureText(d.text).width;}
    c.fontKerning='auto';c.letterSpacing='0px';
    const prefix=d.font.match(/^(?:normal|bold|[1-9]00) (?:\d+(?:\.\d+)?)px /)?.[0];
    if(!prefix)throw Error('Unsupported host font descriptor '+d.font);
    const fallbacks=fontLists[i].map(f=>{
     // Family name is font identity metadata only. The Canvas metrics of
     // the explicit face are measured independently of the game layout.
     c.font=prefix+JSON.stringify(f.familyName);
     return {familyName:f.familyName,postScriptName:f.postScriptName,glyphCount:f.glyphCount,isCustomFont:f.isCustomFont,...ext(c.measureText('Hg'))};
    });
    return {path:d.path,width,widthCandidates:widths,primary,fallbacks};
   });
  },{ds:descriptors,fontLists});
  return raw.map((m,i)=>({...m,...composeFontLineMetrics(m.primary,m.fallbacks,descriptors[i].lineHeight)}));
 }finally{if(session)await session.detach();await page.close();}
}
