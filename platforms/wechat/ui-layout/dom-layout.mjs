/** Bounded geometry adapter. No painting or game-specific selectors. */
import {evaluateCssLength} from './css-length.mjs';
export function createLayoutSnapshot(backend,tree,viewport,{rootContainingWidth=viewport.width,rootContainingHeight=viewport.height,safeArea,measureTextLeaf}={}){
  // Bounded static geometry; publish only after the complete tree computes.
  const rects=new Map(),records=[],seen=new Set(),fixedGroups=[];
  const props=new Set('display width height min-width min-height max-width max-height column-gap row-gap flex-direction flex-wrap justify-content align-items align-self flex-grow flex-shrink flex-basis grid-template-columns grid-template-rows position top right bottom left padding-top padding-right padding-bottom padding-left margin-top margin-right margin-bottom margin-left border-top-width border-right-width border-bottom-width border-left-width box-sizing aspect-ratio grid-column-start grid-column-end grid-row-start grid-row-end'.split(' '));
  const lengthProps=/^(?:width|height|min-width|min-height|max-width|max-height|column-gap|row-gap|flex-basis|top|right|bottom|left|padding-(?:top|right|bottom|left)|margin-(?:top|right|bottom|left)|border-(?:top|right|bottom|left)-width)$/;
  if(![viewport.width,viewport.height,rootContainingWidth,rootContainingHeight].every(n=>Number.isFinite(n)&&n>=0&&n<=1e6))throw Error('Invalid layout viewport');
  function normalize(p,v,isRoot,parent,style={}){
    if(typeof v!=='string')throw Error('Invalid style '+p);
    v=v.trim();
    if(lengthProps.test(p)){
      if(/^[+-]?(?:0+(?:\.0*)?|\.0+)$/.test(v))return '0px';
      if((p==='column-gap'||p==='row-gap')&&v==='normal')return '0px';
      if((p==='max-width'||p==='max-height')&&v==='none')return 'auto';
      const unit=v.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(vw|vh|dvw|dvh)$/);
      if(unit)return Number(unit[1])*(unit[2].endsWith('vw')?viewport.width:viewport.height)/100+'px';
      if(/\b(?:min|max|clamp|calc|env|var)\s*\(/.test(v)){
        const vertical=/^(?:height|min-height|max-height|top|bottom)$/.test(p);
        const normalFlow=!style.position||['static','relative'].includes(style.position);
        const nestedProperty=/^(?:width|height|min-width|min-height|max-width|max-height|padding-|margin-)/.test(p);
        const percentageBase=style.position==='fixed'&&!/^(?:flex-basis|column-gap|row-gap|border-)/.test(p)
          ? (vertical?viewport.height:viewport.width)
          : isRoot&&!/^(?:flex-basis|column-gap|row-gap|border-)/.test(p)
          ? (vertical?rootContainingHeight:rootContainingWidth)
          : normalFlow&&nestedProperty?parent?.childBases?.[vertical?'height':'width']:undefined;
        const px=evaluateCssLength(v,{viewport,percentageBase,safeArea});
        if(px<0&&!/^(?:top|right|bottom|left|margin-)/.test(p))throw Error('Negative resolved length '+p);
        return px+'px';
      }
    }
    if(p==='aspect-ratio'){const m=v.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);if(m&&Number(m[2])>0)return String(Number(m[1])/Number(m[2]));}
    return v;
  }
  // Only propagate explicit content-box dimensions in normal block flow.
  // Flex/grid tracks, auto sizing, constraints and out-of-flow boxes need the
  // actual backend containing block, never a guessed viewport.
  function stableBlock(s,parent,isRoot){
    return (!s.display||s.display==='block')&&(!s.position||['static','relative'].includes(s.position))&&
      (!s['box-sizing']||s['box-sizing']==='content-box')&&
      (!s['aspect-ratio']||s['aspect-ratio']==='auto')&&
      (isRoot||parent?.stableBlock===true);
  }
  function definiteSize(s,axis,isRoot,parent){
    if(!s[axis]||s[axis]==='auto'||
       (s['min-'+axis]&&s['min-'+axis]!=='auto')||
       (s['max-'+axis]&&!['auto','none'].includes(s['max-'+axis])))return undefined;
    const value=normalize(axis,s[axis],isRoot,parent,s);
    const base=isRoot?(axis==='width'?rootContainingWidth:rootContainingHeight):parent?.childBases?.[axis];
    if(!/^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:px|%)$/.test(value))return undefined;
    if(value.endsWith('%')&&!Number.isFinite(base))return undefined;
    const n=evaluateCssLength(value,{viewport,percentageBase:base,safeArea});
    return n>=0&&n<=1e6?n:undefined;
  }
  // Viewport-fixed boxes form independent layout roots. A synthetic definite
  // viewport parent gives Taffy the CSS containing block for absolute insets.
  // Transformed/filter ancestors or static-position fallback require a later
  // containing-block implementation; do not approximate those cases.
  function fixedGroup(s,parent,n){
    if(parent?.fixedContainingBlock||n.fixedAncestorOutsideTree)
      throw Error('Unsupported fixed containing block');
    for(const [start,end,size] of [['left','right','width'],['top','bottom','height']]){
      const definite=p=>s[p]!==undefined&&s[p]!=='auto';
      if(!definite(start)&&!definite(end))throw Error('Unsupported fixed static position: '+size);
      if(!definite(size)&&!(definite(start)&&definite(end)))throw Error('Unsupported fixed auto size: '+size);
    }
    if(['margin-left','margin-right','margin-top','margin-bottom'].some(p=>s[p]==='auto'))
      throw Error('Unsupported fixed auto margin');
    if(records.length+fixedGroups.length>=8192)throw Error('Oversized fixed layout forest');
    const handle=backend.createNode();
    for(const [p,v] of Object.entries({display:'block',width:viewport.width+'px',height:viewport.height+'px'}))backend.setStyle(handle,p,v);
    const group={handle,records:[],width:viewport.width,height:viewport.height};
    fixedGroups.push(group);return group;
  }
  function cssOrder(n){
    const value=String(n?.style?.order??'0').trim();
    if(!/^[+-]?\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('Invalid layout order: '+value);
    return Number(value);
  }
  function visit(n,parent,isRoot=false,depth=0){
    if(depth>128||records.length+fixedGroups.length>=8192||!n?.element||seen.has(n.element))throw Error('Invalid or oversized layout tree');
    seen.add(n.element);
    let s=n.style??{};
    const kids=n.children??[];
    if(!Array.isArray(kids))throw Error('Invalid children');
    const hidden=parent?.hidden||s.display==='none';
    const record={element:n.element,parent,layoutParent:parent,hidden:!!hidden,handle:null,stableBlock:false,childBases:{},group:parent?.group??null,fixedContainingBlock:!!(parent?.fixedContainingBlock||n.establishesFixedContainingBlock)};records.push(record);
    if(!hidden){
      const textNodes=Array.from(n.element.childNodes??[]).filter(x=>x.nodeType===3&&String(x.textContent??'').trim());
      if(textNodes.length){
        const whiteSpace=n.textStyle?.['white-space']??'normal';
        const intrinsic=s.width==='max-content'&&whiteSpace==='nowrap';
        const constrained=whiteSpace==='normal'&&stableBlock(s,parent,isRoot)&&
          !['min-width','max-width','min-height','max-height'].some(p=>s[p]&&!['auto','none'].includes(s[p]));
        if(typeof measureTextLeaf!=='function'||kids.length||textNodes.length!==1||
           (s.height&&s.height!=='auto')||
           (s['box-sizing']&&s['box-sizing']!=='content-box')||
           (s.display&&s.display!=='block')||(!intrinsic&&!constrained))
          throw Error('Intrinsic text measurement required: unsupported text leaf');
        const maxWidth=constrained?definiteSize(s,'width',isRoot,parent):undefined;
        if(constrained&&!Number.isFinite(maxWidth))throw Error('Unresolved text width constraint');
        const text=String(textNodes[0].textContent).replace(/[\t\n\f\r ]+/g,' ').trim();
        const metrics=measureTextLeaf({element:n.element,text,style:n.textStyle,viewport,maxWidth});
        if(![metrics?.width,metrics?.height].every(v=>Number.isFinite(v)&&v>=0&&v<=1e6))throw Error('Invalid text metrics');
        // The provider measures content, not the containing box. Preserve the
        // authored width for wrapping text; Taffy still owns padding/borders.
        s={...s,...(intrinsic?{width:metrics.width+'px'}:{}),height:metrics.height+'px'};
      }
      record.stableBlock=stableBlock(s,parent,isRoot);
      if(record.stableBlock){
        record.childBases={width:definiteSize(s,'width',isRoot,parent),height:definiteSize(s,'height',isRoot,parent)};
      }
      if(s.position==='fixed'){
        record.group=fixedGroup(s,parent,n);
        record.layoutParent=null;
      }
      record.handle=backend.createNode();
      if(s.position==='fixed')backend.append(record.group.handle,record.handle);
      else if(parent)backend.append(parent.handle,record.handle);
      if(record.group)record.group.records.push(record);
      for(const [p,v] of Object.entries(s)){
        if(p==='order'){cssOrder(n);continue;}
        if(!props.has(p))throw Error('Unmapped layout property '+p);
        backend.setStyle(record.handle,p,p==='position'&&v==='fixed'?'absolute':normalize(p,v,isRoot,parent,s));
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
    function capture(r){
      const local=backend.rect(r.handle),p=r.layoutParent?rects.get(r.layoutParent.element):{x:0,y:0};
      if(![local.x,local.y,local.width,local.height].every(Number.isFinite)||local.width<0||local.height<0)throw Error('Invalid backend geometry');
      rects.set(r.element,Object.freeze({x:p.x+local.x,y:p.y+local.y,width:local.width,height:local.height}));
    }
    for(const r of records)if(r.hidden)rects.set(r.element,Object.freeze({x:0,y:0,width:0,height:0}));
    if(!root.hidden&&!root.group){
      backend.calculate(root.handle,{width:rootContainingWidth,height:rootContainingHeight});
      for(const r of records)if(!r.hidden&&!r.group)capture(r);
    }
    // Each compute invalidates previous WASM geometry: snapshot each group
    // completely before computing the next, then publish atomically.
    for(const g of fixedGroups){
      backend.calculate(g.handle,{width:g.width,height:g.height});
      for(const r of g.records)capture(r);
    }
    return Object.freeze({nodeCount:records.length,rect(el){if(!rects.has(el))throw Error('Element not in layout snapshot');return rects.get(el);}});
  }finally{backend.reset();}
}
