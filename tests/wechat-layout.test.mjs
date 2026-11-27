import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFractionTracks,gridTracks,columnTracks,locateTrack} from '../platforms/wechat/layout/tracks.mjs';
test('original authored fractional grid forms',()=>{
  assert.deepEqual(parseFractionTracks('repeat(3, minmax(0, 1fr))'),[{min:0,fr:1},{min:0,fr:1},{min:0,fr:1}]);
  assert.deepEqual(parseFractionTracks('minmax(0, 1.06fr) minmax(0, 0.94fr)'),[{min:0,fr:1.06},{min:0,fr:.94}]);
  assert.deepEqual(parseFractionTracks('1fr'),[{min:0,fr:1}]);
  assert.throws(()=>parseFractionTracks('minmax(auto, 1fr)'),/Unsupported/);
  assert.throws(()=>parseFractionTracks('100px 1fr'),/Unsupported/);
});
test('fractional grid independently computes edges and hit targets',()=>{
  const a=gridTracks(320,10,'repeat(3, minmax(0, 1fr))');
  assert.deepEqual(a,[{x:0,width:100},{x:110,width:100},{x:220,width:100}]);
  assert.equal(locateTrack(a,100),-1);assert.equal(locateTrack(a,170),1);
  assert.throws(()=>gridTracks(10,20,'1fr 1fr'),/exceed/);
});
test('flex column horizontal sizing and explicit unsupported cases',()=>{
  const c={width:'100%',marginLeft:0,marginRight:0,horizontalExtras:16};
  assert.deepEqual(columnTracks(200,[{...c,boxSizing:'border-box'},{...c,boxSizing:'content-box'}]),[{x:0,width:200},{x:0,width:216}]);
  assert.throws(()=>columnTracks(200,[{...c,width:'auto'}]),/Unsupported/);
});

test('mobile title fixed minimum redistributes fractional tracks',()=>{
  const css='minmax(0px, 1.06fr) minmax(220px, 0.94fr)';
  assert.deepEqual(gridTracks(420,20,css),[{x:0,width:180},{x:200,width:220}]);
  assert.deepEqual(gridTracks(620,20,css),[{x:0,width:318},{x:338,width:282}]);
  assert.deepEqual(gridTracks(120,20,css),[{x:0,width:0},{x:20,width:220}]);
  assert.deepEqual(gridTracks(100,0,'0.25fr 0.25fr'),[{x:0,width:25},{x:25,width:25}]);
});
