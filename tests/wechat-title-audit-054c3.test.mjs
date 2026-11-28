import test from 'node:test';
import assert from 'node:assert/strict';
import {collectElementPaths,compareRectangles,elementIdentity} from '../platforms/wechat/ui-layout/title-audit-utils.mjs';
const el=(...children)=>({nodeType:1,children});
test('structural paths cover every element including hidden descendants',()=>{
 const root=el(el(el()),el());
 assert.deepEqual(collectElementPaths(root).map(x=>x.path),['0','0/0','0/0/0','0/1']);
});
test('geometry gate rejects missing, extra, nonfinite or deviating rectangles',()=>{
 const r={x:0,y:0,width:10,height:20};
 assert.equal(compareRectangles({'0':r},{'0':{...r,x:.5}}).pass,true);
 assert.equal(compareRectangles({'0':r},{'0':{...r,x:.51}}).pass,false);
 assert.equal(compareRectangles({'0':r},{}).pass,false);
 assert.equal(compareRectangles({'0':r},{'0':r,'1':r}).pass,false);
 assert.throws(()=>compareRectangles({'0':r},{'0':{...r,x:NaN}}),/Invalid geometry/);
});

test('SVG HTML parser spelling differences normalize without changing node identity',()=>{
 const svg='http://www.w3.org/2000/svg',html='http://www.w3.org/1999/xhtml';
 const row={path:'0/2/0/0/0/0/0/0',namespaceURI:svg,tag:'radialGradient',id:'tcGlow'};
 assert.deepEqual(elementIdentity({...row,tag:'radialgradient'}),elementIdentity(row));
 assert.deepEqual(elementIdentity({...row,tag:'lineargradient'}),elementIdentity({...row,tag:'linearGradient'}));
 assert.notDeepEqual(elementIdentity({...row,namespaceURI:html,tag:'radialgradient'}),elementIdentity(row));
 assert.notDeepEqual(elementIdentity({...row,tag:'RadialGradient'}),elementIdentity(row));
 assert.notDeepEqual(elementIdentity({...row,tag:'lineargradient'}),elementIdentity(row));
 assert.notDeepEqual(elementIdentity({...row,id:'other'}),elementIdentity(row));
 assert.notDeepEqual(elementIdentity({...row,path:'0/1'}),elementIdentity(row));
 assert.notDeepEqual(elementIdentity({...row,tag:'customTag'}),elementIdentity({...row,tag:'customtag'}));
 assert.equal(row.tag,'radialGradient');
 assert.throws(()=>elementIdentity({...row,namespaceURI:null}),/Invalid element identity/);
});
