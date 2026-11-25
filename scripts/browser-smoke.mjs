import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const browser=await chromium.launch({headless:true});
try{
  for(const id of ['ashen-bell-vow','curio-box']){
    const root=path.resolve('.work',id,'www');
    const server=http.createServer((req,res)=>{
      try{const url=new URL(req.url,'http://localhost');const rel=decodeURIComponent(url.pathname).replace(/^\/+/,'')||'index.html';const f=path.resolve(root,rel);
        if(!f.startsWith(root+path.sep)||!fs.statSync(f).isFile())throw Error('not found');
        res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));
      }catch{res.statusCode=404;res.end('not found');}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+server.address().port;
    const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400 && !r.url().endsWith('/favicon.ico'))errors.push(r.status()+' '+r.url());});
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
      errors.push('External request: '+url);return route.abort();
    });
    try{
      await page.goto(origin+'/',{waitUntil:'load'});
      if(id==='ashen-bell-vow'){
        await page.waitForFunction(()=>window.__ABV_BOOTED__===true,{},{timeout:30000});
        assert.equal(await page.locator('#btn-start').isEnabled(),true);
      }else{
        await page.waitForFunction(()=>Boolean(window.CB?.game?.map),{},{timeout:30000});
        await page.locator('#btnSkipIntro').click({timeout:15000}).catch(()=>{});
        await page.locator('#btnTitleStart').click({timeout:15000});
        await page.waitForFunction(()=>window.CB.game.run.phase==='playing'&&!window.CB.game.titleOpen);
        await page.evaluate(()=>window.dispatchEvent(new CustomEvent('h5publisher:pause')));
        await page.waitForFunction(()=>window.CB.game.paused===true);
        await page.evaluate(()=>window.dispatchEvent(new CustomEvent('h5publisher:resume')));
        assert.equal(await page.evaluate(()=>window.CB.game.paused),true);
      }
      await page.waitForTimeout(700);
      assert.deepEqual(errors,[],id+' browser errors');
      console.log(id+': boot with local assets only OK');
    }finally{await context.close();await new Promise(r=>server.close(r));}
  }
}finally{await browser.close();}
