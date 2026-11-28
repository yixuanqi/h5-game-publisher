// V0.5.4d1 bounded, serializable box paint list. No browser box reads.
// All unsupported paint effects are rejected rather than silently discarded.
const finite=n=>Number.isFinite(n)&&Math.abs(n)<=1e6;
const paintProps=new Set('background background-color border-radius overflow-x overflow-y opacity z-index transform visibility'.split(' '));
function color(v){
 v=String(v).trim().toLowerCase();
 if(v==='transparent')return 'rgba(0,0,0,0)';
 if(/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v))return v;
 const m=v.match(/^(rgb|rgba)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*(?:\.\d+)?))?\s*\)$/);
 if(m&&m.slice(2,5).every(s=>Number(s)<=255)&&((m[1]==='rgb'&&m[5]===undefined)||(m[1]==='rgba'&&m[5]&&Number(m[5])<=1)))return v;
 throw Error('Unsupported paint color '+v);
}
function radius(v,r){
 v=String(v??'0').trim();if(v==='0')return 0;
 if(!/^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(v))throw Error('Unsupported border radius '+v);
 const n=Number.parseFloat(v);if(!finite(n))throw Error('Invalid radius');
 return Math.min(n,r.width/2,r.height/2);
}
function rectOf(snapshot,el){
 const r=snapshot.rect(el);
 if(!r||!['x','y','width','height'].every(k=>finite(r[k]))||r.width<0||r.height<0)throw Error('Invalid paint rect');
 return {x:r.x,y:r.y,width:r.width,height:r.height};
}
export function buildBoxPaintList(tree,snapshot){
 const commands=[],seen=new Set();
 function visit(n,depth){
  if(depth>128||seen.size>=8192||!n?.element||seen.has(n.element)||!Array.isArray(n.children??[]))throw Error('Invalid paint tree');
  seen.add(n.element);
  const layout=n.style??{},s=n.paintStyle??{};
  if(layout.display==='none')return;
  if(n.element.namespaceURI==='http://www.w3.org/2000/svg'||['img','canvas','video','input','button','textarea'].includes(n.element.localName))throw Error('Unsupported replaced or control paint');
  if(Array.from(n.element.childNodes??[]).some(x=>x.nodeType===3&&/[^\t\n\f\r ]/.test(String(x.textContent??''))))throw Error('Unsupported text paint');
  for(const k of Object.keys(s))if(!paintProps.has(k))throw Error('Unsupported paint property '+k);
  if(s.opacity!==undefined&&s.opacity!=='1'||s['z-index']!==undefined&&s['z-index']!=='auto'||s.transform!==undefined&&s.transform!=='none'||s.visibility!==undefined&&s.visibility!=='visible')throw Error('Unsupported paint stacking or visibility');
  // d1 only accepts normal-flow DOM order. Positioned elements, CSS order,
  // borders and scrolling require explicit stacking/clip implementations.
  if(layout.position&&layout.position!=='static'||layout.order!==undefined&&layout.order!=='0'||Object.keys(layout).some(k=>/^border-.*-width$/.test(k)&&!['0','0px'].includes(layout[k])))throw Error('Unsupported positioned, reordered or bordered paint');
  const ox=s['overflow-x']??'visible',oy=s['overflow-y']??'visible';
  if(ox!==oy||!['visible','hidden'].includes(ox))throw Error('Unsupported overflow paint');
  if(s.background!==undefined&&s['background-color']!==undefined)throw Error('Ambiguous background cascade');
  const r=rectOf(snapshot,n.element),round=radius(s['border-radius'],r);
  const bg=s.background??s['background-color'];
  if(bg!==undefined){const fill=color(bg);if(r.width&&r.height)commands.push({op:'fill',rect:r,radius:round,color:fill});}
  if(ox==='hidden')commands.push({op:'pushClip',rect:r,radius:round});
  for(const child of n.children??[])visit(child,depth+1);
  if(ox==='hidden')commands.push({op:'popClip'});
 }
 visit(tree,0);
 return {schema:1,commands};
}
function path(ctx,r,round){
 ctx.beginPath();
 const {x,y,width:w,height:h}=r;
 if(!round){ctx.rect(x,y,w,h);return;}
 ctx.moveTo(x+round,y);ctx.arcTo(x+w,y,x+w,y+h,round);ctx.arcTo(x+w,y+h,x,y+h,round);
 ctx.arcTo(x,y+h,x,y,round);ctx.arcTo(x,y,x+w,y,round);ctx.closePath();
}
export function replayBoxPaint(ctx,list){
 if(list?.schema!==1||!Array.isArray(list.commands)||list.commands.length>24576)throw Error('Invalid paint list');
 let depth=0;
 ctx.save();
 try{
  for(const c of list.commands){
   if(c.op==='popClip'){if(!depth)throw Error('Unbalanced paint clips');ctx.restore();depth--;continue;}
   if(!['fill','pushClip'].includes(c.op))throw Error('Unsupported paint command');
   const r=c.rect;if(!r||!['x','y','width','height'].every(k=>finite(r[k]))||r.width<0||r.height<0||!finite(c.radius)||c.radius<0||c.radius>Math.min(r.width,r.height)/2)throw Error('Invalid paint command geometry');
   if(c.op==='pushClip'){ctx.save();depth++;path(ctx,r,c.radius);ctx.clip();}
   else{const fill=color(c.color);path(ctx,r,c.radius);ctx.fillStyle=fill;ctx.fill();}
  }
  if(depth)throw Error('Unbalanced paint clips');
 }finally{while(depth>0){ctx.restore();depth--;}ctx.restore();}
}
