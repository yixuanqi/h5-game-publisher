import {evaluateCssLength} from './css-length.mjs';
// Bounded font descriptor based on authored cascade, never browser box sizes.
export function textDescriptor(text,style={},viewport){
 if(typeof text!=='string'||!text.trim()||text.length>4096)throw Error('Invalid text run');
 const px=v=>evaluateCssLength(v,{viewport});
 const size=px(style['font-size']??'16px');
 if(!(size>0&&size<=512))throw Error('Unsupported font size');
 const family=style['font-family']??'serif',weight=style['font-weight']??'400';
 if(typeof family!=='string'||!family.trim()||! /^(?:normal|bold|[1-9]00)$/.test(weight))throw Error('Unsupported font descriptor');
 const transform=style['text-transform']??'none';
 if(!['none','uppercase','lowercase'].includes(transform))throw Error('Unsupported text transform');
 const spacing=!style['letter-spacing']||style['letter-spacing']==='normal'?0:px(style['letter-spacing']);
 const lh=style['line-height']??'normal';
 const lineHeight=lh==='normal'?null:/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(lh)?Number(lh)*size:
   evaluateCssLength(lh,{viewport,percentageBase:size});
 if(lineHeight!==null&&!(lineHeight>0&&lineHeight<=4096))throw Error('Unsupported line height');
 return {text:transform==='uppercase'?text.toUpperCase():transform==='lowercase'?text.toLowerCase():text,font:weight+' '+size+'px '+family,letterSpacing:spacing,lineHeight};
}
export function directTextRun(el){
 const nodes=Array.from(el.childNodes??[]);
 // Entity decoding and comments can split a logical text run into adjacent
 // Text nodes. Concatenate BEFORE CSS whitespace collapse, without inserting
 // artificial spaces. Do not mutate the source DOM or flatten mixed markup.
 if(el.children?.length||nodes.some(n=>![3,8].includes(n.nodeType)))return null;
 const text=nodes.filter(n=>n.nodeType===3).map(n=>String(n.textContent??'')).join('')
   .replace(/[\t\n\f\r ]+/g,' ').replace(/^ +| +$/g,'');
 return text||null;
}
// A diagnostic single-line provider may support CJK glyph advances, but
// normal wrapping is only accepted if the final content box fits the run.
export function validateSingleLineMetrics(m){
 if(![m?.width,m?.height].every(x=>Number.isFinite(x)&&x>=0&&x<=1e6)||m.height===0)throw Error('Invalid single-line text metrics');
 return m;
}
