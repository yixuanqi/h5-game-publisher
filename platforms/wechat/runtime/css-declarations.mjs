import {boxProperties,expandBox,four,splitTop} from '../layout/box-model.mjs';

const extras=[
  'height','min-height','max-height','justify-content','flex-wrap','flex-grow','flex-shrink','flex-basis',
  'font-family','font-size','font-weight','line-height','letter-spacing','text-align','text-transform',
  'opacity','visibility','pointer-events','overflow-x','overflow-y','background','background-color','color',
  'border-radius','z-index','transform','transform-origin','white-space','grid-column-start','grid-column-end','grid-row-start','grid-row-end','grid-template-rows','aspect-ratio','order','top','bottom'
];
export const runtimeProperties=new Set([...boxProperties,...extras]);

function flex(value){
  const v=value.trim();
  if(v==='none')return [['flex-grow','0'],['flex-shrink','0'],['flex-basis','auto']];
  if(v==='auto')return [['flex-grow','1'],['flex-shrink','1'],['flex-basis','auto']];
  if(v==='initial')return [['flex-grow','0'],['flex-shrink','1'],['flex-basis','auto']];
  const a=splitTop(v);
  if(a.length===1&&/^\d+(?:\.\d+)?$/.test(a[0]))return [['flex-grow',a[0]],['flex-shrink','1'],['flex-basis','0%']];
  if(a.length===2&&a.every(x=>/^\d+(?:\.\d+)?$/.test(x)))return [['flex-grow',a[0]],['flex-shrink',a[1]],['flex-basis','0%']];
  if(a.length===2&&/^\d+(?:\.\d+)?$/.test(a[0]))return [['flex-grow',a[0]],['flex-shrink','1'],['flex-basis',a[1]]];
  if(a.length===3&&/^\d+(?:\.\d+)?$/.test(a[0])&&/^\d+(?:\.\d+)?$/.test(a[1]))return [['flex-grow',a[0]],['flex-shrink',a[1]],['flex-basis',a[2]]];
  throw Error('Unsupported flex shorthand: '+value);
}
export function expandRuntimeDeclaration(prop,value){
  prop=String(prop).trim().toLowerCase();value=String(value).trim();
  if(!prop||!value)return [];
  if(prop.startsWith('--'))return [[prop,value]];
  if(prop==='flex')return flex(value);
  if(prop==='inset'){
    return four(value).map((v,i)=>[['top','right','bottom','left'][i],v]);
  }
  if(prop==='grid-column'||prop==='grid-row'){
    // Expand before cascade so shorthand resets both longhands in source order.
    const a=value.split('/').map(x=>x.trim());
    const valid=x=>/^(?:auto|[+-]?\d+|span\s+[1-9]\d*)$/i.test(x)&&!/^[-+]?0+$/.test(x);
    if(a.length>2||!a.every(valid))throw Error('Unsupported grid placement: '+value);
    return [[prop+'-start',a[0]],[prop+'-end',a[1]??'auto']];
  }
  if(prop==='overflow')return [['overflow-x',value],['overflow-y',value]];
  if(prop==='flex-flow'){
    const a=splitTop(value),direction=a.find(x=>['row','row-reverse','column','column-reverse'].includes(x)),wrap=a.find(x=>['nowrap','wrap','wrap-reverse'].includes(x));
    if(!direction&&!wrap)throw Error('Unsupported flex-flow: '+value);
    return [...(direction?[['flex-direction',direction]]:[]),...(wrap?[['flex-wrap',wrap]]:[])];
  }
  const box=expandBox(prop,value);
  if(box.length)return box;
  return runtimeProperties.has(prop)?[[prop,value]]:[];
}

export function parseInlineDeclarations(cssText){
  const text=String(cssText??''),parts=[];let start=0,depth=0,quote='';
  for(let i=0;i<=text.length;i++){
    const ch=text[i]??';';
    if(quote){if(ch===quote&&text[i-1]!=='\\')quote='';continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='(')depth++;else if(ch===')')depth--;
    if(depth<0)throw Error('Unbalanced inline CSS');
    if(ch===';'&&depth===0){const part=text.slice(start,i).trim();if(part)parts.push(part);start=i+1;}
  }
  if(depth||quote)throw Error('Unbalanced inline CSS');
  const out=[];
  for(const part of parts){
    let depth=0,quote='',colon=-1;
    for(let i=0;i<part.length;i++){
      const ch=part[i];
      if(quote){if(ch===quote&&part[i-1]!=='\\')quote='';continue;}
      if(ch==='"'||ch==="'"){quote=ch;continue;}
      if(ch==='(')depth++;else if(ch===')')depth--;
      else if(ch===':'&&depth===0){colon=i;break;}
    }
    if(colon<1)continue;
    const prop=part.slice(0,colon).trim(),raw=part.slice(colon+1).trim(),important=/\s*!important\s*$/i.test(raw),value=raw.replace(/\s*!important\s*$/i,'').trim();
    for(const [p,v] of expandRuntimeDeclaration(prop,value))out.push({prop:p,value:v,important});
  }
  return out;
}
