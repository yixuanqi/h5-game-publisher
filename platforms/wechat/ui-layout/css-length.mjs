// Bounded CSS typed arithmetic; do not guess unresolved percentage bases.
export function evaluateCssLength(value,{viewport,percentageBase,safeArea}={}){
 const s=String(value).trim();
 if(s.length>4096)throw Error('CSS length expression too long');
 let i=0,depth=0;
 const fail=reason=>{throw Error(reason+' at '+i+' in '+s);};
 const ws=()=>{while(/\s/.test(s[i]||'')&&i<s.length)i++;};
 const eat=c=>{ws();if(s[i]!==c)return false;i++;return true;};
 const result=(n,unit)=>{if(!Number.isFinite(n)||Math.abs(n)>1e9)fail('Invalid CSS numeric result');return {n,unit};};
 const same=(a,b,op)=>{if(a.unit!==b.unit)fail('Incompatible CSS dimensions');return result(op(a.n,b.n),a.unit);};
 function primary(){
  ws();
  if(++depth>64)fail('CSS expression too deep');
  try{
   if(eat('(')){const a=sum();if(!eat(')'))fail('Missing )');return a;}
   const num=s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
   if(num){
    i+=num[0].length;const n=Number(num[0]);const u=s.slice(i).match(/^(?:%|[a-zA-Z]+)/)?.[0]||'';i+=u.length;
    if(!u)return result(n,'number');
    if(u==='px')return result(n,'length');
    if(u==='%'){if(!Number.isFinite(percentageBase)||percentageBase<0)fail('Unresolved percentage base');return result(n*percentageBase/100,'length');}
    if(['vw','dvw','vh','dvh'].includes(u)){const b=viewport?.[u.endsWith('vw')?'width':'height'];if(!Number.isFinite(b)||b<0)fail('Unresolved viewport');return result(n*b/100,'length');}
    fail('Unsupported CSS unit '+u);
   }
   const name=s.slice(i).match(/^[a-zA-Z][a-zA-Z-]*/)?.[0];if(!name)fail('Expected CSS term');
   i+=name.length;
   if(!eat('('))fail('Expected function');
   if(name==='env'){
    ws();const key=s.slice(i).match(/^safe-area-inset-(?:top|right|bottom|left)\b/)?.[0];
    if(!key)fail('Unsupported env name');i+=key.length;
    const v=safeArea?.[key.slice('safe-area-inset-'.length)];
    if(!eat(')'))fail('Unsupported env fallback');
    if(!Number.isFinite(v)||v<0)fail('Unresolved safe-area inset');
    return result(v,'length');
   }
   if(!['calc','min','max','clamp'].includes(name))fail('Unsupported CSS function '+name);
   const args=[sum()];while(eat(','))args.push(sum());if(!eat(')'))fail('Missing )');
   if(name==='calc'){if(args.length!==1)fail('Invalid calc arity');return args[0];}
   if(name==='clamp'&&args.length!==3)fail('Invalid clamp arity');
   if(args.some(a=>a.unit!==args[0].unit))fail('Incompatible CSS dimensions');
   const v=args.map(a=>a.n);
   return result(name==='min'?Math.min(...v):name==='max'?Math.max(...v):Math.max(v[0],Math.min(v[1],v[2])),args[0].unit);
  }finally{depth--;}
 }
 function unary(){
  ws();let sign=1,count=0;
  while(s[i]==='+'||s[i]==='-'){if(s[i++]==='-')sign=-sign;if(++count>64)fail('Too many signs');}
  const a=primary();return result(sign*a.n,a.unit);
 }
 function product(){
  let a=unary();
  for(;;){ws();const op=s[i];if(op!=='*'&&op!=='/')return a;i++;const b=unary();
   if(op==='*'){if(a.unit==='length'&&b.unit==='length')fail('Length multiplied by length');a=result(a.n*b.n,a.unit==='length'||b.unit==='length'?'length':'number');}
   else{if(b.unit!=='number'||b.n===0)fail('Invalid CSS divisor');a=result(a.n/b.n,a.unit);}
  }
 }
 function sum(){
  let a=product();
  for(;;){ws();const op=s[i];if(op!=='+'&&op!=='-')return a;
   if(!/\s/.test(s[i-1]||'')||!/\s/.test(s[i+1]||''))fail('CSS binary +/- requires whitespace');
   i++;a=same(a,product(),(x,y)=>op==='+'?x+y:x-y);
  }
 }
 const a=sum();ws();if(i!==s.length)fail('Trailing CSS tokens');
 if(a.unit!=='length'&&a.n!==0)fail('Unitless CSS length');
 return Object.is(a.n,-0)?0:a.n;
}
