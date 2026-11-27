import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalStorageFacade} from '../platforms/wechat/runtime/local-storage-facade.mjs';
import {createLocationBridge} from '../platforms/wechat/runtime/location-bridge.mjs';

test('localStorage facade preserves browser string/null shape and surfaces native write failures',()=>{
  const m=new Map(),adapter={get:k=>m.has(k)?m.get(k):null,set(k,v){m.set(k,v);return true;},remove(k){m.delete(k);return true;}};
  const s=createLocalStorageFacade(adapter);
  assert.equal(s.getItem('x'),null);assert.equal(s.setItem('x',42),undefined);assert.equal(s.getItem('x'),'42');
  assert.equal(s.removeItem('x'),undefined);assert.equal(s.getItem('x'),null);
  assert.throws(()=>createLocalStorageFacade({...adapter,set:()=>false}).setItem('x','y'),/write failed/);
  assert.throws(()=>createLocalStorageFacade({...adapter,remove:()=>false}).removeItem('x'),/remove failed/);
});

test('Mini Game location supports frozen read semantics but fails closed on browser navigation',()=>{
  const l=createLocationBridge();
  assert.equal(l.protocol,'wechatgame:');assert.equal(l.hostname,'');assert.equal(l.search,'');assert.equal(l.pathname,'/');
  assert.equal(String(l),'wechatgame:///');assert.equal(l.href,'wechatgame:///');
  assert.throws(()=>{l.href='./editor.html';},/navigation unavailable/);
  assert.throws(()=>l.assign('./x'),/navigation unavailable/);
  assert.throws(()=>l.replace('./x'),/navigation unavailable/);
  assert.throws(()=>l.reload(),/reload unavailable/);
});
