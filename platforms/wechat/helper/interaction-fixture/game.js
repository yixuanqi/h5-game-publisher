const canvas=wx.createCanvas(),ctx=canvas.getContext('2d');
const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
canvas.width=info.windowWidth;canvas.height=info.windowHeight;
let touched=false;
function paint(){
  ctx.fillStyle=touched?'#286b47':'#16324f';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#f4c95d';ctx.fillRect(canvas.width*.3,canvas.height*.3,canvas.width*.4,canvas.height*.4);
  ctx.fillStyle='#fff';ctx.font='20px sans-serif';ctx.fillText(touched?'CONTROL_TOUCHED':'CONTROL_READY',canvas.width*.34,canvas.height*.52);
}
paint();console.log('HELPER_051B_CONTROL_READY');
wx.onTouchStart(e=>{
  const p=e.changedTouches?.[0]||e.touches?.[0];
  if(!p)return;
  touched=true;paint();console.log('HELPER_051B_CONTROL_TOUCHED');
  // Deliberate diagnostic error in this disposable control, never in game project.
  console.error('HELPER_051B_CONTROL_EXPECTED_ERROR');
});
