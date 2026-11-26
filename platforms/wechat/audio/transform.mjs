// Fail on changed platform seams; preserve original synth/score/voice methods.
export function transformAudio(src){
  function replace(a,b){if(src.split(a).length-1!==1)throw Error('Unreviewed audio seam '+a);src=src.replace(a,b);}
  const begin='    const AC = window.AudioContext || window.webkitAudioContext;',end='    this._bindStateRecovery();';
  const i=src.indexOf(begin),j=src.indexOf(end,i);
  if(i<0||j<0)throw Error('Unreviewed AudioContext constructor');
  replace(src.slice(i,j),"    this.ctx = globalThis.__h5WechatCreateAudioContext();\n");
  replace('    try { this.startAmbience(); } catch {}','    this.startAmbience();');
  replace("    if (!this._bakeStarted) {\n      setTimeout(() => { this._bakeAllBuffers().catch(() => {}); }, 45);\n    }","    if (!this._bakeStarted) this._bakeAllBuffers();");
  const a=src.indexOf('  async _bakeAllBuffers() {'),z=src.indexOf('  // Single-node fire-and-forget playback:',a);
  if(a<0||z<0)throw Error('Unreviewed audio bake method');
  replace(src.slice(a,z),"  _bakeAllBuffers() {\n    if (this._bakeStarted || !this.ctx) return;\n    const keys=buildSfxBakeTasks(c=>this._makeOfflineNoise(c)).map(t=>t[0]);\n    this._baked=globalThis.__h5WechatLoadAudioBank(this.ctx,keys);\n    this._bakeStarted=true;this._bakeReady=true;\n  }\n\n");
  return src;
}
