import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {compileStyles,sourceStyles} from '../layout/source-style.mjs';
import {length} from '../layout/box-model.mjs';
import {mapFractionGridTemplate} from '../runtime/float-pigment-source-style.mjs';
import {within} from '../../../scripts/source-integrity.mjs';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};

export async function evaluateFrozenSaveSlotsGrid({source,backend,evidenceDir}){
  const css=fs.readFileSync(path.join(source,'styles.css'),'utf8'),rules=compileStyles(css);
  let server,browser;
  const report={selector:'#save-slots-grid',scenarios:[],geometryGatePx:1};
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
      const scenario={name,errors:[]};report.scenarios.push(scenario);
      page.on('pageerror',e=>scenario.errors.push(String(e)));
      await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      try{
        await page.goto(origin+'/',{waitUntil:'load',timeout:30000});
        await page.waitForFunction(()=>window.__ABV_BOOTED__===true,{},{timeout:45000});
        await page.locator('#btn-title-slots').waitFor({state:'visible',timeout:45000});
        await page.waitForFunction(()=>{const e=document.querySelector('.title-menu-list');return e&&getComputedStyle(e).opacity==='1'&&new DOMMatrix(getComputedStyle(e).transform).isIdentity;},{},{timeout:20000});
        await page.locator('#btn-title-slots').click();
        await page.waitForFunction(()=>{const g=document.querySelector('#save-slots-grid');if(!g||g.children.length!==3)return false;const b=g.getBoundingClientRect();return b.width>0&&[...g.children].every(x=>x.getBoundingClientRect().width>0);},{},{timeout:10000});
        const ref=await page.locator('#save-slots-grid').evaluate(g=>{
          const b=g.getBoundingClientRect(),cs=getComputedStyle(g);
          return {
            parent:{width:b.width,height:b.height,columnGap:cs.columnGap,rowGap:cs.rowGap,computedTemplate:cs.gridTemplateColumns},
            children:[...g.children].map((el,i)=>{const r=el.getBoundingClientRect();return {index:i,x:r.left-b.left,width:r.width};})
          };
        });
        const html=await page.content(),env={...profile.viewport,pointer:name==='mobile-landscape'?'coarse':'fine'};
        const authored=sourceStyles(rules,html,'#save-slots-grid',env).parent;
        assert.equal(authored.values.display,'grid','Source save slots are not Grid');
        assert.equal(authored.unsupported.length,0,'Unsupported source Grid cascade: '+JSON.stringify(authored.unsupported.slice(0,3)));
        const template=authored.values['grid-template-columns'],columnGap=length(authored.values['column-gap']??'0',ref.parent.width,env),rowGap=length(authored.values['row-gap']??'0',ref.parent.width,env);
        const tracks=mapFractionGridTemplate(template);
        assert.equal(tracks.length,ref.children.length,'Grid track count differs from dynamic save slots');
        const root=backend.createNode(),children=ref.children.map(()=>backend.createNode());
        try{
          backend.setDisplay(root,'grid');backend.setWidth(root,ref.parent.width);backend.setGap(root,{column:columnGap,row:rowGap});backend.setGridTemplateColumns(root,tracks);
          for(const child of children){backend.setHeight(child,20);backend.appendChild(root,child);}
          backend.calculate(root,{width:ref.parent.width,height:Math.max(100,ref.parent.height),maxWidth:profile.viewport.width,maxHeight:profile.viewport.height});
          const actual=children.map((h,index)=>({index,...backend.rect(h)}));
          scenario.authored={template,columnGap,rowGap};scenario.reference=ref;scenario.actual=actual;
          scenario.deltas=actual.map((a,i)=>({index:i,x:Math.abs(a.x-ref.children[i].x),width:Math.abs(a.width-ref.children[i].width)}));
          scenario.maxDelta=Math.max(...scenario.deltas.flatMap(d=>[d.x,d.width]));
          scenario.pass=scenario.maxDelta<=report.geometryGatePx&&!scenario.errors.length;
          assert.ok(scenario.pass,'float-pigment save-slot Grid delta '+scenario.maxDelta+'px exceeds '+report.geometryGatePx+'px');
        }finally{
          for(const child of children)backend.freeNode(child);backend.freeNode(root);
        }
        if(evidenceDir)await page.locator('#title-slots-drawer').screenshot({path:path.join(evidenceDir,name+'-save-slots-original.png')});
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
