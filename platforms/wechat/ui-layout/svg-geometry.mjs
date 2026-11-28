// Bounded authored SVG object bounds, independent of Chromium DOM geometry.
// Geometry bounds exclude stroke/filter, matching SVG getBoundingClientRect.
// Only absolute M/L/H/V/Q/A/Z and untransformed primitive shapes are supported.
export const SVG_NS='http://www.w3.org/2000/svg';
const zero=()=>({x:0,y:0,width:0,height:0});
const num=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const number=s=>{if(!num.test(String(s)))throw Error('Unsupported SVG number '+s);const v=Number(s);if(!Number.isFinite(v)||Math.abs(v)>1e6)throw Error('Invalid SVG number');return v;};
const tau=2*Math.PI,mod=x=>((x%tau)+tau)%tau;
export function pathBounds(d){
 if(typeof d!=='string'||d.length>16384)throw Error('Invalid SVG path');
 const tokens=d.match(/[A-Za-z]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g)??[];
 // Tokenizer must consume all non-separator input.
 if(d.replace(/[A-Za-z]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[\s,]/g,''))throw Error('Unsupported SVG path token');
 let i=0,x=0,y=0,sx=0,sy=0,cmd='',started=false,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 const add=(a,b)=>{minX=Math.min(minX,a);maxX=Math.max(maxX,a);minY=Math.min(minY,b);maxY=Math.max(maxY,b);};
 const read=()=>number(tokens[i++]);
 const line=(nx,ny)=>{add(x,y);add(nx,ny);x=nx;y=ny;};
 while(i<tokens.length){
  if(/^[A-Za-z]$/.test(tokens[i]))cmd=tokens[i++];
  if(!started&&cmd!=='M')throw Error('SVG path must start with M');
  if(cmd==='M'){x=read();y=read();sx=x;sy=y;started=true;cmd='L';continue;}
  if(cmd==='L'){line(read(),read());continue;}
  if(cmd==='H'){line(read(),y);continue;}
  if(cmd==='V'){line(x,read());continue;}
  if(cmd==='Z'){line(sx,sy);cmd='';continue;}
  if(cmd==='Q'){
   const cx=read(),cy=read(),nx=read(),ny=read();
   add(x,y);add(nx,ny);
   const point=t=>{const u=1-t;add(u*u*x+2*u*t*cx+t*t*nx,u*u*y+2*u*t*cy+t*t*ny);};
   for(const [a,b,c] of [[x,cx,nx],[y,cy,ny]]){const den=a-2*b+c;if(den!==0){const t=(a-b)/den;if(t>0&&t<1)point(t);}}
   x=nx;y=ny;continue;
  }
  if(cmd==='A'){
   let rx=Math.abs(read()),ry=Math.abs(read());const phi=read()*Math.PI/180,large=read(),sweep=read(),nx=read(),ny=read();
   if(![0,1].includes(large)||![0,1].includes(sweep))throw Error('Invalid SVG arc flag');
   if(x===nx&&y===ny)continue;
   if(rx===0||ry===0){line(nx,ny);continue;}
   const cp=Math.cos(phi),sp=Math.sin(phi),dx=(x-nx)/2,dy=(y-ny)/2;
   const xp=cp*dx+sp*dy,yp=-sp*dx+cp*dy;
   const scale=Math.sqrt(xp*xp/(rx*rx)+yp*yp/(ry*ry));if(scale>1){rx*=scale;ry*=scale;}
   const a=rx*rx*yp*yp,b=ry*ry*xp*xp;
   const f=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(rx*rx*ry*ry-a-b)/(a+b)));
   const cxp=f*rx*yp/ry,cyp=-f*ry*xp/rx;
   const cx=cp*cxp-sp*cyp+(x+nx)/2,cy=sp*cxp+cp*cyp+(y+ny)/2;
   const start=Math.atan2((yp-cyp)/ry,(xp-cxp)/rx),end=Math.atan2((-yp-cyp)/ry,(-xp-cxp)/rx);
   const extent=sweep?mod(end-start):mod(start-end);
   const point=t=>add(cx+rx*cp*Math.cos(t)-ry*sp*Math.sin(t),cy+rx*sp*Math.cos(t)+ry*cp*Math.sin(t));
   add(x,y);add(nx,ny);
   const tx=Math.atan2(-ry*sp,rx*cp),ty=Math.atan2(ry*cp,rx*sp);
   for(const t of [tx,tx+Math.PI,ty,ty+Math.PI])if((sweep?mod(t-start):mod(start-t))<=extent+1e-10)point(t);
   x=nx;y=ny;continue;
  }
  throw Error('Unsupported SVG path command '+cmd);
 }
 return Number.isFinite(minX)?{x:minX,y:minY,width:maxX-minX,height:maxY-minY}:zero();
}
function shape(el){
 const a=(key,def=0)=>number(el.getAttribute(key)??def);
 switch(el.localName.toLowerCase()){
  case 'path':return pathBounds(el.getAttribute('d')??'');
  case 'line':{const x=a('x1'),y=a('y1'),x2=a('x2'),y2=a('y2');return {x:Math.min(x,x2),y:Math.min(y,y2),width:Math.abs(x2-x),height:Math.abs(y2-y)};}
  case 'circle':case 'ellipse':{const rx=a(el.localName==='circle'?'r':'rx'),ry=a(el.localName==='circle'?'r':'ry');if(rx<0||ry<0)throw Error('Invalid SVG radius');return {x:a('cx')-rx,y:a('cy')-ry,width:2*rx,height:2*ry};}
  case 'rect':{const width=a('width'),height=a('height');if(width<0||height<0)throw Error('Invalid SVG rectangle');return {x:a('x'),y:a('y'),width,height};}
  default:throw Error('Unsupported SVG geometry element '+el.localName);
 }
}
export function svgDescendantRects(root,rect){
 if(root.namespaceURI!==SVG_NS||root.localName!=='svg')throw Error('Invalid SVG root');
 const raw=root.getAttribute('viewBox')??root.getAttribute('viewbox');
 const view=raw?.trim().split(/[\s,]+/).map(number);
 if(!view||view.length!==4||view[2]<=0||view[3]<=0)throw Error('Unsupported SVG viewBox');
 const [vx,vy,vw,vh]=view;
 const aspect=(root.getAttribute('preserveAspectRatio')??root.getAttribute('preserveaspectratio')??'xMidYMid meet').trim();
 let sx=rect.width/vw,sy=rect.height/vh,ox=rect.x,oy=rect.y;
 if(aspect==='xMidYMid meet'||aspect==='xMidYMid'){sx=sy=Math.min(sx,sy);ox+=(rect.width-vw*sx)/2;oy+=(rect.height-vh*sy)/2;}
 else if(aspect!=='none')throw Error('Unsupported SVG preserveAspectRatio');
 const result=new Map();
 const visit=(el,definition=false)=>{
  if(el.namespaceURI!==SVG_NS)throw Error('Unsupported foreign SVG content');
  const tag=el.localName.toLowerCase(),hidden=definition||tag==='defs';
  if(hidden){result.set(el,zero());for(const c of el.children??[])visit(c,true);return;}
  if(el.getAttribute('transform')||el.getAttribute('style')||el.getAttribute('display')==='none'||el.children?.length)throw Error('Unsupported SVG transform, style or nested shape '+tag);
  const b=shape(el);result.set(el,{x:ox+(b.x-vx)*sx,y:oy+(b.y-vy)*sy,width:b.width*sx,height:b.height*sy});
 };
 for(const el of root.children??[])visit(el);
 return result;
}
