// V0.5.4d1 bounded, serializable box paint list. No browser box reads.
// All unsupported paint effects are rejected rather than silently discarded.
const finite=n=>Number.isFinite(n)&&Math.abs(n)<=1e6;
const paintProps=new Set('background background-color border-radius overflow-x overflow-y opacity z-index transform transform-origin visibility box-shadow border-top-color border-right-color border-bottom-color border-left-color border-top-style border-right-style border-bottom-style border-left-style'.split(' '));
function color(v){
 v=String(v).trim().toLowerCase();
 if(v==='transparent')return 'rgba(0,0,0,0)';
 if(/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v))return v;
 const m=v.match(/^(rgb|rgba)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*(?:\.\d+)?))?\s*\)$/);
 if(m&&m.slice(2,5).every(s=>Number(s)<=255)&&((m[1]==='rgb'&&m[5]===undefined)||(m[1]==='rgba'&&m[5]&&Number(m[5])<=1)))return v;
 throw Error('Unsupported paint color '+v);
}
// CSS angle convention: 0deg points up, 90deg right. CSS gradient line
// spans the projection of the entire padding box onto that direction.
function splitLayers(value,space=false){
 const parts=[];let depth=0,start=0;
 for(let i=0;i<value.length;i++){
  const ch=value[i];if(ch==='(')depth++;if(ch===')')depth--;
  if(depth<0)throw Error('Invalid paint syntax');
  if(depth===0&&(space?/\s/.test(ch):ch===',')){
   const p=value.slice(start,i).trim();if(p)parts.push(p);else if(!space)throw Error('Empty paint layer');
   start=i+1;
  }
 }
 if(depth)throw Error('Invalid paint syntax');
 const tail=value.slice(start).trim();if(tail)parts.push(tail);else if(!space)throw Error('Empty paint layer');
 if(parts.length>64)throw Error('Too many paint layers');
 return parts;
}
function gradientStops(parts){
 if(parts.length<2||parts.length>64)throw Error('Unsupported gradient stops');
 const stops=parts.map(s=>{
  const p=s.match(/^(.*?)\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))%$/);
  return {color:color(p?p[1]:s),offset:p?Number(p[2])/100:null};
 });
 if(stops.some(s=>s.offset!==null&&(!finite(s.offset)||s.offset<0||s.offset>1)))throw Error('Unsupported gradient stop offset');
 stops[0].offset??=0;stops.at(-1).offset??=1;
 let last=0;
 for(let i=1;i<stops.length;i++)if(stops[i].offset!==null){
  stops[i].offset=Math.max(stops[last].offset,stops[i].offset);
  for(let j=last+1;j<i;j++)stops[j].offset=stops[last].offset+(stops[i].offset-stops[last].offset)*(j-last)/(i-last);
  last=i;
 }
 return stops;
}
export function linearGradient(value,r){
 const m=String(value).trim().match(/^linear-gradient\((.*)\)$/s);
 if(!m)throw Error('Unsupported linear gradient '+value);
 const parts=splitLayers(m[1]);
 let angle=180;
 const a=parts[0].match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))deg$/);
 const directions={'to top':0,'to right':90,'to bottom':180,'to left':270};
 if(a){angle=Number(a[1]);parts.shift();}
 else if(Object.hasOwn(directions,parts[0]))angle=directions[parts.shift()];
 if(!finite(angle))throw Error('Invalid gradient angle');
 const stops=gradientStops(parts);
 const t=angle*Math.PI/180,dx=Math.sin(t),dy=-Math.cos(t);
 const half=(Math.abs(dx)*r.width+Math.abs(dy)*r.height)/2,cx=r.x+r.width/2,cy=r.y+r.height/2;
 return {x0:cx-dx*half,y0:cy-dy*half,x1:cx+dx*half,y1:cy+dy*half,stops};
}
export function radialGradient(value,r){
 const m=String(value).trim().match(/^radial-gradient\((.*)\)$/s);
 if(!m)throw Error('Unsupported radial gradient '+value);
 const parts=splitLayers(m[1]);let shape='ellipse',extent='farthest-corner',px=.5,py=.5,explicit=null;
 // Bounded shape/size/position grammar; default is ellipse farthest-corner.
 if(/^(?:ellipse|circle|closest-side|farthest-side|closest-corner|farthest-corner|at\b)/.test(parts[0])){
  const p=parts.shift(),pieces=p.split(/\s+at\s+|^at\s+/);
  if(pieces.length>2)throw Error('Unsupported radial position');
  const header=pieces[0].trim().split(/\s+/).filter(Boolean);
  if(['ellipse','circle'].includes(header[0]))shape=header.shift();
  if(header.length===1&&['closest-side','farthest-side','closest-corner','farthest-corner'].includes(header[0]))extent=header[0];
  else if(header.length){
   if(header.length!==(shape==='circle'?1:2)||header.some(v=>!/^(?:\d+(?:\.\d+)?|\.\d+)(px|%)$/.test(v))||shape==='circle'&&header[0].endsWith('%'))throw Error('Unsupported radial size');
   explicit=header;
  }
  if(pieces.length===2){
   const xy=pieces[1].trim().split(/\s+/);
   if(xy.length!==2||xy.some(v=>!/^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(v)))throw Error('Unsupported radial center');
   [px,py]=xy.map(v=>parseFloat(v)/100);
   if(px>1||py>1)throw Error('Unsupported radial center');
  }
 }
 const x=r.width*px,y=r.height*py,dx=[x,r.width-x],dy=[y,r.height-y];
 const closest=extent.startsWith('closest'),corner=extent.endsWith('corner'),choose=closest?Math.min:Math.max;
 let rx,ry;
 if(explicit){const len=(v,b)=>parseFloat(v)*(v.endsWith('%')?b/100:1);rx=len(explicit[0],r.width);ry=shape==='circle'?rx:len(explicit[1],r.height);}
 else if(shape==='circle'){
  rx=ry=corner?choose(...dx.flatMap(a=>dy.map(b=>Math.hypot(a,b)))):choose(...dx,...dy);
 }else{
  rx=choose(...dx);ry=choose(...dy);
  if(corner){if(rx<=0||ry<=0)throw Error('Degenerate radial ellipse');const scale=choose(...dx.flatMap(a=>dy.map(b=>Math.hypot(a/rx,b/ry))));rx*=scale;ry*=scale;}
 }
 if(![rx,ry].every(v=>finite(v)&&v>0))throw Error('Degenerate radial gradient');
 return {cx:r.x+x,cy:r.y+y,rx,ry,stops:gradientStops(parts)};
}
export function outerShadows(value,r,round){
 if(value===undefined||value==='none')return [];
 return splitLayers(value).map(layer=>{
  const tokens=splitLayers(layer,true),lengths=[],colors=[];
  for(const t of tokens){
   if(t==='inset')throw Error('Unsupported inset shadow');
   if(/^(?:0|[+-]?(?:\d+(?:\.\d+)?|\.\d+)px)$/.test(t))lengths.push(parseFloat(t));
   else colors.push(t);
  }
  if(lengths.length<2||lengths.length>4||colors.length!==1)throw Error('Unsupported box shadow '+layer);
  const [dx,dy,blur=0,spread=0]=lengths;
  if(!lengths.every(v=>finite(v)&&Math.abs(v)<=512)||blur<0)throw Error('Invalid shadow length');
  const caster={x:r.x-spread,y:r.y-spread,width:r.width+2*spread,height:r.height+2*spread};
  if(caster.width<=0||caster.height<=0)throw Error('Unsupported collapsed shadow');
  // For rounded boxes CSS spread changes corner radius. Restrict d2b
  // rounded spread to zero (general nonlinear corner adjustment deferred).
  if(round&&spread!==0)throw Error('Unsupported rounded shadow spread');
  return {dx,dy,blur,spread,caster,casterRadius:Math.min(round,caster.width/2,caster.height/2),color:color(colors[0])};
 });
}
const sides=['top','right','bottom','left'];
function borderInfo(layout,s,r,round){
 const widths=sides.map(side=>{
  const v=String(layout['border-'+side+'-width']??'0');
  if(!/^(?:0|\d+(?:\.\d+)?px)$/.test(v))throw Error('Unsupported border width '+v);
  const w=Number.parseFloat(v);if(!Number.isInteger(w)||w>1e6)throw Error('Unsupported fractional border width');
  return w;
 });
 const colors=widths.map((w,i)=>{
  if(!w)return null;
  if(s['border-'+sides[i]+'-style']!=='solid')throw Error('Unsupported border style');
  return color(s['border-'+sides[i]+'-color']);
 });
 const [t,right,b,l]=widths;
 const inner={x:r.x+l,y:r.y+t,width:r.width-l-right,height:r.height-t-b};
 if(inner.width<0||inner.height<0)throw Error('Unsupported collapsed border box');
 const uniform=widths.every(w=>w===t)&&colors.every(c=>c===colors[0]);
 if(round&&widths.some(Boolean)&&!uniform)throw Error('Unsupported nonuniform rounded border');
 return {widths,colors,inner,innerRadius:Math.min(Math.max(0,round-t),inner.width/2,inner.height/2),uniform};
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
// Affine matrices follow Canvas [a,b,c,d,e,f], CSS function order.
const identity=()=>[1,0,0,1,0,0];
const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
const translation=(x,y)=>[1,0,0,1,x,y];
const numeric=v=>{if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v))||!finite(Number(v)))throw Error('Unsupported transform number '+v);return Number(v);};
const distance=(v,base)=>{if(v==='0')return 0;const m=String(v).match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|%)$/);if(!m)throw Error('Unsupported transform length '+v);return numeric(m[1])*(m[2]==='%'?base/100:1);};
export function transformMatrix(value,r,origin='50% 50%'){
 if(value===undefined||value==='none')return identity();
 const axes=String(origin).trim().split(/\s+/);
 if(axes.length===1)axes.push('50%');
 if(axes.length!==2)throw Error('Unsupported transform origin');
 const ox=r.x+distance(({left:'0%',center:'50%',right:'100%'})[axes[0]]??axes[0],r.width);
 const oy=r.y+distance(({top:'0%',center:'50%',bottom:'100%'})[axes[1]]??axes[1],r.height);
 let matrix=identity(),rest=String(value).trim(),count=0;
 while(rest){
  const m=rest.match(/^([A-Za-z][A-Za-z0-9]*)\(\s*([^()]*)\s*\)/);
  if(!m||++count>32)throw Error('Unsupported transform syntax '+rest);
  const args=m[2].trim().split(/\s*,\s*/);
  let next;
  switch(m[1]){
   case 'translate':if(args.length<1||args.length>2)throw Error('Invalid translate');next=translation(distance(args[0],r.width),distance(args[1]??'0',r.height));break;
   case 'translateX':case 'translateY':if(args.length!==1)throw Error('Invalid translate axis');next=m[1]==='translateX'?translation(distance(args[0],r.width),0):translation(0,distance(args[0],r.height));break;
   case 'scale':if(args.length<1||args.length>2)throw Error('Invalid scale');next=[numeric(args[0]),0,0,numeric(args[1]??args[0]),0,0];break;
   case 'scaleX':case 'scaleY':if(args.length!==1)throw Error('Invalid scale axis');next=m[1]==='scaleX'?[numeric(args[0]),0,0,1,0,0]:[1,0,0,numeric(args[0]),0,0];break;
   case 'rotate':{if(args.length!==1||!args[0].endsWith('deg'))throw Error('Unsupported rotation');const a=numeric(args[0].slice(0,-3))*Math.PI/180,c=Math.cos(a),s=Math.sin(a);next=[c,s,-s,c,0,0];break;}
   case 'matrix':if(args.length!==6)throw Error('Invalid CSS matrix');next=args.map(numeric);break;
   default:throw Error('Unsupported transform '+m[1]);
  }
  matrix=mul(matrix,next);rest=rest.slice(m[0].length).trim();
 }
 const out=mul(mul(translation(ox,oy),matrix),translation(-ox,-oy));
 if(!out.every(finite))throw Error('Invalid transform matrix');
 return out;
}
function stackMeta(n,parent){
 const s=n.paintStyle??{},layout=n.style??{};
 const position=layout.position??'static';
 if(!['static','relative','absolute','fixed'].includes(position))throw Error('Unsupported position for paint '+position);
 if(layout.order!==undefined&&layout.order!=='0')throw Error('Unsupported reordered paint');
 const opacity=s.opacity===undefined?1:numeric(s.opacity);
 if(opacity<0||opacity>1)throw Error('Unsupported opacity');
 const transformed=s.transform!==undefined&&s.transform!=='none';
 const item=['flex','grid','inline-flex','inline-grid'].includes(parent?.style?.display);
 const z=s['z-index']??'auto';
 let level=0;
 if(z!=='auto'){
  if(position==='static'&&!item)throw Error('Unsupported z-index on non-positioned non-item');
  if(!/^[+-]?\d+$/.test(z)||!Number.isSafeInteger(Number(z)))throw Error('Invalid z-index');
  level=Number(z);
 }
 const context=z!=='auto'||opacity<1||transformed||position==='fixed';
 const special=context||position!=='static';
 return {position,opacity,transformed,context,special,level,phase:level<0?0:!special?1:level===0?2:3};
}
export function buildBoxPaintList(tree,snapshot,{stacking=false}={}){
 const commands=[],seen=new Set();
 function visit(n,depth,target,parent=null,ancestor={transformed:false,clipped:false}){
  const commands=[];
  if(depth>128||seen.size>=8192||!n?.element||seen.has(n.element)||!Array.isArray(n.children??[]))throw Error('Invalid paint tree');
  seen.add(n.element);
  const layout=n.style??{},s=n.paintStyle??{};
  if(layout.display==='none')return;
  if(n.element.namespaceURI==='http://www.w3.org/2000/svg'||['img','canvas','video','input','button','textarea'].includes(n.element.localName))throw Error('Unsupported replaced or control paint');
  if(Array.from(n.element.childNodes??[]).some(x=>x.nodeType===3&&/[^\t\n\f\r ]/.test(String(x.textContent??''))))throw Error('Unsupported text paint');
  for(const k of Object.keys(s))if(!paintProps.has(k))throw Error('Unsupported paint property '+k);
  if(s.visibility!==undefined&&s.visibility!=='visible')throw Error('Unsupported paint visibility');
  if(!stacking&&(s.opacity!==undefined&&s.opacity!=='1'||s['z-index']!==undefined&&s['z-index']!=='auto'||s.transform!==undefined&&s.transform!=='none'||s['transform-origin']!==undefined||layout.position&&layout.position!=='static'||layout.order!==undefined&&layout.order!=='0'))throw Error('Unsupported paint stacking or positioning');
  const meta=stacking?stackMeta(n,parent):null;
  if(stacking&&meta.position==='fixed'&&(ancestor.transformed||ancestor.clipped))throw Error('Unsupported fixed paint containing block or clip');
  if(stacking&&meta.position==='absolute'&&parent&&(!parent.style?.position||parent.style.position==='static'))throw Error('Unsupported absolute paint containing block');
  if(stacking&&(ancestor.transformed||meta.transformed)&&s['box-shadow']&&s['box-shadow']!=='none')throw Error('Unsupported transformed box shadow');
  const ox=s['overflow-x']??'visible',oy=s['overflow-y']??'visible';
  if(ox!==oy||!['visible','hidden'].includes(ox))throw Error('Unsupported overflow paint');
  if(s.background!==undefined&&s['background-color']!==undefined)throw Error('Ambiguous background cascade');
  const r=rectOf(snapshot,n.element),round=radius(s['border-radius'],r);
  const border=borderInfo(layout,s,r,round);
  const bg=s.background??s['background-color'];
  if(r.width&&r.height){
   for(const shadow of outerShadows(s['box-shadow'],r,round).reverse())commands.push({op:'shadow',rect:r,radius:round,shadow});
   if(bg!==undefined){
    const layers=splitLayers(bg);
    for(let i=layers.length-1;i>=0;i--){
     const v=layers[i];
     if(v.startsWith('linear-gradient('))commands.push({op:'gradient',rect:r,radius:round,gradient:linearGradient(v,border.inner)});
     else if(v.startsWith('radial-gradient('))commands.push({op:'radial',rect:r,radius:round,gradient:radialGradient(v,border.inner)});
     else{if(i!==layers.length-1)throw Error('Unsupported background color layer');commands.push({op:'fill',rect:r,radius:round,color:color(v)});}
    }
   }
  }
  if(border.widths.some(Boolean)){
   if(border.uniform)commands.push({op:'ring',rect:r,radius:round,inner:border.inner,innerRadius:border.innerRadius,color:border.colors[0]});
   else{
    // Only nonoverlapping single-side borders or identical colors are safe.
    const active=border.colors.filter(c=>c!==null);
    if(active.length>1&&!active.every(c=>c===active[0]))throw Error('Unsupported nonuniform border colors');
    const [t,rr,b,l]=border.widths;
    const strips=[{x:r.x,y:r.y,width:r.width,height:t},{x:r.x+r.width-rr,y:r.y+t,width:rr,height:r.height-t-b},{x:r.x,y:r.y+r.height-b,width:r.width,height:b},{x:r.x,y:r.y+t,width:l,height:r.height-t-b}];
    strips.forEach((rect,i)=>{if(border.widths[i])commands.push({op:'fill',rect,radius:0,color:border.colors[i]});});
   }
  }
  if(ox==='hidden')commands.push({op:'pushClip',rect:border.inner,radius:border.innerRadius});
  const kids=n.children??[];
  const ordered=stacking?kids.map((child,index)=>({child,index,meta:child.style?.display==='none'?null:stackMeta(child,n)})):
   kids.map((child,index)=>({child,index,meta:null}));
  if(stacking){
   if(depth>0&&!meta.context&&ordered.some(x=>x.meta?.special))throw Error('Unsupported escaping stacking descendant');
   if(!meta.context&&ordered.some(x=>x.meta?.level<0))throw Error('Unsupported negative z-index outside explicit context');
   ordered.sort((a,b)=>(a.meta?.phase??1)-(b.meta?.phase??1)||(a.meta?.level??0)-(b.meta?.level??0)||a.index-b.index);
  }
  for(const {child} of ordered)visit(child,depth+1,commands,n,{transformed:ancestor.transformed||!!meta?.transformed,clipped:ancestor.clipped||ox==='hidden'});
  if(ox==='hidden')commands.push({op:'popClip'});
  if(stacking&&(meta.opacity<1||meta.transformed)){
   const matrix=transformMatrix(s.transform,r,s['transform-origin']);
   target.push({op:'group',opacity:meta.opacity,matrix,commands});
  }else target.push(...commands);
 }
 visit(tree,0,commands);
 return {schema:1,commands};
}
function path(ctx,r,round,append=false){
 if(!append)ctx.beginPath();
 const {x,y,width:w,height:h}=r;
 if(!round){ctx.rect(x,y,w,h);return;}
 ctx.moveTo(x+round,y);ctx.arcTo(x+w,y,x+w,y+h,round);ctx.arcTo(x+w,y+h,x,y+h,round);
 ctx.arcTo(x,y+h,x,y,round);ctx.arcTo(x,y,x+w,y,round);ctx.closePath();
}
export function replayBoxPaint(ctx,list,{createSurface}={}){
 if(list?.schema!==1||!Array.isArray(list.commands))throw Error('Invalid paint list');
 let total=0,livePixels=0;
 function run(ctx,commands,groupDepth){
 if(!Array.isArray(commands)||groupDepth>16)throw Error('Invalid paint group');
 let depth=0;
 ctx.save();
 try{
  for(const c of commands){
   if(++total>65536)throw Error('Oversized paint list');
   if(c.op==='group'){
    if(!finite(c.opacity)||c.opacity<0||c.opacity>1||!Array.isArray(c.matrix)||c.matrix.length!==6||!c.matrix.every(finite)||!Array.isArray(c.commands)||groupDepth>=16)throw Error('Invalid paint group');
    if(c.opacity===0)continue;
    ctx.save();
    try{
     ctx.transform(...c.matrix);
     if(c.opacity===1)run(ctx,c.commands,groupDepth+1);
     else{
      const w=ctx.canvas?.width,h=ctx.canvas?.height,pixels=w*h;
      if(typeof createSurface!=='function'||!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0||pixels>4194304||livePixels+pixels>16777216)throw Error('Unsupported opacity surface allocation');
      const layer=createSurface(w,h),g=layer?.getContext?.('2d');
      if(!g||layer===ctx.canvas||layer.width!==w||layer.height!==h)throw Error('Invalid opacity surface');
      livePixels+=pixels;
      try{
       const m=ctx.getTransform();
       g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);
       g.globalAlpha=1;g.globalCompositeOperation='source-over';
       g.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
       run(g,c.commands,groupDepth+1);
       ctx.setTransform(1,0,0,1,0,0);
       ctx.globalAlpha*=c.opacity;ctx.drawImage(layer,0,0);
      }finally{livePixels-=pixels;}
     }
    }finally{ctx.restore();}
    continue;
   }
   if(c.op==='popClip'){if(!depth)throw Error('Unbalanced paint clips');ctx.restore();depth--;continue;}
   if(!['fill','pushClip','gradient','ring','radial','shadow'].includes(c.op))throw Error('Unsupported paint command');
   const r=c.rect;if(!r||!['x','y','width','height'].every(k=>finite(r[k]))||r.width<0||r.height<0||!finite(c.radius)||c.radius<0||c.radius>Math.min(r.width,r.height)/2)throw Error('Invalid paint command geometry');
   if(c.op==='pushClip'){ctx.save();depth++;path(ctx,r,c.radius);ctx.clip();}
   else if(c.op==='gradient'){
    const g=c.gradient;
    if(!g||![g.x0,g.y0,g.x1,g.y1].every(finite)||!Array.isArray(g.stops)||g.stops.length<2||g.stops.length>64)throw Error('Invalid gradient command');
    const brush=ctx.createLinearGradient(g.x0,g.y0,g.x1,g.y1);
    let last=-1;for(const s of g.stops){if(!finite(s.offset)||s.offset<0||s.offset>1||s.offset<last)throw Error('Invalid gradient offset');brush.addColorStop(s.offset,color(s.color));last=s.offset;}
    path(ctx,r,c.radius);ctx.fillStyle=brush;ctx.fill();
   }else if(c.op==='radial'){
    const g=c.gradient;
    if(!g||![g.cx,g.cy,g.rx,g.ry].every(finite)||g.rx<=0||g.ry<=0||!Array.isArray(g.stops)||g.stops.length<2||g.stops.length>64)throw Error('Invalid radial command');
    ctx.save();
    try{
     // Canvas paths retain their construction-space coordinates; the
     // gradient is painted in the scaled unit-circle coordinate system.
     path(ctx,r,c.radius);ctx.translate(g.cx,g.cy);ctx.scale(g.rx,g.ry);
     const brush=ctx.createRadialGradient(0,0,0,0,0,1);
     let last=-1;for(const s of g.stops){if(!finite(s.offset)||s.offset<0||s.offset>1||s.offset<last)throw Error('Invalid gradient offset');brush.addColorStop(s.offset,color(s.color));last=s.offset;}
     ctx.fillStyle=brush;ctx.fill();
    }finally{ctx.restore();}
   }else if(c.op==='shadow'){
    const s=c.shadow,b=s?.caster;
    if(!s||!b||![s.dx,s.dy,s.blur,s.spread,s.casterRadius,b.x,b.y,b.width,b.height].every(finite)||s.blur<0||s.blur>512||Math.abs(s.dx)>512||Math.abs(s.dy)>512||Math.abs(s.spread)>512||b.width<=0||b.height<=0||s.casterRadius<0||s.casterRadius>Math.min(b.width,b.height)/2)throw Error('Invalid shadow command');
    // Clip out the original border box, even for a transparent background.
    // The opaque caster is displaced outside the clip; only its shadow is
    // visible. Zero blur is the exact translated mask.
    const pad=4*s.blur+Math.abs(s.dx)+Math.abs(s.dy)+Math.abs(s.spread)+4;
    const clip={x:Math.min(r.x,b.x+s.dx)-pad,y:Math.min(r.y,b.y+s.dy)-pad,width:Math.max(r.x+r.width,b.x+b.width+s.dx)-Math.min(r.x,b.x+s.dx)+2*pad,height:Math.max(r.y+r.height,b.y+b.height+s.dy)-Math.min(r.y,b.y+s.dy)+2*pad};
    ctx.save();
    try{
     path(ctx,clip,0);path(ctx,r,c.radius,true);ctx.clip('evenodd');
     if(s.blur===0){path(ctx,{...b,x:b.x+s.dx,y:b.y+s.dy},s.casterRadius);ctx.fillStyle=color(s.color);ctx.fill();}
     else{
      const shift=clip.x-b.x-b.width-4*s.blur-4;
      ctx.shadowColor=color(s.color);ctx.shadowBlur=s.blur;ctx.shadowOffsetX=s.dx-shift;ctx.shadowOffsetY=s.dy;
      path(ctx,{...b,x:b.x+shift},s.casterRadius);ctx.fillStyle='#000';ctx.fill();
     }
    }finally{ctx.restore();}
   }else if(c.op==='ring'){
    const i=c.inner;
    if(!i||!['x','y','width','height'].every(k=>finite(i[k]))||i.width<0||i.height<0||!finite(c.innerRadius)||c.innerRadius<0||c.innerRadius>Math.min(i.width,i.height)/2||i.x<r.x||i.y<r.y||i.x+i.width>r.x+r.width+1e-6||i.y+i.height>r.y+r.height+1e-6)throw Error('Invalid border ring');
    path(ctx,r,c.radius);if(i.width&&i.height)path(ctx,i,c.innerRadius,true);
    ctx.fillStyle=color(c.color);ctx.fill('evenodd');
   }else{const fill=color(c.color);path(ctx,r,c.radius);ctx.fillStyle=fill;ctx.fill();}
  }
  if(depth)throw Error('Unbalanced paint clips');
 }finally{while(depth>0){ctx.restore();depth--;}ctx.restore();}
 }
 run(ctx,list.commands,0);
}
