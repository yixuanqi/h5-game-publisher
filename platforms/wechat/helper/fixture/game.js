// Independent platform fixture; no product code and no external resources.
const canvas=wx.createCanvas();
const ctx=canvas.getContext('2d');
const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
canvas.width=Math.max(320,info.windowWidth||320);canvas.height=Math.max(180,info.windowHeight||180);
function paint(){
  ctx.fillStyle='#16324f';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#f4c95d';ctx.fillRect(16,16,96,64);
  ctx.fillStyle='#fff';ctx.font='20px sans-serif';ctx.fillText('PUBLISHER HELPER PROBE',18,112);
}
paint();wx.setStorageSync('publisher-helper-probe','v051a');
if(wx.getStorageSync('publisher-helper-probe')!=='v051a')throw Error('Fixture storage mismatch');
wx.removeStorageSync('publisher-helper-probe');
console.log('PUBLISHER_HELPER_FIXTURE_READY_051A');
