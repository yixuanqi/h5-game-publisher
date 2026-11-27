import {parseFractionTracks} from '../layout/tracks.mjs';

export function mapFractionGridTemplate(template){
  const tracks=parseFractionTracks(template);
  return tracks.map(({min,fr})=>{
    if(min!==0)throw Error('float-pigment ABI v1 cannot encode non-zero minmax minimum yet');
    return {unit:'fr',value:fr};
  });
}
