import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createCanvas} from '@napi-rs/canvas';
import {compilePaint,textColumnSource} from '../layout/source-paint.mjs';
import {length} from '../layout/box-model.mjs';
import {makeDiagnosticFonts} from '../layout/diagnostic-fonts.mjs';
import {measureTextLeaf,boxEdges} from '../runtime/text-intrinsic.mjs';
import {mapFlexParent} from '../runtime/float-pigment-source-style.mjs';
import {within} from '../../../scripts/source-integrity.mjs';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};

function cssLength(value,base,env){
  if(value===undefined||value===null||value===''||value==='normal')return 0;
  return length(value,base,env);
}
function edgeTotal(e){return e.left+e.right+e.top+e.bottom;}
function visibleChildren(node){return (node.children??[]).filter(c=>c.style?.display!=='none');}
function buildIntrinsicFlex({backend,ctx,resolveFamily,tree,contentWidth,env}){
  const owned=[];
  function build(node,{root=false}={}){
    if(node.style?.display==='none')return null;
    const handle=backend.createNode();owned.push(handle);
    const children=visibleChildren(node),record={key:node.key,handle,children:[],measure:null};
    if(children.length){
      const mapped=mapFlexParent(node.style),edges=boxEdges(node.style,contentWidth,env);
      if(!root&&edgeTotal(edges)>0.001)throw Error('Nested flex padding/border needs ABI support: '+node.key);
      backend.setDisplay(handle,mapped.display);backend.setFlexDirection(handle,mapped.direction);backend.setJustifyContent(handle,mapped.justify);backend.setAlignItems(handle,mapped.align);
      backend.setGap(handle,{column:cssLength(node.style['column-gap'],contentWidth,env),row:cssLength(node.style['row-gap'],contentWidth,env)});
      if(root)backend.setWidth(handle,contentWidth);
      for(const child of children){const built=build(child);if(built){record.children.push(built);backend.appendChild(handle,built.handle);}}
      if(!record.children.length)throw Error('Empty visible flex container '+node.key);
    }else{
      const measured=measureTextLeaf(ctx,node,contentWidth,env,{resolveFamily});
      if(!measured)throw Error('Unexpected hidden intrinsic leaf '+node.key);
      record.measure={width:measured.width,height:measured.height,text:measured.text,metrics:measured.metrics};
      backend.setWidth(handle,measured.width);backend.setHeight(handle,measured.height);
    }
    return record;
  }
  const root=build(tree,{root:true});
  backend.calculate(root.handle,{width:contentWidth,height:env.height,maxWidth:contentWidth,maxHeight:env.height});
  const rootRect=backend.rect(root.handle);
  function flatten(record,ox=0,oy=0){
    const r=backend.rect(record.handle),x=ox+r.x,y=oy+r.y;
    const row={key:record.key,x,y,width:r.width,height:r.height,text:record.measure?.text??null,measured:record.measure};
    return [row,...record.children.flatMap(c=>flatten(c,x,y))];
  }
  return {rootRect,rows:root.children.flatMap(c=>flatten(c)),free(){for(const h of owned.reverse())backend.freeNode(h);}};
}

export async function evaluateFrozenFlexParents({source,backend,evidenceDir}){
  const css=fs.readFileSync(path.join(source,'styles.css'),'utf8'),paint=compilePaint(css),fonts=makeDiagnosticFonts(),measureCtx=createCanvas(1,1).getContext('2d');
  let server,browser;
  const report={selectors:['.title-topbar','.title-slots-head'],scenarios:[],geometryGatePx:1,intrinsicGeometryGatePx:4,fontChoices:fonts.evidence,glyphProbe:fonts.checkHan()};
  try{
    server=http.createServer((req,res)=>{
      try{
        const u=new URL(req.url,'http://127.0.0.1'),p=path.resolve(source,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
        if(!within(source,p)||!fs.statSync(p).isFile()){res.writeHead(404).end();return;}
        res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(p).pipe(res);
      }catch{res.writeHead(404).end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({headless:true});
    for(const profile of [
      {name:'desktop',viewport:{width:1280,height:720},deviceScaleFactor:1},
      {name:'mobile-landscape',viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true}
    ]){
      const {name,...options}=profile,ctx=await browser.newContext({...options,serviceWorkers:'block'}),page=await ctx.newPage();
      const scenario={name,parents:[],errors:[]};report.scenarios.push(scenario);
      page.on('pageerror',e=>scenario.errors.push(String(e)));
      await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      try{
        await page.goto(origin+'/',{waitUntil:'load',timeout:30000});
        await page.waitForFunction(()=>window.__ABV_BOOTED__===true,{},{timeout:45000});
        await page.locator('#btn-title-slots').waitFor({state:'visible',timeout:45000});
        await page.waitForFunction(()=>{const e=document.querySelector('.title-menu-list');return e&&getComputedStyle(e).opacity==='1'&&new DOMMatrix(getComputedStyle(e).transform).isIdentity;},{},{timeout:20000});
        const env={...profile.viewport,pointer:name==='mobile-landscape'?'coarse':'fine'};
        const check=async(label,selector)=>{
          const item={label,selector};scenario.parents.push(item);
          const ref=await page.locator(selector).evaluate(p=>{
            const r=p.getBoundingClientRect(),cs=getComputedStyle(p),n=x=>Number.parseFloat(x)||0;
            const children=[...p.children].filter(e=>getComputedStyle(e).display!=='none').map((e,index)=>{
              const b=e.getBoundingClientRect();return {index,x:b.left-r.left,y:b.top-r.top,width:b.width,height:b.height};
            });
            function visit(e,key){
              if(getComputedStyle(e).display==='none')return [];
              const b=e.getBoundingClientRect();
              return [{key,x:b.left-r.left,y:b.top-r.top,width:b.width,height:b.height,text:e.children.length?'':e.textContent.trim()},...[...e.children].flatMap((c,i)=>visit(c,key+'/'+i))];
            }
            const descendants=[...p.children].flatMap((c,i)=>visit(c,'root/'+i));
            return {parent:{width:r.width,height:r.height,paddingLeft:n(cs.paddingLeft),paddingRight:n(cs.paddingRight),paddingTop:n(cs.paddingTop),paddingBottom:n(cs.paddingBottom),borderLeft:n(cs.borderLeftWidth),borderRight:n(cs.borderRightWidth),borderTop:n(cs.borderTopWidth),borderBottom:n(cs.borderBottomWidth),display:cs.display,flexDirection:cs.flexDirection,justifyContent:cs.justifyContent,alignItems:cs.alignItems,flexWrap:cs.flexWrap,columnGap:n(cs.columnGap),rowGap:n(cs.rowGap)},children,descendants};
          });
          const html=await page.content(),tree=textColumnSource(paint,html,selector,env,{tree:true}),mapped=mapFlexParent(tree.style);
          const base=ref.parent.width;
          const edges={
            left:cssLength(tree.style['padding-left'],base,env)+cssLength(tree.style['border-left-width'],base,env),
            right:cssLength(tree.style['padding-right'],base,env)+cssLength(tree.style['border-right-width'],base,env),
            top:cssLength(tree.style['padding-top'],base,env)+cssLength(tree.style['border-top-width'],base,env),
            bottom:cssLength(tree.style['padding-bottom'],base,env)+cssLength(tree.style['border-bottom-width'],base,env)
          };
          const contentWidth=ref.parent.width-edges.left-edges.right,contentHeight=ref.parent.height-edges.top-edges.bottom;
          assert.ok(contentWidth>=0&&contentHeight>=0,'Invalid source-driven flex content box');
          const columnGap=cssLength(tree.style['column-gap'],contentWidth,env),rowGap=cssLength(tree.style['row-gap'],contentWidth,env);
          const root=backend.createNode(),children=ref.children.map(()=>backend.createNode());
          try{
            backend.setDisplay(root,mapped.display);backend.setWidth(root,contentWidth);backend.setHeight(root,contentHeight);
            backend.setFlexDirection(root,mapped.direction);backend.setJustifyContent(root,mapped.justify);backend.setAlignItems(root,mapped.align);backend.setGap(root,{column:columnGap,row:rowGap});
            ref.children.forEach((c,i)=>{backend.setWidth(children[i],c.width);backend.setHeight(children[i],c.height);backend.appendChild(root,children[i]);});
            backend.calculate(root,{width:contentWidth,height:contentHeight,maxWidth:contentWidth,maxHeight:contentHeight});
            const actual=children.map((h,index)=>({index,...backend.rect(h)}));
            const reference=ref.children.map(c=>({...c,x:c.x-edges.left,y:c.y-edges.top}));
            item.authored={mapped,edges,columnGap,rowGap};item.browserParent=ref.parent;item.reference=reference;item.actual=actual;
            item.deltas=actual.map((a,i)=>({index:i,x:Math.abs(a.x-reference[i].x),y:Math.abs(a.y-reference[i].y),width:Math.abs(a.width-reference[i].width),height:Math.abs(a.height-reference[i].height)}));
            item.maxDelta=Math.max(0,...item.deltas.flatMap(d=>[d.x,d.y,d.width,d.height]));item.pass=item.maxDelta<=report.geometryGatePx;
            if(!item.pass)item.failure=selector+' float-pigment flex delta '+item.maxDelta+'px exceeds '+report.geometryGatePx+'px';
          }finally{
            for(const child of children)backend.freeNode(child);backend.freeNode(root);
          }
          const intrinsic=buildIntrinsicFlex({backend,ctx:measureCtx,resolveFamily:fonts.resolveFamily,tree,contentWidth,env});
          try{
            const reference=ref.descendants.map(c=>({...c,x:c.x-edges.left,y:c.y-edges.top}));
            assert.deepEqual(intrinsic.rows.map(x=>x.key),reference.map(x=>x.key),'Intrinsic tree keys must match visible browser descendants');
            const deltas=intrinsic.rows.map((a,i)=>({key:a.key,x:Math.abs(a.x-reference[i].x),y:Math.abs(a.y-reference[i].y),width:Math.abs(a.width-reference[i].width),height:Math.abs(a.height-reference[i].height)}));
            const rootHeightDelta=Math.abs(intrinsic.rootRect.height-contentHeight);
            const maxDelta=Math.max(rootHeightDelta,...deltas.flatMap(d=>[d.x,d.y,d.width,d.height]));
            item.intrinsic={reference,actual:intrinsic.rows.map(({measured,...x})=>x),deltas,rootContentHeight:{reference:contentHeight,actual:intrinsic.rootRect.height,delta:rootHeightDelta},maxDelta,pass:maxDelta<=report.intrinsicGeometryGatePx};
            if(!item.intrinsic.pass)item.intrinsic.failure=selector+' independent intrinsic flex delta '+maxDelta+'px exceeds '+report.intrinsicGeometryGatePx+'px';
          }finally{intrinsic.free();}
          if(evidenceDir)await page.locator(selector).screenshot({path:path.join(evidenceDir,name+'-'+label+'-original.png')});
        };
        await check('title-topbar','.title-topbar');
        await page.locator('#btn-title-slots').click();
        await page.locator('.title-slots-head').waitFor({state:'visible',timeout:10000});
        await check('title-slots-head','.title-slots-head');
        scenario.pass=scenario.parents.every(x=>x.pass&&x.intrinsic?.pass)&&!scenario.errors.length;
      }catch(e){scenario.error=String(e.stack||e);scenario.pass=false;throw e;}
      finally{await ctx.close();}
    }
    report.pass=report.scenarios.every(s=>s.pass);
    return report;
  }finally{
    if(browser)await browser.close();
    if(server)await new Promise(resolve=>server.close(resolve));
  }
}
