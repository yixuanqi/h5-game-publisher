// HOST ONLY: isolated typography measurement, NOT a native WeChat provider.
// No game markup, style sheet, box constraints, node identity, oracle geometry
// or fitted correction factors are admitted as measurement inputs.
export function typographyRequests(descriptors){
 if(!Array.isArray(descriptors)||descriptors.length>8192)throw Error('Invalid typography requests');
 return descriptors.map(d=>{
  if(typeof d.text!=='string'||!d.text.trim()||d.text.length>4096||typeof d.font!=='string'||!d.font.trim()||
     !Number.isFinite(d.letterSpacing)||Math.abs(d.letterSpacing)>512||
     (d.lineHeight!==null&&(!Number.isFinite(d.lineHeight)||d.lineHeight<=0||d.lineHeight>4096))||
     typeof d.lang!=='string'||!/^[A-Za-z0-9-]{0,64}$/.test(d.lang))
    throw Error('Invalid isolated typography descriptor');
  return {text:d.text,font:d.font,letterSpacing:d.letterSpacing,lineHeight:d.lineHeight,lang:d.lang};
 });
}
export async function measureIsolatedTypography(context,descriptors){
 const requests=typographyRequests(descriptors);
 const page=await context.newPage();
 try{
  await page.setContent('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;-webkit-text-size-adjust:100%}</style><body></body>');
  await page.evaluate(rs=>{
   for(const d of rs){
    const row=document.createElement('div');
    row.style.cssText='display:block;margin:0;padding:0;border:0;';
    const el=document.createElement('span');el.lang=d.lang;
    el.style.cssText='display:inline-block;box-sizing:content-box;width:max-content;height:auto;white-space:nowrap;margin:0;padding:0;border:0;font-style:normal;font-kerning:auto;vertical-align:top;';
    el.style.font=d.font;
    el.style.letterSpacing=d.letterSpacing+'px';
    el.style.lineHeight=d.lineHeight===null?'normal':d.lineHeight+'px';
    if(!el.style.fontSize)throw Error('Invalid isolated font '+d.font);
    el.textContent=d.text;row.append(el);document.body.append(row);
   }
  },requests);
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  const metrics=await page.evaluate(()=>[...document.body.children].map(row=>{
   // These are neutral unconstrained single-line typography samples only,
   // not the game nodes. The two intrinsic dimensions form the metric ABI.
   const el=row.firstElementChild,r=el.getBoundingClientRect();
   return {width:r.width,height:r.height};
  }));
  if(metrics.length!==requests.length||metrics.some(m=>![m.width,m.height].every(v=>Number.isFinite(v)&&v>=0&&v<=1e6)||m.height===0))throw Error('Invalid isolated typography metrics');
  return metrics;
 }finally{await page.close();}
}
