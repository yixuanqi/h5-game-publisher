// Narrow source-driven horizontal box model. No browser geometry inputs.
export function splitTop(value,separator='space'){
  const out=[];let depth=0,start=0;
  const s=value.trim();
  for(let i=0;i<s.length;i++){
    const c=s[i];if(c==='(')depth++;else if(c===')')depth--;
    if(depth<0)throw Error('Unbalanced CSS: '+value);
    if(!depth&&(separator==='comma'?c===',':/\s/.test(c))){
      const part=s.slice(start,i).trim();if(part)out.push(part);start=i+1;
    }
  }
  if(depth)throw Error('Unbalanced CSS: '+value);
  if(s.slice(start).trim())out.push(s.slice(start).trim());return out;
}
export function length(value,base,env){
  const s=String(value).trim(),m=s.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|%|vw|vh|dvw|dvh)?$/);
  if(m){
    const n=Number(m[1]),unit=m[2];
    if(!unit&&n!==0)throw Error('Unitless CSS length: '+s);
    return unit==='%'?n*base/100:/^(?:d?vw)$/.test(unit||'')?n*env.width/100:/^(?:d?vh)$/.test(unit||'')?n*env.height/100:n;
  }
  const f=s.match(/^(min|max|clamp)\(([\s\S]+)\)$/);
  if(f){
    const args=splitTop(f[2],'comma').map(v=>length(v,base,env));
    if(!args.length||f[1]==='clamp'&&args.length!==3)throw Error('Invalid CSS function: '+s);
    return f[1]==='min'?Math.min(...args):f[1]==='max'?Math.max(...args):Math.max(args[0],Math.min(args[1],args[2]));
  }
  throw Error('Unsupported length: '+s);
}
export function four(value){
  const a=splitTop(value);if(a.length<1||a.length>4)throw Error('Unsupported box shorthand: '+value);
  return [a[0],a[1]??a[0],a[2]??a[0],a[3]??a[1]??a[0]];
}
const sideNames=['top','right','bottom','left'];
function borderWidth(value){
  const a=splitTop(value);
  if(a.includes('none')||a.includes('hidden'))return '0';
  const width=a.find(v=>/^(?:0|\d+(?:\.\d+)?px|thin|medium|thick)$/.test(v));
  return ({thin:'1px',medium:'3px',thick:'5px'})[width]||width||'3px';
}
export const boxProperties=new Set(['width','min-width','max-width','box-sizing','display','flex-direction','grid-template-columns','row-gap','column-gap','gap','padding','padding-left','padding-right','padding-top','padding-bottom','margin','margin-left','margin-right','margin-top','margin-bottom','border','border-width','border-left','border-right','border-top','border-bottom','border-left-width','border-right-width','border-top-width','border-bottom-width','position','inset','left','right','align-items','align-self']);
export function expandBox(prop,value){
  const v=value.trim();
  if(prop==='padding'||prop==='margin'||prop==='border-width'){
    return four(v).map((x,i)=>[prop==='border-width'?'border-'+sideNames[i]+'-width':prop+'-'+sideNames[i],x]);
  }
  if(prop==='border')return sideNames.map(s=>['border-'+s+'-width',borderWidth(v)]);
  if(/^border-(left|right|top|bottom)$/.test(prop))return [[prop+'-width',borderWidth(v)]];
  if(prop==='gap'){const a=splitTop(v);if(a.length>2)throw Error('Unsupported gap: '+v);return [['row-gap',a[0]],['column-gap',a[1]??a[0]]];}
  return boxProperties.has(prop)?[[prop,v]]:[];
}
export function horizontalBox(style,available,env,{autoStretch=false}={}){
  if(!Number.isFinite(available)||available<0)throw Error('Invalid containing width');
  const val=(p)=>length(style[p]??'0',available,env);
  const padding=val('padding-left')+val('padding-right'),border=val('border-left-width')+val('border-right-width'),extras=padding+border;
  const margin=['margin-left','margin-right'].reduce((sum,p)=>sum+(style[p]==='auto'?0:val(p)),0);
  const size=style.width??'auto',borderBox=style['box-sizing']==='border-box';
  let content,outer;
  if(size==='auto'){
    if(!autoStretch)throw Error('Auto width needs supported stretch context');
    outer=Math.max(0,available-margin);content=Math.max(0,outer-extras);
  }else{
    const w=length(size,available,env);
    content=Math.max(0,borderBox?w-extras:w);outer=content+extras;
  }
  const convert=w=>borderBox?Math.max(0,w-extras):Math.max(0,w);
  if(style['max-width']&&style['max-width']!=='none')content=Math.min(content,convert(length(style['max-width'],available,env)));
  if(style['min-width']&&style['min-width']!=='auto')content=Math.max(content,convert(length(style['min-width'],available,env)));
  outer=content+extras;
  return {contentWidth:content,borderWidth:outer,padding,border,margin};
}
