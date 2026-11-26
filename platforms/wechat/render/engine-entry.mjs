// Re-export real V46.1 rendering, state, world and entity modules without DOM main.js.
export {G,createFreshWorldState,createLanterns,createResonancePuzzles,createCrumblePlatforms,markMapExplored} from './raw/src/state.js';
export {ensureWorldForCycle,getRoomSpawnPoint} from './raw/src/levelLoader.js';
export {storage,setStorageAdapter} from './raw/src/storage.js';
export {buildParchmentPattern,buildGlowSprites,initAmbientMotes,updateCloak} from './raw/src/vfx.js';
export {render} from './raw/src/renderer.js';
export {snapCameraToPlayer,updateAmbientOnly,updateThemeAndWeather} from './raw/src/worldCamera.js';
export {createPlayer,createSentinels,createBoss,createBoss2,createBoss3} from './raw/src/entities.js';
export {ALTARS,ROOMS} from './raw/src/config.js';
