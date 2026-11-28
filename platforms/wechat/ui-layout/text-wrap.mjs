/** Bounded normal-whitespace line measurement, with an injected glyph advance.
 * ASCII words only; mixed inline formatting, Unicode breaks and bidi are not
 * silently approximated. No browser element rectangle may enter this API. */
export function measureWordLines(text,{maxWidth,lineHeight,measureAdvance}={}){
 if(typeof text!=='string'||text.length>4096||!/^[A-Za-z0-9 \t\r\n\f]*$/.test(text))
  throw Error('Unsupported text line breaking');
 if(!Number.isFinite(maxWidth)||maxWidth<0||!Number.isFinite(lineHeight)||lineHeight<=0||typeof measureAdvance!=='function')
  throw Error('Invalid line measurement context');
 const words=text.trim().split(/\s+/).filter(Boolean);
 const lines=[];let line='';
 const widthOf=s=>{const n=measureAdvance(s);if(!Number.isFinite(n)||n<0)throw Error('Invalid glyph advance');return n;};
 for(const word of words){
  const candidate=line?line+' '+word:word;
  if(line&&widthOf(candidate)>maxWidth){lines.push(line);line=word;}else line=candidate;
 }
 if(line)lines.push(line);
 const width=lines.length?Math.max(...lines.map(widthOf)):0;
 return {width,height:lines.length*lineHeight,lines};
}
