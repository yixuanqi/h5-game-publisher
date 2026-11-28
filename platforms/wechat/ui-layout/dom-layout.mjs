/** Bounded geometry adapter. No painting or game-specific selectors. */
import {evaluateCssLength} from './css-length.mjs';
export function createLayoutSnapshot(backend,tree,viewport,{rootContainingWidth=viewport.width,rootContainingHeight=viewport.height,safeArea,measureTextLeaf}={}){
  // Bounded static geometry; publish only after the complete tree computes.
  const rects=new Map(),records=[],seen=new Set();
  const props=new Set('display width height min-width min-height max-width max-height column-gap row-gap flex-direction flex-wrap justify-content align-items align-self flex-grow flex-shrink flex-basis grid-template-columns grid-template-rows position top right bottom left padding-top padding-right padding-bottom padding-left margin-top margin-right margin-bottom margin-left border-top-width border-right-width border-bottom-width border-left-width box-sizing aspect-ratio grid-column-start grid-column-end grid-row-start grid-row-end'.split(' '));
  const lengthProps=/^(?:width|height|min-width|min-height|max-width|max-height|column-gap|row-gap|flex-basis|top|right|bottom|left|padding-(?:top|right|bottom|left)|margin-(?:top|right|bottom|left)|border-(?:top|right|bottom|left)-width)$/;
  if(![viewport.width,viewport.height,rootContainingWidth,rootContainingHeight].every(n=>Number.isFinite(n)&&n>=0&&n<=1e6))throw Error('Invalid layout viewport');
  function normalize(p,v,isRoot){
    if(typeof v!=='string')throw Error('Invalid style '+p);
    v=v.trim();
    if(lengthProps.test(p)){
      if(/^[+-]?(?:0+(?:\.0*)?|\.0+)$/.test(v))return '0px';
      if((p==='column-gap'||p==='row-gap')&&v==='normal')return '0px';
      if((p==='max-width'||p==='max-height')&&v==='none')return 'auto';
      const unit=v.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(vw|vh|dvw|dvh)$/);
      if(unit)return Number(unit[1])*(unit[2].endsWith('vw')?viewport.width:viewport.height)/100+'px';
      if(/\b(?:min|max|clamp|calc|env|var)\s*\(/.test(v)){
        // Only the external root containing block is definite at this stage.
        // Descendants keep native plain percentages; mixed expressions with
        // unknown bases fail rather than using a stale or guessed parent size.
        const vertical=/^(?:height|min-height|max-height|top|bottom)$/.test(p);
        const percentageBase=isRoot&&!/^(?:flex-basis|column-gap|row-gap|border-)/.test(p)
          ? (vertical?rootContainingHeight:rootContainingWidth):undefined;
        const px=evaluateCssLength(v,{viewport,percentageBase,safeArea});
        if(px<0&&!/^(?:top|right|bottom|left|margin-)/.test(p))throw Error('Negative resolved length '+p);
        return px+'px';
      }
    }
    if(p==='aspect-ratio'){const m=v.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);if(m&&Number(m[2])>0)return String(Number(m[1])/Number(m[2]));}
    return v;
  }
  function cssOrder(n){
    const value=String(n?.style?.order??'0').trim();
    if(!/^[+-]?\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('Invalid layout order: '+value);
    return Number(value);
  }
  function visit(n,parent,isRoot=false,depth=0){
    if(depth>128||records.length>=8192||!n?.element||seen.has(n.element))throw Error('Invalid or oversized layout tree');
    seen.add(n.element);
    let s=n.style??{};
    const kids=n.children??[];
    if(!Array.isArray(kids))throw Error('Invalid children');
    const hidden=parent?.hidden||s.display==='none';
    const record={element:n.element,parent,hidden:!!hidden,handle:null};records.push(record);
    if(!hidden){
      const textNodes=Array.from(n.element.childNodes??[]).filter(x=>x.nodeType===3&&String(x.textContent??'').trim());
      if(textNodes.length){
        // V0.5.4c1 contract: a measured, non-wrapping content-box leaf only.
        // The injected provider supplies text metrics, not browser box geometry.
        if(typeof measureTextLeaf!=='function'||kids.length||textNodes.length!==1||
           s.width!=='max-content'||(s.height&&s.height!=='auto')||
           (s['box-sizing']&&s['box-sizing']!=='content-box')||
           (s.display&&s.display!=='block')||n.textStyle?.['white-space']!=='nowrap')
          throw Error('Intrinsic text measurement required: unsupported text leaf');
        const text=String(textNodes[0].textContent).replace(/[\t\n\f\r ]+/g,' ').trim();
        const metrics=measureTextLeaf({element:n.element,text,style:n.textStyle,viewport});
        if(![metrics?.width,metrics?.height].every(v=>Number.isFinite(v)&&v>=0&&v<=1e6))throw Error('Invalid text metrics');
        s={...s,width:metrics.width+'px',height:metrics.height+'px'};
      }
      record.handle=backend.createNode();
      if(parent)backend.append(parent.handle,record.handle);
      for(const [p,v] of Object.entries(s)){
        if(p==='order'){cssOrder(n);continue;}
        if(!props.has(p))throw Error('Unmapped layout property '+p);
        backend.setStyle(record.handle,p,normalize(p,v,isRoot));
      }
    }
    // CSS order affects flex/grid layout, never the actual DOM order.
    const ordered=!hidden&&['flex','grid'].includes(s.display)
      ? kids.map((child,index)=>({child,index,order:child?.style?.display==='none'?0:cssOrder(child)}))
        .sort((a,b)=>a.order-b.order||a.index-b.index).map(x=>x.child)
      : kids;
    for(const child of ordered)visit(child,record,false,depth+1);
    return record;
  }
  backend.reset();
  try{
    const root=visit(tree,null,true);
    if(!root.hidden)backend.calculate(root.handle,{width:rootContainingWidth,height:rootContainingHeight});
    for(const r of records){
      if(r.hidden){rects.set(r.element,Object.freeze({x:0,y:0,width:0,height:0}));continue;}
      const local=backend.rect(r.handle),p=r.parent?rects.get(r.parent.element):{x:0,y:0};
      if(![local.x,local.y,local.width,local.height].every(Number.isFinite)||local.width<0||local.height<0)throw Error('Invalid backend geometry');
      rects.set(r.element,Object.freeze({x:p.x+local.x,y:p.y+local.y,width:local.width,height:local.height}));
    }
    return Object.freeze({nodeCount:records.length,rect(el){if(!rects.has(el))throw Error('Element not in layout snapshot');return rects.get(el);}});
  }finally{backend.reset();}
}
