'use strict';
function installAudio(wx,host){
  if(typeof wx.createWebAudioContext!=='function')throw Error('WeChat WebAudioContext required');
  host.__h5WechatCreateAudioContext=()=>{
    const c=wx.createWebAudioContext();
    for(const name of ['createBuffer','createBufferSource','createGain','createBiquadFilter','createOscillator','resume','suspend']){
      if(!c||typeof c[name]!=='function')throw Error('Missing native audio API '+name);
    }
    if(!c.destination||!Number.isFinite(c.sampleRate)||c.sampleRate<=0)throw Error('Invalid native audio context');
    return c;
  };
  host.__h5WechatLoadAudioBank=(ctx,expected)=>{
    const fs=wx.getFileSystemManager(),m=JSON.parse(fs.readFileSync('audio/bank.json','utf8')),raw=fs.readFileSync('audio/bank.pcm');
    const view=ArrayBuffer.isView(raw)?new DataView(raw.buffer,raw.byteOffset,raw.byteLength):new DataView(raw);
    if(m.format!=='pcm16le-mono'||m.sampleRate!==24000||m.bytes!==view.byteLength||!Array.isArray(m.records)||m.records.length!==expected.length)throw Error('Invalid audio bank');
    const out=Object.create(null),keys=new Set(expected),seen=new Set();let offset=0;
    for(const r of m.records){
      if(!keys.has(r.key)||seen.has(r.key)||r.offset!==offset||!Number.isSafeInteger(r.frames)||r.frames<256||offset+r.frames*2>view.byteLength)throw Error('Invalid audio record '+r.key);
      const b=ctx.createBuffer(1,r.frames,m.sampleRate),ch=b.getChannelData(0);
      for(let i=0;i<r.frames;i++)ch[i]=view.getInt16(offset+i*2,true)/32767;
      offset+=r.frames*2;out[r.key]=b;seen.add(r.key);
    }
    if(offset!==view.byteLength||seen.size!==keys.size)throw Error('Incomplete bank');
    return out;
  };
}
module.exports={installAudio};
