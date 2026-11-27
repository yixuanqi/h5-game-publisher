import {length,splitTop,horizontalBox} from './box-model.mjs';
// Small renderer for single-line text controls in a vertical column.
// No IDs, game strings, reference coordinates or browser geometry.
export function linearBackground(ctx,value,w,h){
  if(!value||value==='none'||value==='transparent')return null;
  if(!value.startsWith('linear-gradient('))return value;
  const a=splitTop(value.slice(16,-1),'comma');
  const angle=a.shift();
  if(angle!=='90deg')throw Error('Unsupported gradient angle: '+angle);
  const g=ctx.createLinearGradient(0,0,w,0);
  for(const stop of a){
    const m=stop.match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/);
    if(!m)throw Error('Unsupported gradient stop: '+stop);
    g.addColorStop(Number(m[2])/100,m[1]);
  }
  return g;
}
function font(s,size){return (s['font-weight']??'400')+' '+size+'px '+(s['font-family']??'serif');}
export function layoutTextColumn(ctx,width,parent,children,env){
  const gap=length(parent['row-gap']??'0',width,env);
  let y=0;
  const rows=[];
  for(const c of children){
    const s=c.style;if(s.display==='none')continue;
    if(s.width!=='100%')throw Error('Unsupported non-full-width text control');
    if(s['text-align']!=='left')throw Error('Unsupported text alignment');
    const px=p=>length(s[p]??'0',width,env);
    const box=horizontalBox(s,width,env),size=px('font-size');
    ctx.font=font(s,size);
    const metrics=ctx.measureText(c.text);
    const ascent=metrics.fontBoundingBoxAscent,descent=metrics.fontBoundingBoxDescent;
    if(!Number.isFinite(ascent+descent)||ascent+descent<=0)throw Error('Font line metrics unavailable');
    const lh=s['line-height']??'normal';
    const line=lh==='normal'?Math.ceil(ascent+descent):/^\d+(?:\.\d+)?$/.test(lh)?Number(lh)*size:length(lh,size,env);
    const pt=px('padding-top')+px('border-top-width'),pb=px('padding-bottom')+px('border-bottom-width');
    const h=Math.max(line+pt+pb,px('min-height'));
    y+=px('margin-top');
    const spacing=s['letter-spacing']==='normal'?0:px('letter-spacing');
    const textWidth=Array.from(c.text).reduce((n,ch)=>n+ctx.measureText(ch).width+spacing,0);
    if(textWidth>box.contentWidth+1)throw Error('Multiline/intrinsic text layout unsupported: '+c.key);
    rows.push({...c,x:px('margin-left'),y,width:box.borderWidth,height:h,baseline:pt+(h-pt-pb-line)/2+(line-ascent-descent)/2+ascent,textX:px('padding-left')+px('border-left-width'),fontSize:size,spacing,metrics:{ascent,descent,line,textWidth}});
    y+=h+px('margin-bottom')+gap;
  }
  return {width,height:rows.length?y-gap:0,rows};
}
function drawText(ctx,text,x,y,spacing){
  for(const c of Array.from(text)){ctx.fillText(c,x,y);x+=ctx.measureText(c).width+spacing;}
}
export function paintColumn(ctx,layout,env){
  for(const r of layout.rows){
    const s=r.style,px=p=>length(s[p]??'0',layout.width,env);
    ctx.save();ctx.translate(r.x,r.y);ctx.globalAlpha=Number(s.opacity??1);
    const bg=linearBackground(ctx,s.background,r.width,r.height);
    if(bg){
      ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(0,0,r.width,r.height,px('border-radius'));ctx.fill();
    }
    const bottom=px('border-bottom-width');
    if(bottom){
      ctx.fillStyle=s['border-bottom-color']??s.color;ctx.fillRect(0,r.height-bottom,r.width,bottom);
    }
    ctx.font=font(s,r.fontSize);ctx.textBaseline='alphabetic';ctx.fillStyle=s.color;
    drawText(ctx,r.text,r.textX,r.baseline,r.spacing);
    if(r.before?.content){
      const p=r.before,content=p.content.match(/^(['"])(.*?)\1$/);
      if(!content)throw Error('Unsupported pseudo content: '+p.content);
      if(p.top!=='50%'||p.transform!=='translateY(-50%)')throw Error('Unsupported pseudo positioning');
      const size=length(p['font-size'],layout.width,env);
      ctx.font=font({...s,...p},size);ctx.textBaseline='middle';ctx.fillStyle=p.color??s.color;
      ctx.fillText(content[2],length(p.left,layout.width,env),r.height/2);
    }
    ctx.restore();
  }
}
export function hitColumn(layout,x,y){
  return layout.rows.find(r=>!r.disabled&&x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height)?.key??null;
}
