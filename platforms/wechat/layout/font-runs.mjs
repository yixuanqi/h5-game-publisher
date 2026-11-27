// Platform-neutral script selection. Host supplies a concrete font-family resolver.
// Keep the authored CSS unchanged; the resolver is an adapter policy.
export function scriptOf(ch){
  if(/\p{Script=Han}/u.test(ch))return 'han';
  if(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch))return 'kana';
  if(/\p{Script=Hangul}/u.test(ch))return 'hangul';
  return 'default';
}
export function fontRuns(text,style,size,resolveFamily){
  const runs=[];
  for(const ch of Array.from(text)){
    const script=scriptOf(ch),family=resolveFamily?.({script,char:ch,family:style['font-family']??'serif',weight:style['font-weight']??'400'})??style['font-family']??'serif';
    const font=(style['font-weight']??'400')+' '+size+'px '+family;
    const last=runs.at(-1);
    if(last?.font===font)last.text+=ch;
    else runs.push({font,text:ch});
  }
  return runs;
}
export function measureFontRun(ctx,run,text=run.text){
  ctx.font=run.font;
  const match=run.font.match(/^(.*?)(\d+(?:\.\d+)?)px (.*)$/);
  if(!match||Number.isInteger(Number(match[2])))return ctx.measureText(text);
  const size=Number(match[2]),scale=4;
  ctx.font=match[1]+(size*scale)+'px '+match[3];
  try{const m=ctx.measureText(text);return {width:m.width/scale,fontBoundingBoxAscent:m.fontBoundingBoxAscent/scale,fontBoundingBoxDescent:m.fontBoundingBoxDescent/scale};}finally{ctx.font=run.font;}
}
export function measureRuns(ctx,runs,spacing){
  let ascent=0,descent=0,textWidth=0;
  for(const run of runs){
    ctx.font=run.font;
    const m=measureFontRun(ctx,run),a=m.fontBoundingBoxAscent,d=m.fontBoundingBoxDescent;
    if(!Number.isFinite(a+d)||a+d<=0)throw Error('Font line metrics unavailable: '+run.font);
    ascent=Math.max(ascent,a);descent=Math.max(descent,d);
    // Measure the complete run to preserve kerning and shaping advances.
    textWidth+=m.width+Array.from(run.text).length*spacing;
  }
  if(!runs.length)throw Error('Empty text control not supported');
  return {ascent,descent,textWidth};
}
export function drawRuns(ctx,runs,x,y,spacing){
  for(const run of runs){
    ctx.font=run.font;
    const chars=Array.from(run.text);
    if(!spacing){ctx.fillText(run.text,x,y);x+=measureFontRun(ctx,run).width;continue;}
    // Prefer the host's text spacing capability when it is actually exposed.
    if(typeof ctx.letterSpacing==='string'){
      const old=ctx.letterSpacing;ctx.letterSpacing=spacing+'px';
      try{ctx.fillText(run.text,x,y);}finally{ctx.letterSpacing=old;}
      x+=measureFontRun(ctx,run).width+chars.length*spacing;continue;
    }
    // Bounded fallback: use shaped prefix advances rather than independent glyph widths.
    let prefix='';
    for(let i=0;i<chars.length;i++){
      const ch=chars[i];prefix+=ch;
      ctx.fillText(ch,x+measureFontRun(ctx,run,prefix).width-measureFontRun(ctx,run,ch).width+i*spacing,y);
    }
    x+=measureFontRun(ctx,run).width+chars.length*spacing;
  }
}
