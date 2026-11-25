import {replaceOnce} from '../common/patch.mjs';
export function adapt(s){
    const anchor="  window.addEventListener('pagehide', handleAppHide);";
    return replaceOnce(s,anchor,[
      "  window.addEventListener('h5publisher:pause', handleAppHide);",
      "  window.addEventListener('h5publisher:resume', handleAppShow);",
      "  window.addEventListener('h5publisher:back', () => {",
      "    if (game.run.phase === 'playing' && !game.titleOpen && !game.introActive && !game.hubOpen && !game.paused) setGamePaused(true);",
      "  });",
      anchor].join('\n'));
}
