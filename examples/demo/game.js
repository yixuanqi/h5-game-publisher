const score=document.querySelector('#score'),state=document.querySelector('#state');let paused=false;let n=Number(localStorage.getItem('demo-score')||0);score.textContent=n;
function pause(){paused=true;state.textContent='Paused';}
window.addEventListener('h5publisher:pause',pause);window.addEventListener('h5publisher:back',pause);
window.addEventListener('h5publisher:resume',()=>{state.textContent='Tap Resume to continue';});
document.querySelector('#resume').onclick=()=>{paused=false;state.textContent='Ready';};
document.querySelector('#tap').onclick=()=>{if(!paused){score.textContent=++n;localStorage.setItem('demo-score',String(n));}};
