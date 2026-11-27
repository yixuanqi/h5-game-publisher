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
export function measureRuns(ctx,runs,spacing){
  let ascent=0,descent=0,textWidth=0;
  for(const run of runs){
    ctx.font=run.font;
    const m=ctx.measureText(run.text),a=m.fontBoundingBoxAscent,d=m.fontBoundingBoxDescent;
    if(!Number.isFinite(a+d)||a+d<=0)throw Error('Font line metrics unavailable: '+run.font);
    ascent=Math.max(ascent,a);descent=Math.max(descent,d);
    for(const ch of Array.from(run.text))textWidth+=ctx.measureText(ch).width+spacing;
  }
  if(!runs.length)throw Error('Empty text control not supported');
  return {ascent,descent,textWidth};
}
export function drawRuns(ctx,runs,x,y,spacing){
  for(const run of runs){
    ctx.font=run.font;
    for(const ch of Array.from(run.text)){ctx.fillText(ch,x,y);x+=ctx.measureText(ch).width+spacing;}
  }
}
