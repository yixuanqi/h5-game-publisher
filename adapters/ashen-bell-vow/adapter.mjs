import {replaceOnce} from '../common/patch.mjs';
export function adapt(s){
    s=replaceOnce(s,"if ('serviceWorker' in navigator && !window.__ABV_OFFLINE_WORLD__) {","if ('serviceWorker' in navigator && !window.__ABV_OFFLINE_WORLD__ && !window.H5Publisher?.isNative()) {");
    const anchor="const _recoverAudioOnGesture = () => {";
    return replaceOnce(s,anchor,[
      "window.addEventListener('h5publisher:pause', () => {",
      "  if (G.gameState === 'playing') openPauseModal();",
      "  if (G.saveDirtyTimer > 0 && G.worldState) saveProgress(false);",
      "  audio.setBackgroundDuck(true);",
      "});",
      "window.addEventListener('h5publisher:resume', () => { audio.setBackgroundDuck(false); audio.keepAliveResume(false); });",
      "window.addEventListener('h5publisher:back', () => { if (G.gameState === 'playing') openPauseModal(); });",
      anchor].join('\n'));
}
