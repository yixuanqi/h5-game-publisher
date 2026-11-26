// Isolated diagnostic, no account APIs or game code.
const canvas=wx.createCanvas(),ctx=canvas.getContext('2d');
let taps=0;
function paint(){
  ctx.fillStyle=taps?'#286b47':'#16324f';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#f4c95d';ctx.fillRect(canvas.width*.25,canvas.height*.25,canvas.width*.5,canvas.height*.5);
}
function storageProbe(){
  const key='publisher-official-051c-fixture';
  try{wx.setStorageSync(key,'051c');const read=wx.getStorageSync(key);wx.removeStorageSync(key);const after=wx.getStorageSync(key);return {immediate:read==='051c',removed:after===''||after===undefined||after===null};}
  catch(e){return {error:String(e),immediate:false,removed:false};}
}
function fileProbe(p){
  try{const a=new Uint8Array(wx.getFileSystemManager().readFileSync(p));return {ok:a.length===8&&a[0]===49&&a[7]===56,bytes:a.length};}
  catch(e){return {ok:false,error:String(e)};}
}
GameGlobal.__publisherOfficial051c={marker:'PUBLISHER_OFFICIAL_READY_051C',taps:0,storage:storageProbe(),files:{bin:fileProbe('sample.bin'),pcm:fileProbe('sample.pcm')}};
paint();
wx.onTouchStart(()=>{taps++;GameGlobal.__publisherOfficial051c.taps=taps;paint();console.log('PUBLISHER_OFFICIAL_TOUCHED_051C');});
console.log('PUBLISHER_OFFICIAL_READY_051C');
