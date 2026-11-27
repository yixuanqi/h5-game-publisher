import {length} from './box-model.mjs';
import {fontRuns,measureRuns,drawRuns} from './font-runs.mjs';
import {linearBackground} from './paint-column.mjs';
// Bounded single-line flex row with nested intrinsic text groups.
export function layoutRow(ctx,tree,available,env,{resolveFamily}={}){
  function build(n,forcedWidth){
    const s=n.style;if(s.display==='none')return null;
    const px=p=>length(s[p]??'0',available,env);
    const sides=Object.fromEntries(['left','right','top','bottom'].map(k=>[k,px('padding-'+k)+px('border-'+k+'-width')]));
    if(n.children.length){
      if(s.display!=='flex'||(s['flex-direction']??'row')!=='row')throw Error('Unsupported row container '+n.key);
      const children=n.children.map(c=>build(c)).filter(Boolean);
      if(!children.length)throw Error('Empty flex row '+n.key);
      const gap=px('column-gap'),sum=children.reduce((a,c)=>a+c.width,0);
      const intrinsic=sum+gap*(children.length-1);
      const width=forcedWidth??intrinsic+sides.left+sides.right;
      const content=width-sides.left-sides.right;
      if(intrinsic>content+0.01)throw Error('Row needs flex shrink/wrap: '+n.key);
      const height=Math.max(...children.map(c=>c.height))+sides.top+sides.bottom;
      const free=Math.max(0,content-intrinsic),justify=s['justify-content']??'normal',align=s['align-items']??'stretch';
      if(!['normal','flex-start','start','center','space-between'].includes(justify))throw Error('Unsupported justify '+justify);
      if(!['center','flex-start','start','stretch'].includes(align))throw Error('Unsupported align '+align);
      let x=sides.left+(justify==='center'?free/2:0),step=gap+(justify==='space-between'&&children.length>1?free/(children.length-1):0);
      for(const c of children){
        c.x=x;c.y=sides.top+(align==='center'?(height-sides.top-sides.bottom-c.height)/2:0);x+=c.width+step;
      }
      return {...n,width,height,x:0,y:0,children};
    }
    if(!n.text)throw Error('Empty text leaf '+n.key);
    if(s.width&&s.width!=='auto')throw Error('Explicit leaf width unsupported '+n.key);
    const size=px('font-size');if(size<=0)throw Error('Missing text font size '+n.key);
    const text=s['text-transform']==='uppercase'?n.text.toUpperCase():n.text;
    const spacing=s['letter-spacing']==='normal'?0:px('letter-spacing');
    const runs=fontRuns(text,s,size,resolveFamily),metrics=measureRuns(ctx,runs,spacing),lh=s['line-height']??'normal';
    const line=lh==='normal'?Math.ceil(metrics.ascent+metrics.descent):/^\d+(?:\.\d+)?$/.test(lh)?Number(lh)*size:length(lh,size,env);
    return {...n,text,width:metrics.textWidth+sides.left+sides.right,height:line+sides.top+sides.bottom,x:0,y:0,runs,spacing,textX:sides.left,baseline:sides.top+(line-metrics.ascent-metrics.descent)/2+metrics.ascent,metrics:{...metrics,line}};
  }
  return build(tree,available);
}
export function flattenRow(n,ox=0,oy=0){
  if(!n)return [];
  const x=ox+n.x,y=oy+n.y;
  return [{key:n.key,x,y,width:n.width,height:n.height,text:n.text??null},...n.children.flatMap(c=>flattenRow(c,x,y))];
}
export function paintRow(ctx,tree,env){
  function draw(n){
    const s=n.style,px=p=>length(s[p]??'0',tree.width,env);
    ctx.save();ctx.translate(n.x,n.y);ctx.globalAlpha*=Number(s.opacity??1);
    const bg=linearBackground(ctx,s.background,n.width,n.height);
    if(bg){ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(0,0,n.width,n.height,Math.min(px('border-radius'),n.height/2));ctx.fill();}
    const borders=['left','right','top','bottom'].map(k=>px('border-'+k+'-width'));
    if(borders.some(Boolean)){
      if(!borders.every(x=>x===borders[0]))throw Error('Nonuniform row border unsupported');
      const b=borders[0];ctx.lineWidth=b;ctx.strokeStyle=s['border-bottom-color']??s.color;
      ctx.beginPath();ctx.roundRect(b/2,b/2,n.width-b,n.height-b,Math.max(0,Math.min(px('border-radius'),n.height/2)-b/2));ctx.stroke();
    }
    if(n.children.length)for(const c of n.children)draw(c);
    else{ctx.fillStyle=s.color;ctx.textBaseline='alphabetic';drawRuns(ctx,n.runs,n.textX,n.baseline,n.spacing);}
    ctx.restore();
  }
  draw(tree);
}
