import fs from 'node:fs';
import path from 'node:path';
// Generate from pinned upstream, fail if reviewed seams change. No changes to the source checkout.
function between(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0||s.indexOf(a,i+1)!==-1)throw Error('Unreviewed extraction '+a);return s.slice(i,j);}
export function generateSimulation(raw){
  const read=p=>fs.readFileSync(path.join(raw,'src',p),'utf8');
  const main=read('main.js'),progress=read('ui/progressionUi.js');
  const step=between(main,'    const curBoss = getAwakeBoss();',"    prof.addModuleTime('update',");
  let start=between(progress,'export async function startGame() {','export async function startNewGamePlus()');
  // Exact reviewed platform seams; start only for NG1 after load. Save, audio and original DOM UI deferred.
  const edits=[
    ['export async function startGame() {','export function startTestRun() {'],
    ['  if (!G.levelBundle || _worldSwitchBusy) return;\n  _worldSwitchBusy = true;\n  try {\n    if (!G.isEditorPreview) await ensureWorldForCycle(1);\n  } finally {\n    _worldSwitchBusy = false;\n  }','  if (!G.levelBundle || G.loadedWorldVariant !== 1) throw Error("NG1 must be loaded");'],
    ['  hideAllOverlays();',''],
    ['  audio.init();',''],
    ['  syncRoomThemeAndResetAudio(spawnPt.x + 14, spawnPt.y + 27, false);','  updateThemeAndWeather(0);'],
    ['  if (!G.isEditorPreview) saveProgress(false);',''],
    ['  uiHooks.syncHUD(true);','']
  ];
  for(const [a,b] of edits){if(start.split(a).length-1!==1)throw Error('Unreviewed start seam '+a);start=start.replace(a,b);}
  return [
    "import {G,createFreshWorldState,clearOutcomeTimer,markMapExplored,createLanterns,createResonancePuzzles,createCrumblePlatforms,createFoundryCrucibles,getAwakeBoss,getHudBoss} from './raw/src/state.js';",
    "import {ALTARS,RELICS,FLOOR_Y} from './raw/src/config.js';",
    "import {getRoomAt,getPreviewSpawnCoords,getPreviewSpawnRoomId,getRoomSpawnPoint} from './raw/src/levelLoader.js';",
    "import {createPlayer,createSentinels,createBoss,createBoss2,createBoss3,createBoss4} from './raw/src/entities.js';",
    "import {capturePlayerInputBuffers,updatePlayer} from './raw/src/player.js';",
    "import {updateEnemy,updateEnemyHitFeel,updateBoss,updateBoss2,updateBoss3,updateBoss4,resetWardenState} from './raw/src/ai.js';",
    "import {updateWorldEffects,updateCamera,snapCameraToPlayer,isRoomOccluded} from './raw/src/world.js';",
    "import {updateThemeAndWeather} from './raw/src/worldCamera.js';",
    "import {audio} from './raw/src/audio.js';",
    "import {clearFrameInputs} from './raw/src/input.js';",
    "export {hooks} from './raw/src/state.js';",
    "export {cycleWeapon} from './raw/src/combat.js';",
    start,
    "let boil=0; export function stepPlaying(dt){if(G.gameState!=='playing')return; G.globalTime+=dt; G.playTimeSec+=dt; boil+=dt; while(boil>=1/7){G.boilFrame++;boil-=1/7;} if(G.invertTimer>0)G.invertTimer=Math.max(0,G.invertTimer-dt); capturePlayerInputBuffers(); try {",
    step,
    "}finally{clearFrameInputs();}}"
  ].join('\n');
}
