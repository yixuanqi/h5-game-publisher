'use strict';
// Native canvas presentation. No DOM emulation, fake progression or commercial actions.
const W=844,H=390;
function viewport(w,h){if(!(w>0&&h>0))throw Error('Invalid viewport');const s=Math.min(w/W,h/H);return {s,x:(w-W*s)/2,y:(h-H*s)/2};}
function hit(rect,x,y){return x>=rect.x&&y>=rect.y&&x<rect.x+rect.w&&y<rect.y+rect.h;}
function createUI(engine,scene,surface,play=null){
  const {G}=engine;let route='title',backRoute='title',selected=0,tab='weapons',page=0,buttons=[],layout=null,message='';
  let draws=0;
  const ctx=surface.ctx, en=()=>engine.isEn(), L=(zh,enText)=>en()?enText:zh;
  function navigate(next,from=route){if(play)play.onRoute(next);route=next;backRoute=from;page=0;buttons=[];message='';}
  function back(){const next=backRoute==='title'?'title':'preview';navigate(next);}
  function invalidate(){buttons=[];layout=null;}
  function rect(x,y,w,h,fill,stroke){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.strokeRect(x,y,w,h);}}
  function text(s,x,y,size=14,col='#ded5be',max=undefined){
    ctx.font=size+'px sans-serif';ctx.fillStyle=col;ctx.textAlign='left';ctx.textBaseline='middle';
    if(max===undefined)ctx.fillText(String(s),x,y);else ctx.fillText(String(s),x,y,max);
  }
  function btn(id,label,x,y,w,h,action,enabled=true){
    rect(x,y,w,h,enabled?'#202e3b':'#171d25',enabled?'#927844':'#39404a');
    text(label,x+9,y+h/2,14,enabled?'#f1dca6':'#78818b',w-18);
    buttons.push({id,x,y,w,h,enabled,action});
  }
  function panel(title,allowBack=true){rect(94,39,656,310,'rgba(8,14,23,0.97)','#8c7349');text(title,110,60,21,'#f1dca6');if(allowBack)btn('back',L('返回','Back'),660,46,76,30,back);}
  function bar(label,value,max,x,y,col){text(label,x,y,12);rect(x+54,y-5,104,10,'#29343b');rect(x+54,y-5,104*Math.max(0,Math.min(1,value/Math.max(1,max))),10,col);text(Math.round(value)+'/'+max,x+166,y,12);}
  function changeSetting(key,value){
    const old=G.settings[key];G.settings[key]=value;
    engine.saveUserSettings();
    const saved=engine.storage.getJSON(engine.SETTINGS_KEY);
    if(!saved||saved[key]!==value){G.settings[key]=old;message=L('设置保存失败','Settings write failed');}
    else {if(play?.audio)play.applyAudioSettings();message=L('设置已保存（测试命名空间）','Settings saved (test namespace)');}
  }
  function changeLocale(){
    const old=G.locale,next=en()?'zh-CN':'en-US';engine.setLocale(next,true);
    if(engine.storage.get('ashen_bell_vow_locale_v15')!==next){engine.setLocale(old,false);message=L('语言保存失败','Language write failed');}
  }
  function title(){
    rect(18,40,270,310,'rgba(8,14,23,0.88)','#846d43');
    text(L('灰钟残誓','Ashen Bell Vow'),34,75,30,'#f1dca6',240);
    text('V46.1 / V0.3 UI',34,100,13,'#aebdca');
    btn('preview',play?.persistence?L('开始 / 继续档案','Start / continue slot'):play?L('开始操作测试','Start gameplay test'):L('进入界面测试','Enter UI preview'),34,124,238,38,()=>{if(!play||play.start()!==false)navigate('preview');});
    btn('slots',engine.t('title.menuSlots'),34,170,238,38,()=>navigate('slots','title'));
    btn('settings',engine.t('title.menuSettings'),34,216,238,38,()=>navigate('settings','title'));
    btn('help',engine.t('title.menuControls'),34,262,238,38,()=>navigate('help','title'));
    btn('language',L('English','简体中文'),34,308,238,30,changeLocale);
  }
  function slots(){
    panel(engine.t('title.menuSlots'));const slots=engine.listSaveSlots();
    for(const item of slots){
      const y=90+item.slot*65,d=item.data;
      const desc=d?L('周目 ','NG ')+(d.ngPlusCycle||1)+' · '+Math.floor((d.playTimeSec||0)/60)+' min':L('空档案','Empty slot');
      btn('slot-'+item.slot,(selected===item.slot?'● ':'○ ')+L('档案 ','Slot ')+(item.slot+1)+'  '+desc,112,y,620,50,()=>{selected=item.slot;G.activeSaveSlot=item.slot;});
    }
    text(play?.persistence?L('选择档案，返回标题后开始或继续；不会覆盖已有档案。','Select a slot, then start/continue from title. No overwrite.'):L('仅查看及选择档案；不创建、覆盖、删除或继续游戏。','Read/select only; no create, overwrite, delete or resume.'),112,305,14,'#acb8c2',620);
    text(L('当前选择：','Selected: ')+(selected+1),112,328,14);
  }
  function preview(){
    const p=G.player,ws=G.worldState;
    rect(8,34,260,99,'rgba(8,14,23,0.88)','#665638');
    bar(L('生命','HP'),p.hp,p.maxHp,16,48,'#d46b68');bar(L('魂火','Soul'),p.soul,p.maxSoul,16,65,'#59bedb');
    text(engine.t('hud.flasks')+' '+p.flasks+'/'+p.maxFlasks+'   '+engine.t('hud.seals')+' '+p.seals+'/'+p.maxSeals,16,83,13);
    const weapon=engine.getActiveWeapon();text((en()?weapon.nameEn:weapon.name)+' · '+L('残响 ','Echoes ')+ws.echoes,16,103,13,'#f1dca6',240);
    text(engine.locRoomName(engine.ROOMS.find(r=>r.id===G.currentRoomId)),16,121,12,'#adbdcb',240);
    const items=[['map',L('舆图','Map')],['codex',L('残卷','Codex')],['altar',L('祭坛','Altar')],['settings',L('设置','Settings')],['pause',L('暂停','Pause')]];
    items.forEach(([id,label],i)=>btn(id,label,410+i*85,36,81,32,()=>navigate(id,'preview')));
    // Explicitly disabled controls. Never imply that combat is working.
    for(const [id,label,x,y] of [['left',L('左','Left'),12,273],['right',L('右','Right'),69,273],['jump',L('跳跃','Jump'),644,273],['attack',L('攻击','Attack'),710,273],['parry',L('弹反','Parry'),776,273],['spell',L('法术','Spell'),710,226],['grapple',L('钩索','Grapple'),776,226]])
      btn(id,label,x,y,55,40,play?()=>{}:null,!!play);
    if(play){
      for(const [id,label,x,y] of [['up',L('上','Up'),41,228],['down',L('下','Down'),41,318],['dash',L('闪避','Dash'),644,226],['interact',L('交互','Use'),644,179],['heal',L('灯油','Heal'),710,179],['seal',L('墨印','Seal'),776,179]])
        btn(id,label,x,y,55,40,()=>{},true);
      text(play.audio?L('音频及存档测试 · 不可提审','Audio/save test · not for release'):play.persistence?L('存档测试 · 音频未启用','Save test · audio disabled'):L('操作测试 · 音频及进度保存未启用','Gameplay test · audio/save not enabled'),282,365,12,'#aab8c3',350);
    }else{
      text(L('战斗触控尚未接通','Combat controls not connected'),12,329,12,'#aab8c3');
      ['祭坛','铸钟殿','霜骸圣脊'].forEach((label,i)=>btn('scene-'+i,en()?['Altar','Foundry','Frost'][i]:label,282+i*145,350,137,31,()=>scene.select(i)));
    }
  }
  function map(){
    panel(L('晦渊舆图 · 测试只读','Map · read-only preview'));
    const rooms=engine.ROOMS,b=rooms.map(r=>r.bounds);
    const x0=Math.min(...b.map(r=>r.x)),y0=Math.min(...b.map(r=>r.y)),x1=Math.max(...b.map(r=>r.x+r.w)),y1=Math.max(...b.map(r=>r.y+r.h));
    const s=Math.min(608/(x1-x0),220/(y1-y0)),ox=118+(608-(x1-x0)*s)/2,oy=84+(220-(y1-y0)*s)/2;
    for(const r of rooms){const q=r.bounds,c=r.id===G.currentRoomId;rect(ox+(q.x-x0)*s,oy+(q.y-y0)*s,q.w*s,q.h*s,c?'#927844':'#263746',c?'#f4d68a':'#566579');}
    const p=G.player;ctx.fillStyle='#79d4ec';ctx.beginPath();ctx.arc(ox+(p.x-x0)*s,oy+(p.y-y0)*s,3,0,Math.PI*2);ctx.fill();
    text(L('实际地图：','Actual rooms: ')+rooms.length+'   '+L('探索 ','Explored ')+engine.getExplorationPercent()+'%',112,322,14);
  }
  function list(rows){const per=5,last=Math.max(0,Math.ceil(rows.length/per)-1);page=Math.min(page,last);
    rows.slice(page*per,(page+1)*per).forEach((r,i)=>{const y=113+i*36;rect(112,y,620,32,'#1c2935','#364451');text(r[0],120,y+16,14,'#e4d4ad',285);text(r[1],415,y+16,13,'#adbcc6',306);});
    btn('prev','‹',112,309,54,29,()=>{page--;},page>0);btn('next','›',678,309,54,29,()=>{page++;},page<last);text((page+1)+' / '+(last+1),386,324,14);
  }
  function codex(){
    panel(L('晦渊残卷 · 测试只读','Codex · read-only preview'));
    [['weapons',L('兵刃','Weapons')],['beasts',L('妖魔','Bestiary')],['lore',L('残碑','Lore')],['achievements',L('成就','Achievements')]].forEach(([id,label],i)=>btn('tab-'+id,(tab===id?'● ':'')+label,112+i*155,78,149,30,()=>{tab=id;page=0;}));
    const ws=G.worldState,c=ws.codex;
    const status=v=>v?L('已解锁','Unlocked'):L('未解锁','Locked');
    const rows=tab==='weapons'?engine.WEAPON_ORDER.map(id=>{const w=engine.WEAPONS[id];return [en()?w.nameEn:w.name,status(ws.unlockedWeapons.has(id))];}):
      tab==='beasts'?engine.BESTIARY_ENTRIES.map(e=>[engine.locBestiary(e),status(!!c.bestiary[e.kind])]):
      tab==='lore'?engine.LORE_TABLETS.map(e=>[engine.locTablet(e),status(c.readTablets.includes(e.id))]):
      engine.ACHIEVEMENTS_DEF.map(e=>[engine.locAchievement(e),status(c.achievements.includes(e.id))]);
    list(rows);
  }
  function altar(){
    panel(L('祭坛 · 状态预览','Altar · status preview'));
    const ws=G.worldState,a=engine.ALTARS.find(a=>a.id===ws.activeAltarId);
    text(L('当前祭坛：','Active altar: ')+(a?engine.locAltar(a):ws.activeAltarId),112,90,15);
    text(L('残响：','Echoes: ')+ws.echoes+'    '+L('已点燃：','Lit: ')+ws.litAltars.size,112,113,15);
    const rows=engine.RELICS.filter(r=>ws.unlockedRelics.has(r.id)).map(r=>[engine.locRelic(r),G.equippedRelics.some(e=>e?.id===r.id)?L('已装备','Equipped'):L('已解锁','Unlocked')]);
    rows.forEach((r,i)=>{rect(112,135+i*37,620,33,'#1d2a35','#46505a');text(r[0]+' · '+r[1],123,151+i*37,14);});
    text(L('装备、升级、传送与挑战暂不可操作。','Equip, upgrade, travel and challenge not connected.'),112,323,14,'#aab8c3',620);
  }
  function settings(){
    panel(engine.t('title.menuSettings'));
    btn('language',L('语言：中文 / English','Language: English / 中文'),112,82,620,34,changeLocale);
    btn('lighting',L('动态光影：','Dynamic lighting: ')+(G.settings.dynamicLighting?L('开','On'):L('关','Off')),112,122,304,34,()=>changeSetting('dynamicLighting',!G.settings.dynamicLighting));
    btn('haptics',L('震动：','Haptics: ')+(G.settings.haptics?L('开','On'):L('关','Off')),428,122,304,34,()=>changeSetting('haptics',!G.settings.haptics));
    for(const [i,key,label] of [[0,'masterVol',L('总音量','Master')],[1,'musicVol',L('音乐','Music')],[2,'sfxVol',L('音效','SFX')]]){
      const y=166+i*39;const v=G.settings[key];text(label+' '+Math.round(v*100)+'%',112,y+15,14);
      btn(key+'-minus','−',478,y,118,32,()=>changeSetting(key,Math.max(0,Math.round((v-.05)*100)/100)),v>0);
      btn(key+'-plus','+',614,y,118,32,()=>changeSetting(key,Math.min(1,Math.round((v+.05)*100)/100)),v<1);
    }
    text(message||(play?.audio?L('音量实时应用 · 震动映射待真机验证','Live volume · device haptics unverified'):L('音量与震动仅保存设置，实际效果待 V0.4。','Audio/haptics settings only; effects pending V0.4.')),112,315,13,'#b8c7d1',620);
  }
  function pause(){
    panel(L('暂停 · 界面测试','Pause · UI preview'));
    btn('resume',L('继续预览','Resume preview'),112,88,620,44,()=>navigate('preview'));
    btn('settings',engine.t('title.menuSettings'),112,140,620,44,()=>navigate('settings','preview'));
    btn('title',play?.persistence?L('保存并返回标题','Save and return to title'):L('返回标题（不保存进度）','Return to title (no progress saved)'),112,192,620,44,()=>{if(!play?.persistence||play.saveTitle())navigate('title');});
  }
  function dead(){panel(L('角色死亡','Death'),false);btn('retry',L('于祭坛重燃','Respawn at altar'),112,135,620,48,()=>play.retry());}
  function help(){panel(engine.t('title.menuControls'));text(L('移动、跳跃、攻击、弹反、法术、钩索为原游戏操作。','Move, jump, attack, parry, spell and grapple are original actions.'),112,102,15,'#ded5be',620);text(L('本阶段仅测试 Canvas 界面及菜单触控；战斗按钮禁用。','This slice tests Canvas UI and menu touch only; combat disabled.'),112,135,15,'#ded5be',620);}
  const painters={title,slots,preview,map,codex,altar,settings,pause,help,dead};
  function paint(){
    buttons=[];layout=viewport(surface.width,surface.height);const d=surface.canvas.width/surface.width;
    ctx.save();ctx.setTransform(d*layout.s,0,0,d*layout.s,d*layout.x,d*layout.y);
    ctx.fillStyle='rgba(5,9,16,0.92)';ctx.fillRect(0,0,W,28);
    text(L('工程测试 · 非正式游戏 · 不可提审','Engineering preview · NOT FOR RELEASE'),8,14,12,'#e8ce96');
    try{painters[route]();if(play?.saveError)text(play.saveError,16,365,12,'#f99',810);draws++;}finally{ctx.restore();}
  }
  function touch(x,y){
    if(!layout||!Number.isFinite(x)||!Number.isFinite(y))return false;
    const lx=(x-layout.x)/layout.s,ly=(y-layout.y)/layout.s;
    const b=buttons.find(b=>hit(b,lx,ly));if(!b||!b.enabled||typeof b.action!=='function')return false;
    buttons=[];b.action();return true;
  }
  return {paint,touch,invalidate,navigate,get route(){return route},get selected(){return selected},get tab(){return tab},get page(){return page},get draws(){return draws},get targets(){return buttons.map(({action,...r})=>r)}};
}
module.exports={viewport,hit,createUI};
