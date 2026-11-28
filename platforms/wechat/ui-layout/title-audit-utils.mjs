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
 const differences=[];
 for(const [path,e] of Object.entries(expected)){
  const a=actual[path];
  if(!a){differences.push({path,reason:'missing'});continue;}
  for(const key of keys){
   if(!Number.isFinite(e[key])||!Number.isFinite(a[key]))throw Error('Invalid geometry '+path+' '+key);
   const delta=Math.abs(e[key]-a[key]);
   if(delta>tolerance)differences.push({path,key,delta,expected:e[key],actual:a[key]});
  }
 }
 for(const path of Object.keys(actual))if(!Object.hasOwn(expected,path))differences.push({path,reason:'unexpected'});
 return {pass:differences.length===0,differences};
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
