'use strict';
// Engineering scene fixture, NOT the original gameplay loop. All rendering, camera and
// ambient simulation come from upstream. Do not persist progression or present as gameplay.
const ROOMS=['r01_sanctuary','r05_foundry','r17_frost_summit'];
function createScene(engine,surface){
  const {G}=engine;
  G.canvas=surface.canvas;G.ctx=surface.ctx;G.isMobile=true;G.gameState='title';
  let boil=0;
  function resize(){
    G.canvasW=surface.width;G.canvasH=surface.height;
    G.renderScale=surface.canvas.width/surface.width;
    G.ctx.setTransform(G.renderScale,0,0,G.renderScale,0,0);
    if(G.player)engine.snapCameraToPlayer(0);
  }
  resize();
  engine.buildGlowSprites();
  engine.buildParchmentPattern();
  function select(index){
    if(!Number.isInteger(index)||index<0||index>=ROOMS.length)throw Error('Invalid scene');
    const room=engine.ROOMS.find(r=>r.id===ROOMS[index]);
    if(!room)throw Error('Missing scene '+ROOMS[index]);
    G.worldState=engine.createFreshWorldState();
    const p=engine.getRoomSpawnPoint(room.id);
    G.player=engine.createPlayer(p.x,p.y);G.player.grounded=true;
    G.enemies=engine.createSentinels();
    G.boss=engine.createBoss();G.boss2=engine.createBoss2();G.boss3=engine.createBoss3();
    G.lanterns=engine.createLanterns();G.resonancePuzzles=engine.createResonancePuzzles();
    G.crumblePlatforms=engine.createCrumblePlatforms();
    engine.markMapExplored(p.x,p.y);
    engine.initAmbientMotes();
    engine.snapCameraToPlayer(0);
    // Use the real biome blending function until it converges for the chosen scene.
    for(let i=0;i<24;i++)engine.updateThemeAndWeather(0.033);
    if(G.currentRoomId!==room.id)throw Error('Unexpected room '+G.currentRoomId+' vs '+room.id);
    return room.id;
  }
  function frame(dt){
    if(!Number.isFinite(dt)||dt<0||dt>0.03300001)throw Error('Invalid frame delta');
    G.globalTime+=dt;boil+=dt;
    while(boil>=1/7){G.boilFrame++;boil-=1/7;}
    engine.updateAmbientOnly(dt);
    engine.render();
  }
  return {select,resize,frame,G};
}
module.exports={createScene,ROOMS};
