// Node/Linux diagnostic adapter ONLY. Never included in a WeChat bundle.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
const languages={han:'zh-cn',kana:'ja',hangul:'ko',default:'en'};
// Browser-like Linux generic defaults are a host policy, not game-specific data.
const genericAliases={serif:'Times New Roman','sans-serif':'Arial',monospace:'Courier New'};
export function makeDiagnosticFonts(){
  const choices=new Map(),evidence=[];
  const installed=spawnSync('fc-list',['-f','%{family}\n'],{encoding:'utf8'});
  if(installed.status!==0)throw Error('Cannot enumerate system font families');
  const families=new Set(installed.stdout.split(/[\n,]/).map(v=>v.trim().toLowerCase()));
  function resolveFamily({script,family,weight}){
    const lang=languages[script];if(!lang)throw Error('Unknown font script '+script);
    const key=[script,family,weight].join('|');if(choices.has(key))return choices.get(key);
    const names=family.split(',').map(s=>s.trim().replace(/^["']|["']$/g,'')).filter(Boolean);
    const generic=names.findLast(s=>['serif','sans-serif','monospace'].includes(s))??'sans-serif';
    // Fontconfig uses the authored family preference, language and script
    // coverage, rather than assuming that a browser family name exists in Skia.
    const preferred=script==='default'?(names.find(n=>families.has(n.toLowerCase())||Object.hasOwn(genericAliases,n))??generic):names.join(',');
    const requested=script==='default'?(genericAliases[preferred]??preferred):preferred;
    const query=requested+':lang='+lang+':style='+(Number(weight)>=600?'Bold':'Regular');
    const r=spawnSync('fc-match',['-f','%{family}\n%{file}\n',query],{encoding:'utf8'});
    if(r.status!==0)throw Error('Fontconfig failed: '+r.stderr);
    let [matched,file]=r.stdout.trim().split('\n');
    // Validate the resolved face actually supports the language (fontconfig
    // may prioritize a Latin family). Resolve a generic language face if needed.
    const coverage=spawnSync('fc-match',['-f','%{lang}',query],{encoding:'utf8'}).stdout;
    if(!coverage?.split('|').some(x=>x===lang||x===lang.split('-')[0])){
      const fallback=spawnSync('fc-match',['-f','%{family}\n%{file}\n',generic+':lang='+lang+':style='+(Number(weight)>=600?'Bold':'Regular')],{encoding:'utf8'});
      if(fallback.status!==0)throw Error('Fontconfig fallback failed');
      [matched,file]=fallback.stdout.trim().split('\n');
    }
    matched=matched?.split(',')[0];
    if(!matched||!file)throw Error('No concrete font for '+key);
    // System font collection is loaded by native Canvas; register the actual
    // file if the requested family is absent. Do not distribute font files.
    if(typeof GlobalFonts.has==='function'&&!GlobalFonts.has(matched))GlobalFonts.registerFromPath(file);
    const resolved='"'+matched.replace(/"/g,'')+'"';
    choices.set(key,resolved);evidence.push({script,family,weight,requested,resolved,file});return resolved;
  }
  function checkHan(){
    const family=resolveFamily({script:'han',family:'serif',weight:'400'}),canvas=createCanvas(64,64),ctx=canvas.getContext('2d');
    ctx.font='400 28px '+family;ctx.textBaseline='top';
    const probes=['中','文','字'];
    const glyphs=probes.map(ch=>{
      ctx.clearRect(0,0,64,64);ctx.fillStyle='white';ctx.fillText(ch,4,4);
      const bytes=ctx.getImageData(0,0,64,64).data;
      const width=ctx.measureText(ch).width;
      return {ch,width,hash:createHash('sha256').update(bytes).digest('hex')};
    });
    if(new Set(glyphs.map(x=>x.hash)).size!==glyphs.length||glyphs.some(g=>g.width<22||g.width>32))throw Error('CJK glyph fallback not usable: '+JSON.stringify(glyphs));
    return glyphs;
  }
  return {resolveFamily,evidence,checkHan};
}
