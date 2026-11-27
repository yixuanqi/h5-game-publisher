'use strict';
// These are independent analytical fixtures, not values from a game or an emulator.
function runLayoutCases(b){
  const results=[];
  function node(style={}){const h=b.createNode();for(const [p,v] of Object.entries(style))b.setStyle(h,p,v);return h;}
  function compare(id,expected,actual){const keys=Object.keys(expected);const delta=Object.fromEntries(keys.map(k=>[k,Math.abs(expected[k]-actual[k])]));const maxDelta=Math.max(...Object.values(delta));results.push({id,expected,actual,delta,maxDelta,pass:Number.isFinite(maxDelta)&&maxDelta<=0.5});}
  for(const [width,expected] of [[800,{a:409.76,b:421.76,c:378.24}],[400,{a:140,b:152,c:248}]]){
    b.reset();const root=node({display:'grid',width:width+'px',height:'100px','column-gap':'12px','grid-template-columns':'minmax(0, 1.04fr) minmax(248px, 0.96fr)'});
    const a=node({'min-width':'0px'}),c=node({'min-width':'0px'});b.append(root,a);b.append(root,c);b.calculate(root,{width,height:100});compare('grid-'+width,expected,{a:b.rect(a).width,b:b.rect(c).x,c:b.rect(c).width});
  }
  b.reset();let root=node({display:'flex',width:'300px',height:'80px','justify-content':'space-between','align-items':'center'});let a=node({width:'40px',height:'20px'}),c=node({width:'60px',height:'30px'});b.append(root,a);b.append(root,c);b.calculate(root,{width:300,height:80});compare('flex-space-between',{ax:0,ay:30,cx:240,cy:25},{ax:b.rect(a).x,ay:b.rect(a).y,cx:b.rect(c).x,cy:b.rect(c).y});
  b.setStyle(root,'width','360px');let staleRejected=false;try{b.rect(c);}catch{staleRejected=true;}b.calculate(root,{width:360,height:80});compare('mutation',{cx:300,staleRejected:1},{cx:b.rect(c).x,staleRejected:Number(staleRejected)});
  b.reset();root=node({display:'grid',width:'300px',height:'100px','grid-template-columns':'repeat(3, 1fr)','column-gap':'9px'});a=node({'grid-column-start':'3','grid-column-end':'4'});b.append(root,a);b.calculate(root,{width:300,height:100});compare('grid-explicit-placement',{x:206,width:94},{x:b.rect(a).x,width:b.rect(a).width});
  b.reset();root=node({display:'block',width:'200px',height:'100px',position:'relative'});a=node({position:'absolute',left:'25%',top:'10px',width:'40px',height:'20px'});b.append(root,a);b.calculate(root,{width:200,height:100});compare('absolute-percent',{x:50,y:10,width:40,height:20},b.rect(a));
  b.reset();root=node({display:'flex',width:'200px',height:'100px','align-items':'flex-start'});a=node({width:'80px','aspect-ratio':'2'});b.append(root,a);b.calculate(root,{width:200,height:100});compare('aspect-ratio',{width:80,height:40},b.rect(a));
  b.detach(root,a);b.free(a);let invalidRejected=false;try{b.rect(a);}catch{invalidRejected=true;}compare('lifecycle',{invalidRejected:1},{invalidRejected:Number(invalidRejected)});
  b.reset();return {pass:results.every(x=>x.pass),cases:results,maxDeltaPx:Math.max(...results.map(x=>x.maxDelta)),releaseReady:false};
}
module.exports={runLayoutCases};
