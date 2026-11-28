/** Font metric composition, not element geometry. Normal CSS line height is
 * approximated by the union of primary and used fallback font extents on the
 * common alphabetic baseline. Font leading and platform-specific rounding
 * remain explicit limitations; explicit CSS line-height always wins. */
export function composeFontLineMetrics(primary,fallbacks=[],explicit=null){
 if(!Array.isArray(fallbacks)||fallbacks.length>128)throw Error('Invalid fallback metrics');
 const all=[primary,...fallbacks];
 for(const m of all){
  if(![m?.ascent,m?.descent].every(v=>Number.isFinite(v)&&v>=0&&v<=4096)||m.ascent+m.descent<=0)
   throw Error('Invalid font extents');
 }
 if(explicit!==null&&(!Number.isFinite(explicit)||explicit<=0||explicit>4096))throw Error('Invalid explicit line height');
 const ascent=Math.max(...all.map(m=>m.ascent)),descent=Math.max(...all.map(m=>m.descent));
 return {ascent,descent,height:explicit??(ascent+descent),primaryHeight:primary.ascent+primary.descent};
}
