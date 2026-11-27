import test from 'node:test';
import assert from 'node:assert/strict';
import {length,splitTop,expandBox,horizontalBox} from '../platforms/wechat/layout/box-model.mjs';
const env={width:844,height:390};
test('nested CSS expressions and shorthand preserve function tokens',()=>{
  assert.deepEqual(splitTop('4px clamp(14px, 3.2%, 32px)'),['4px','clamp(14px, 3.2%, 32px)']);
  assert.equal(length('min(760px, 94%)',790,env),742.6);
  assert.equal(length('clamp(14px, 3.2%, 32px)',844,env),27.008);
  assert.equal(length('100vw',10,env),844);
  assert.throws(()=>length('calc(1px + 2px)',100,env),/Unsupported/);
  assert.deepEqual(expandBox('padding','8px 10px 4px'),[['padding-top','8px'],['padding-right','10px'],['padding-bottom','4px'],['padding-left','10px']]);
  assert.equal(expandBox('border','1px solid rgba(0, 0, 0, .4)')[0][1],'1px');
});
test('box sizing computes content without browser geometry',()=>{
  const s={width:'min(560px, 92vw)','box-sizing':'border-box','padding-left':'14px','padding-right':'14px','border-left-width':'1px','border-right-width':'1px'};
  assert.equal(horizontalBox(s,500,env).contentWidth,530);
  assert.equal(horizontalBox({width:'100%','padding-left':'10px'},200,env).borderWidth,210);
  assert.equal(horizontalBox({width:'auto','padding-left':'10px'},200,env,{autoStretch:true}).contentWidth,190);
  assert.throws(()=>horizontalBox({width:'auto'},200,env),/stretch/);
  assert.equal(horizontalBox({width:'100%','max-width':'160px','box-sizing':'border-box'},200,env).contentWidth,160);
});
