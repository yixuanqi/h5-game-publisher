// Re-export real V46.1 rendering, state, world and entity modules without DOM main.js.
export {G,createFreshWorldState,createLanterns,createResonancePuzzles,createCrumblePlatforms,markMapExplored} from './raw/src/state.js';
export {ensureWorldForCycle,getRoomSpawnPoint} from './raw/src/levelLoader.js';
export {storage,setStorageAdapter} from './raw/src/storage.js';
export {buildParchmentPattern,buildGlowSprites,initAmbientMotes,updateCloak} from './raw/src/vfx.js';
export {render} from './raw/src/renderer.js';
export {snapCameraToPlayer,updateAmbientOnly,updateThemeAndWeather} from './raw/src/worldCamera.js';
export {createPlayer,createSentinels,createBoss,createBoss2,createBoss3} from './raw/src/entities.js';
export {ALTARS,ROOMS} from './raw/src/config.js';

export {listSaveSlots,loadUserSettings,saveUserSettings} from './raw/src/save.js';
export {t,isEn,locRoomName,locAltar,locRelic,locBestiary,locAchievement,locTablet,setLocale,loadSavedLocale} from './raw/src/i18n.js';
export {getExplorationPercent,getActiveWeapon,isWorldPosExplored} from './raw/src/state.js';
export {RELICS,LORE_TABLETS,SETTINGS_KEY} from './raw/src/config.js';
export {BESTIARY_ENTRIES,ACHIEVEMENTS_DEF} from './raw/src/codex.js';
export {WEAPON_ORDER,WEAPONS} from './raw/src/weapons.js';
