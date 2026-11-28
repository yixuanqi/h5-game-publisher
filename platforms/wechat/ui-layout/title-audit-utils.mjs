// Stable structural paths, independent of browser geometry.
export function collectElementPaths(root){
 if(!root||root.nodeType!==1)throw Error('Element root required');
 const entries=[];
 function visit(el,path){
  if(entries.length>=8192)throw Error('Title inventory exceeds node limit');
  entries.push({path,element:el});
  [...el.children].forEach((child,i)=>visit(child,path+'/'+i));
 }
 visit(root,'0');return entries;
}
export function compareRectangles(expected,actual,tolerance=0.5){
 if(!Number.isFinite(tolerance)||tolerance<0)throw Error('Invalid tolerance');
 const keys=['x','y','width','height'];
 const differences=[];let maxDeltaPx=0;
 for(const [path,e] of Object.entries(expected)){
  const a=actual[path];
  if(!a){differences.push({path,reason:'missing'});continue;}
  for(const key of keys){
   if(!Number.isFinite(e[key])||!Number.isFinite(a[key]))throw Error('Invalid geometry '+path+' '+key);
   const delta=Math.abs(e[key]-a[key]);maxDeltaPx=Math.max(maxDeltaPx,delta);
   if(delta>tolerance)differences.push({path,key,delta,expected:e[key],actual:a[key]});
  }
 }
 for(const path of Object.keys(actual))if(!Object.hasOwn(expected,path))differences.push({path,reason:'unexpected'});
 return {pass:differences.length===0,differences,maxDeltaPx};
}

// HTML parsing adjusts these SVG tag names to their canonical mixed case.
// LinkeDOM may retain lowercase. Normalize only known SVG adjustments for
// identity comparison; never rename nodes or alter their authored attributes.
const SVG_NS='http://www.w3.org/2000/svg';
const svgAdjustedNames=new Map(('altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject glyphRef linearGradient radialGradient textPath').split(' ').map(name=>[name.toLowerCase(),name]));
export function elementIdentity({path,namespaceURI,tag,id=''}){
 if(typeof path!=='string'||typeof namespaceURI!=='string'||typeof tag!=='string'||!tag||typeof id!=='string')throw Error('Invalid element identity');
 // Accept canonical spelling and HTML-token lowercase only, not arbitrary
 // case changes or non-SVG namespace mismatches.
 const canonical=namespaceURI===SVG_NS?svgAdjustedNames.get(tag):undefined;
 return [path,namespaceURI,canonical??tag,id];
}

// Scope is the pinned authored, settled mobile title. Geometry is independent
// from visual, animation, interaction and native-font parity.
export function assertStaticTitleGeometry(results){
 if(!Array.isArray(results)||results.length!==2)throw Error('Expected two title viewports');
 const expectedViewports=new Set(['844x390','640x360']);
 for(const r of results){
  const key=r.viewport.width+'x'+r.viewport.height;
  if(!expectedViewports.delete(key)||r.nodeCount!==61||r.oracle?.length!==61||r.inventory?.length!==61||
     r.attempt?.status!=='computed'||Object.keys(r.attempt.actual??{}).length!==61||
     r.textEvidence?.descriptorErrors?.length!==0||r.textEvidence?.used?.length!==13||
     new Set(r.textEvidence.used).size!==13||r.textEvidence.measured?.length!==13||
     r.issues?.some(x=>['selector','cascade'].includes(x.kind)))
   throw Error('Incomplete title geometry evidence '+key);
  const expected=Object.fromEntries(r.oracle.map(x=>[x.path,x.rect]));
  if(Object.keys(expected).length!==61)throw Error('Duplicate oracle path '+key);
  const comparison=compareRectangles(expected,r.attempt.actual,0.5);
  if(!comparison.pass)throw Error('Static title geometry exceeds 0.5px '+key+' max='+comparison.maxDeltaPx+' differences='+comparison.differences.length);
 }
}
