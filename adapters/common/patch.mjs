export function replaceOnce(s,from,to){
  if(s.split(from).length!==2) throw Error('Game adapter anchor missing or ambiguous: '+from);
  return s.replace(from,()=>to);
}
