// Deliberately bounded layout primitives; no game selectors or browser dependency.
export function parseFractionTracks(css){
  const s=String(css).trim();
  const one=/^minmax\(\s*0(?:px)?\s*,\s*(\d+(?:\.\d+)?)fr\s*\)/;
  const repeat=s.match(/^repeat\(\s*(\d+)\s*,\s*([\s\S]+)\)$/);
  if(repeat){
    const n=Number(repeat[1]);
    if(!Number.isSafeInteger(n)||n<1||n>128)throw Error('Unsupported repeat count');
    const part=parseFractionTracks(repeat[2]);
    if(n*part.length>128)throw Error('Too many tracks');
    return Array.from({length:n},()=>part).flat();
  }
  let rest=s,tracks=[];
  while(rest){
    const m=rest.match(one)||rest.match(/^(\d+(?:\.\d+)?)fr(?=\s|$)/);
    if(!m||Number(m[1])<=0)throw Error('Unsupported grid template: '+css);
    tracks.push(Number(m[1]));rest=rest.slice(m[0].length).trim();
    if(tracks.length>128)throw Error('Too many tracks');
  }
  if(!tracks.length)throw Error('Empty grid template');
  return tracks;
}
export function gridTracks(width,gap,template){
  if(!Number.isFinite(width)||width<0||!Number.isFinite(gap)||gap<0)throw Error('Invalid content box');
  const weights=parseFractionTracks(template),available=width-gap*(weights.length-1);
  if(available<0)throw Error('Grid gaps exceed content box');
  const total=weights.reduce((a,b)=>a+b,0);let x=0;
  return weights.map(w=>{const size=available*w/total,r={x,width:size};x+=size+gap;return r;});
}
export function columnTracks(width,children){
  if(!Number.isFinite(width)||width<0)throw Error('Invalid content box');
  return children.map(c=>{
    if(c.width!=='100%'||c.marginLeft!==0||c.marginRight!==0)throw Error('Unsupported flex child width or margin');
    const outer=c.boxSizing==='border-box'?width:width+c.horizontalExtras;
    if(!Number.isFinite(outer)||outer<0)throw Error('Invalid child width');
    return {x:0,width:outer};
  });
}
export function locateTrack(tracks,x){
  return tracks.findIndex(t=>x>=t.x&&x<t.x+t.width);
}
