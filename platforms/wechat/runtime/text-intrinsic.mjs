import {length} from '../layout/box-model.mjs';
import {fontRuns,measureRuns} from '../layout/font-runs.mjs';

export function boxEdges(style,available,env){
  const px=p=>length(style?.[p]??'0',available,env);
  return Object.fromEntries(['left','right','top','bottom'].map(k=>[k,px('padding-'+k)+px('border-'+k+'-width')]));
}

export function measureTextIntrinsic(ctx,node,available,env,{resolveFamily}={}){
  if(!node||node.children?.length)throw Error('measureTextIntrinsic requires a leaf node');
  const s=node.style??{};
  if(s.display==='none')return null;
  if(!node.text)throw Error('Empty text leaf '+(node.key??''));
  const px=p=>length(s[p]??'0',available,env),edges=boxEdges(s,available,env);
  const size=px('font-size');if(size<=0)throw Error('Missing text font size '+(node.key??''));
  const text=s['text-transform']==='uppercase'?node.text.toUpperCase():node.text;
  const spacing=s['letter-spacing']==='normal'||s['letter-spacing']===undefined?0:px('letter-spacing');
  const runs=fontRuns(text,s,size,resolveFamily),metrics=measureRuns(ctx,runs,spacing),lh=s['line-height']??'normal';
  const line=lh==='normal'?Math.ceil(metrics.ascent+metrics.descent):/^\d+(?:\.\d+)?$/.test(lh)?Number(lh)*size:length(lh,size,env);
  let width=metrics.textWidth+edges.left+edges.right,height=line+edges.top+edges.bottom;
  if(s['min-width']&&s['min-width']!=='auto')width=Math.max(width,length(s['min-width'],available,env));
  if(s['min-height']&&s['min-height']!=='auto')height=Math.max(height,length(s['min-height'],available,env));
  return {...node,text,width,height,runs,spacing,textX:edges.left,baseline:edges.top+(line-metrics.ascent-metrics.descent)/2+metrics.ascent,metrics:{...metrics,line},edges};
}

export function measureTextLeaf(ctx,node,available,env,options={}){
  const s=node?.style??{};
  if(s.width&&s.width!=='auto')throw Error('Explicit leaf width unsupported '+(node?.key??''));
  return measureTextIntrinsic(ctx,node,available,env,options);
}
