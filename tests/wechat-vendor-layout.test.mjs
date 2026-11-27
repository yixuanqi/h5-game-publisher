import test from 'node:test';
import assert from 'node:assert/strict';
import {mapMenu} from '../platforms/wechat/vendor-eval/layout-mapping.mjs';
test('map source data without child coordinates or invented content; report unsupported CSS',()=>{
  const style={width:'100%','text-align':'left','font-size':'14px','padding-top':'8px','padding-bottom':'8px','letter-spacing':'2px',background:'linear-gradient(90deg, red 0%, blue 100%)'};
  const r=mapMenu({parent:{'row-gap':'4px'},children:[{key:'a',text:'A & 中文',style,before:{content:"'◇'"}},{key:'b',text:'B',style}]},300,{width:800,height:400});
  assert.match(r.template,/A &amp; 中文/);assert.equal(r.style.item0.marginBottom,4);assert.equal(r.style.item1.marginBottom,0);
  assert.equal(r.style.item0.height,undefined);assert.equal(r.style.item0.left,undefined);assert.equal(r.omissions.length,5);
});
