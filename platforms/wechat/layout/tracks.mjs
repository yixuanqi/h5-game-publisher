// Deliberately bounded layout primitives; no game selectors or browser dependency.
export function parseFractionTracks(css){
  const s=String(css).trim();
  const one=/^minmax\(\s*(0|(?:\d+(?:\.\d+)?)px)\s*,\s*(\d+(?:\.\d+)?)fr\s*\)/;
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
    const m=rest.match(one);
    const bare=rest.match(/^(\d+(?:\.\d+)?)fr(?=\s|$)/);
    const min=m?parseFloat(m[1]):0,fr=m?Number(m[2]):Number(bare?.[1]);
    if(!Number.isFinite(fr)||fr<=0||!Number.isFinite(min))throw Error('Unsupported grid template: '+css);
    tracks.push({min,fr});rest=rest.slice((m||bare)[0].length).trim();
    if(tracks.length>128)throw Error('Too many tracks');
  }
  if(!tracks.length)throw Error('Empty grid template');
  return tracks;
}
export function gridTracks(width,gap,template){
  if(!Number.isFinite(width)||width<0||!Number.isFinite(gap)||gap<0)throw Error('Invalid content box');
  const tracks=parseFractionTracks(template),available=width-gap*(tracks.length-1);
  if(available<0)throw Error('Grid gaps exceed content box');
  const sizes=tracks.map(t=>t.min);
  let remaining=available,active=tracks.map((_,i)=>i);
  // CSS flexible tracks: freeze tracks whose fixed minimum exceeds their
  // hypothetical flex share, then redistribute remaining space.
  while(active.length){
    const total=active.reduce((a,i)=>a+tracks[i].fr,0);
    const unit=Math.max(0,remaining)/Math.max(1,total);
    const frozen=active.filter(i=>tracks[i].min>unit*tracks[i].fr);
    if(!frozen.length){for(const i of active)sizes[i]=unit*tracks[i].fr;break;}
    for(const i of frozen)remaining-=sizes[i];
    active=active.filter(i=>!frozen.includes(i));
  }
  let x=0;
  return sizes.map(size=>{const r={x,width:size};x+=size+gap;return r;});
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
