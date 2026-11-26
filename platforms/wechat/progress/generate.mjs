import fs from 'node:fs';
import path from 'node:path';
// Extract the original rules/handlers from the pinned UI modules. Replace only UI side effects.
function between(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0||s.indexOf(a,i+1)!==-1)throw Error('Unreviewed progress seam '+a);return s.slice(i,j);}
function body(s,a,b){return between(s,a,b).slice(a.length);}
function noUI(s){return s.replace(/^\s*(?:render(?:Scavenger|Chronicler|Keeper|Smith|RelicChoices|AltarArmory|Dummy)Modal\(\)|renderRelicChoices\(\)|renderAltarArmory\(\)|uiHooks\.syncHUD\(true\));[ \t]*$/gm,'');}
export function generateProgress(raw){
  const read=p=>fs.readFileSync(path.join(raw,'src',p),'utf8'),m=read('ui/modalsUi.js'),r=read('ui/relicBoardUi.js'),s=read('ui/skillTreeUi.js');
  const open=between(m,'export function openNpcModal(npc) {','export function renderScavengerModal()');
  const opens=[open,between(m,'export function openChroniclerModal(npc) {','export function renderChroniclerModal()'),between(m,'export function openKeeperModal(npc) {','export function renderKeeperModal()'),between(m,'export function openSmithModal(npc) {','let activeDummyModalRef = null;')].join('\n')
    .replaceAll(/^\s*uiState\.activeNpcModalRef = .*;$/gm,'')
    .replaceAll(/^\s*(?:render(?:Scavenger|Chronicler|Keeper)Modal\(\)|uiHooks\.renderSmithModal\(\));$/gm,'')
    .replaceAll("openModal('npc')","hooks.openModal('npc')").replaceAll("openModal('smith')","hooks.openModal('smith')");
  const goods=between(m,'  const goods = [','  for (const item of goods)');
  const buy=noUI(body(m,"      btn.addEventListener('click', () => {\n        G.worldState.echoes -= item.cost;","      });")).replace('renderScavengerModal(); uiHooks.syncHUD(true);','').trim();
  const milestones=between(m,'  const milestones = [','  for (const ms of milestones)');
  const claim=noUI(body(m,"      btn.addEventListener('click', () => {\n        claims.push(ms.id);","      });"));
  const targets=between(m,'  const remainingTargets = [];','  const svcCard =');
  const carto=noUI(body(m,"    svcBtn.addEventListener('click', () => {\n","      if (dlgEl)"));
  const gift=noUI(body(m,"    qBtn.addEventListener('click', () => {\n","    });"));
  const bless=noUI(body(m,"    bBtn.addEventListener('click', () => {\n","    });"));
  const smith=noUI(between(s,'function getNodeStatus(node) {','function pickInitialNode() {'));
  const equip=noUI(body(r,'      const equip = () => {\n','      };'));
  const refine=noUI(body(r,"        refBtn.addEventListener('click', ev => {\n          ev.stopPropagation();\n","        });"));
  const relicUnlocked=between(r,'function isRelicUnlocked(relic) {','function updateSynergyOverlay()');
  const refill=noUI(body(m,"  refillBtn.addEventListener('click', () => {\n","  });")).replace("closeModal('dummy');",'');
  const auto=noUI(body(m,"  autoBtn.addEventListener('click', () => {\n","  });"));
  const reset=noUI(body(m,"  resetBtn.addEventListener('click', () => {\n","  });"));
  const mode=noUI(body(m,"    btn.addEventListener('click', () => {\n      e.modeIdx = idx;","    });")).replace("closeModal('dummy');",'');
  return [
    "import {COLORS,RELICS,RELIC_REFINE_COST,DUMMY_MODES,ROOMS,LORE_TABLETS} from './raw/src/config.js';",
    "import {G,hooks,getActiveWeaponId,isWeaponUnlocked,isWeaponTraitUnlocked,getActiveWeaponTraitId,setActiveWeaponTrait,ensureNpcQuests,getPlayerMaxHp,getPlayerMaxSoul,getPlayerMaxFlasks,getPlayerMaxSeals,getExplorationPercent,isSkillNodeUnlocked,unlockSkillNode,unlockWeaponTrait,isRelicRefined,refineRelic,hasThirdRelicSlot,getActiveSynergies} from './raw/src/state.js';",
    "import {audio} from './raw/src/audio.js';import {triggerHaptic} from './raw/src/input.js';import {equipWeapon} from './raw/src/combat.js';",
    "import {spawnShockwave,spawnFloatText} from './raw/src/vfx.js';import {saveProgress} from './raw/src/save.js';",
    "import {t,isEn,locZoneName,locRoomName,locTablet,locPickup,locNpcName,locRelic,locDummyMode} from './raw/src/i18n.js';",
    "import {WEAPON_ORDER,WEAPONS,getWeaponForgeTraits} from './raw/src/weapons.js';",
    "import {BESTIARY_ENTRIES,ensureCodexState,recordTabletRead,checkAchievements,recordSynergyDiscovered} from './raw/src/codex.js';",
    "import {BELL_SKILL_NODES,getSkillNodeById} from './raw/src/skillTree.js';",
    opens,"export {openNpcModal as openNativeNpc};",
    "export function openNativeLore(tablet){if(tablet?.id)recordTabletRead(tablet.id);hooks.openModal('lore');}",
    "const L=(zh,en)=>isEn()?en:zh; const row=(id,title,detail,label,enabled,run)=>({id,title,detail,label,enabled,run});",
    "function npcModel(npc){const nq=ensureNpcQuests(),echoes=G.worldState.echoes||0;let sub='',dialogue='',rows=[];",
    "if(npc.kind==='scavenger'){sub=t('scav.sub');dialogue=t(nq.boughtSecretMap&&nq.boughtBellSatchel?'scav.dlgDone':'scav.dlgIntro');",
    goods,
    "rows=goods.map(item=>row(item.id,item.title,item.desc,item.owned?t('scav.btnOwned'):t('scav.btnBuy',item.cost),!item.owned&&echoes>=item.cost,()=>{G.worldState.echoes -= item.cost;"+buy+"}));",
    "}else if(npc.kind==='chronicler'){const c=ensureCodexState(),readCnt=c.readTablets.length,seenCnt=Object.keys(c.bestiary).filter(k=>c.bestiary[k]&&c.bestiary[k].seen).length,expPct=getExplorationPercent(),claims=nq.chroniclerClaims;sub=t('mochen.sub',readCnt,LORE_TABLETS.length,seenCnt,BESTIARY_ENTRIES.length,expPct);dialogue=t(claims.includes('vol3')?'mochen.dlg.vol3':G.worldState.boss2Defeated?'mochen.dlg.boss2':claims.length?'mochen.dlg.progress':'mochen.dlg.intro');",
    milestones,
    "rows=milestones.map(ms=>row(ms.id,ms.title,ms.condText+' · '+ms.rewardText,claims.includes(ms.id)?t('mochen.btnDone'):ms.met?t('mochen.btnReady'):t('mochen.btnLocked'),!claims.includes(ms.id)&&ms.met,()=>{claims.push(ms.id);"+claim+"}));",
    targets,
    "rows.push(row('cartography',t('mochen.svcTitle'),t('mochen.svcDesc'),unpinned.length?t('mochen.svcBtn'):t('mochen.svcDone'),unpinned.length>0&&echoes>=120,()=>{"+carto+"}));",
    "}else if(npc.kind==='keeper'){const hasDawn=!!G.worldState.keyItems?.dawnSigil,gifted=!!nq.keeperWickGifted,blessed=!!nq.keeperBlessingActive;sub=t('xi.sub');dialogue=t(G.worldState.boss3Defeated?'xi.dlg.boss3':gifted?'xi.dlg.gifted':hasDawn?'xi.dlg.hasDawn':'xi.dlg.intro');",
    "rows=[row('wick',t('xi.quest.title'),t('xi.quest.cond')+' · '+t('xi.quest.reward'),gifted?t('xi.quest.btnDone'):hasDawn?t('xi.quest.btnReady'):t('xi.quest.btnLocked'),!gifted&&hasDawn,()=>{"+gift+"}),row('bless',t('xi.bless.title'),t('xi.bless.desc'),blessed?t('xi.bless.btnOn'):t('xi.bless.btnBuy'),!blessed&&echoes>=80,()=>{"+bless+"})];}",
    "return {title:locNpcName(npc,npc.kind),sub:sub+' · '+t('smith.echoHold',echoes),dialogue,rows};}",
    "export function nativeNpcModel(npc){const m=npcModel(npc);return {...m,rows:m.rows.map(({run,...v})=>v)};}export function performNativeNpcAction(npc,id){const r=npcModel(npc).rows.find(r=>r.id===id);if(!r?.enabled)return false;r.run();return true;}",
    smith,
    "export function nativeSmithRows(){return BELL_SKILL_NODES.filter(n=>n.kind!=='root').map(n=>{const st=getNodeStatus(n),enabled=st.available&&G.worldState.echoes>=n.cost||n.kind==='trait'&&st.unlocked&&!st.equipped;return row(n.id,isEn()?n.nameEn:n.name,(isEn()?n.chipsEn:n.chips).join(' · '),st.equipped?L('已装备','Equipped'):st.unlocked?n.kind==='trait'?L('装备','Equip'):L('已解锁','Unlocked'):L('残响 ','Echoes ')+n.cost,enabled);});}export function performNativeSmithAction(id){return purchaseOrActivateNode(getSkillNodeById(id));}",
    relicUnlocked,
    "export function nativeRelicSlotCount(){return hasThirdRelicSlot()?3:2;}export function selectNativeRelicSlot(i){if(Number.isInteger(i)&&i>=0&&i<nativeRelicSlotCount())G.activeRelicSlot=i;}",
    "function equipNativeRelic(relic){if(!isRelicUnlocked(relic))return false;"+equip+"return true;}",
    "function refineNativeRelic(relic){if(!isRelicUnlocked(relic)||isRelicRefined(relic.id)||G.worldState.echoes<RELIC_REFINE_COST)return false;"+refine+"return true;}",
    "export function nativeAltarRows(tab){if(tab==='weapons'){const rows=[];for(const id of WEAPON_ORDER){const w=WEAPONS[id],unlocked=isWeaponUnlocked(id),active=getActiveWeaponId()===id;rows.push(row('weapon-'+id,unlocked?(isEn()?w.nameEn:w.name):t('altar.relicUnknown'),isEn()?w.tagEn:w.tag,active?t('altar.weaponEquipped'):t('altar.weaponEquipBtn'),unlocked&&!active));for(const ft of getWeaponForgeTraits(id).filter(ft=>isWeaponTraitUnlocked(ft.id)))rows.push(row('trait-'+id+'-'+ft.id,isEn()?ft.nameEn:ft.name,isEn()?ft.descEn:ft.desc,L('装备','Equip'),getActiveWeaponTraitId(id)!==ft.id));}return rows;}const rows=[];for(const relic of RELICS){const unlocked=isRelicUnlocked(relic);rows.push(row('equip-'+relic.id,unlocked?locRelic(relic):t('altar.relicUnknown'),unlocked?locRelic(relic,'shortEffect'):locRelic(relic,'hint'),L('装备/卸下','Equip/toggle'),unlocked));if(unlocked&&!isRelicRefined(relic.id))rows.push(row('refine-'+relic.id,locRelic(relic)+' ★+1',locRelic(relic,'shortRefined'),L('残响 ','Echoes ')+RELIC_REFINE_COST,G.worldState.echoes>=RELIC_REFINE_COST));}return rows;}",
    "export function performNativeAltarAction(id){for(const relic of RELICS){if(id==='equip-'+relic.id)return equipNativeRelic(relic);if(id==='refine-'+relic.id)return refineNativeRelic(relic);}for(const wid of WEAPON_ORDER){if(id==='weapon-'+wid&&isWeaponUnlocked(wid)){if(equipWeapon(wid,true)){audio.playWeaponSwap(wid);saveProgress(false);return true;}return false;}for(const ft of getWeaponForgeTraits(wid)){if(id==='trait-'+wid+'-'+ft.id&&isWeaponTraitUnlocked(ft.id)&&getActiveWeaponTraitId(wid)!==ft.id){setActiveWeaponTrait(wid,ft.id);audio.playWeaponSwap(wid);saveProgress(false);return true;}}}return false;}",
    "export function nativeDummyRows(e){return [row('dummy-refill',t('dummy.btnRefill'),'',L('执行','Apply'),true),row('dummy-auto',t(G.dummyAutoFullSeals?'dummy.btnAutoOn':'dummy.btnAutoOff'),'',L('切换','Toggle'),true),row('dummy-reset',t('dummy.btnResetMeter'),'',L('重置','Reset'),true),...DUMMY_MODES.map((d,i)=>row('dummy-mode-'+i,locDummyMode(d,'label'),locDummyMode(d,'tip'),L('切换','Switch'),true)),...nativeAltarRows('weapons')];}",
    "export function performNativeDummyAction(e,id){if(!e?.isDummy||!e.alive)return false;if(id==='dummy-refill'){"+refill+"return 'close';}if(id==='dummy-auto'){"+auto+"return true;}if(id==='dummy-reset'){"+reset+"return true;}for(let idx=0;idx<DUMMY_MODES.length;idx++){const dm=DUMMY_MODES[idx];if(id==='dummy-mode-'+idx){e.modeIdx=idx;"+mode+"return 'close';}}return /^(weapon-|trait-)/.test(id)&&performNativeAltarAction(id);}"
  ].join('\n');
}
