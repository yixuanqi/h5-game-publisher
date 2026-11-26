// Isolated platform probe, not product code. Keep sync semantics as a strict gate.
const canvas=wx.createCanvas();
const ctx=canvas.getContext('2d');
const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
canvas.width=Math.max(320,info.windowWidth||320);canvas.height=Math.max(180,info.windowHeight||180);
function paint(){
  ctx.fillStyle='#16324f';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#f4c95d';ctx.fillRect(16,16,96,64);
  ctx.fillStyle='#fff';ctx.font='20px sans-serif';ctx.fillText('PUBLISHER HELPER PROBE',18,112);
}
paint();
const key='publisher-helper-probe',value='v051a';
let count=0;
function probe(){
  // Retry after startup to distinguish delayed storage initialization from a broken API.
  let immediate=false,removed=false,actual=null,after=null,error=null;
  try{
    wx.setStorageSync(key,value);
    actual=wx.getStorageSync(key);immediate=actual===value;
    wx.removeStorageSync(key);
    after=wx.getStorageSync(key);removed=after===''||after===undefined||after===null;
  }catch(e){error=String(e);}
  const data={attempt:++count,immediate,removed,actualType:typeof actual,actual,afterType:typeof after,after,error};
  console.log('PUBLISHER_HELPER_STORAGE_051A '+JSON.stringify(data));
  console.log('PUBLISHER_HELPER_FIXTURE_READY_051A');
  if(count<5)setTimeout(probe,300);
}
setTimeout(probe,300);
