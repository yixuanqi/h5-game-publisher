// Explicitly separate generated boxes from real DOM matching. This is not a
// pseudo-element renderer; unknown pseudo-elements remain unsupported.
const legacy=new Set(['before','after','first-letter','first-line']);
const deferred=new Set([...legacy,'-webkit-scrollbar','-webkit-scrollbar-track',
  '-webkit-scrollbar-thumb','-webkit-scrollbar-corner',
  '-webkit-scrollbar-button','-webkit-scrollbar-track-piece','-webkit-resizer']);
export function classifyPseudoElement(selector){
  let quote='',brackets=0,parens=0,found=null;
  for(let i=0;i<selector.length;i++){
    const ch=selector[i];
    if(ch==='\\'){i++;continue;}
    if(quote){if(ch===quote)quote='';continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='['){brackets++;continue;}
    if(ch===']'){brackets--;continue;}
    if(brackets)continue;
    if(ch==='('){parens++;continue;}
    if(ch===')'){parens--;continue;}
    if(ch!==':')continue;
    const double=selector[i+1]===':';
    const name=selector.slice(i+(double?2:1)).match(/^[-\w]+/)?.[0]?.toLowerCase();
    if(!double&&!legacy.has(name))continue;
    if(!deferred.has(name)||parens||found)throw Error('Unsupported pseudo-element selector: '+selector);
    found=name;
    i+=(double?1:0)+name.length;
  }
  return found;
}
