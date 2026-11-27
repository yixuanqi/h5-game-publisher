import test from 'node:test';
import assert from 'node:assert/strict';
import {createIsolatedWindow} from '../platforms/wechat/runtime/isolated-window.mjs';
import {createLocationBridge} from '../platforms/wechat/runtime/location-bridge.mjs';
test('read-only native location rejects direct writes; isolated window retains browser bridge and DOM events',()=>{
 const nativeLocation=Object.freeze({href:'https://native-host.invalid/'});
 const native={};Object.defineProperty(native,'location',{value:nativeLocation,configurable:false,writable:false});
 const document={},calls=[];class Event{constructor(type){this.type=type;}}
 const raw=new Proxy(native,{get(t,k){if(k==='document')return document;if(k==='Event')return Event;if(k==='dispatchEvent')return e=>calls.push(e.type);return Reflect.get(t,k);},set(t,k,v){return Reflect.set(t,k,v);}});
 const location=createLocationBridge();
 assert.throws(()=>Object.defineProperty(raw,'location',{value:location,configurable:true,writable:false}),TypeError);
 const win=createIsolatedWindow(raw);
 Object.defineProperty(win,'location',{value:location,configurable:true,writable:false});
 Object.defineProperty(win,'innerWidth',{get:()=>844,configurable:true});
 win.__ABV_BOOTED__=true;win.dispatchEvent(new win.Event('resize'));
 assert.equal(win.location,location);assert.equal(win.location.protocol,'wechatgame:');assert.equal(native.location,nativeLocation);
 assert.equal(win.document,document);assert.equal(win.window,win);assert.equal(win.self,win);assert.equal(win.innerWidth,844);
 assert.equal('__ABV_BOOTED__' in native,false);assert.equal('innerWidth' in native,false);assert.deepEqual(calls,['resize']);
});
