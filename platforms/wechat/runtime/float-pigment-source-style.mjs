import {parseFractionTracks} from '../layout/tracks.mjs';

export function mapFractionGridTemplate(template){
  const tracks=parseFractionTracks(template);
  return tracks.map(({min,fr})=>{
    if(min!==0)throw Error('float-pigment ABI v1 cannot encode non-zero minmax minimum yet');
    return {unit:'fr',value:fr};
  });
}


export function mapFlexParent(style){
  if(style?.display!=='flex')throw Error('float-pigment flex mapper requires display:flex');
  const wrap=style['flex-wrap']??'nowrap';
  if(wrap!=='nowrap')throw Error('float-pigment ABI v1 flex mapper does not accept wrapping yet');
  const direction=style['flex-direction']??'row';
  const justify=style['justify-content']??'normal';
  const align=style['align-items']??'stretch';
  if(!['row','row-reverse','column','column-reverse'].includes(direction))throw Error('Unsupported flex direction: '+direction);
  if(!['normal','center','flex-start','flex-end','space-between','space-around','space-evenly','start','end','left','right','stretch','baseline'].includes(justify))throw Error('Unsupported justify-content: '+justify);
  if(!['normal','stretch','center','start','end','flex-start','flex-end','self-start','self-end','baseline'].includes(align))throw Error('Unsupported align-items: '+align);
  return {display:'flex',direction,justify,align};
}
