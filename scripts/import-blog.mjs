import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const ids = ['ashen-bell-vow','curio-box'];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowed = new Set(['.js','.mjs','.json','.css','.png','.jpg','.jpeg','.webp','.svg','.gif','.ico','.woff','.woff2','.mp3','.ogg','.wav','.webmanifest']);
function safeCopy(src,dst){
  const st=fs.lstatSync(src);
  if(st.isSymbolicLink()) throw Error('Symlink in export: '+src);
  if(st.isDirectory()){
    fs.mkdirSync(dst,{recursive:true});
    for(const e of fs.readdirSync(src).sort()) safeCopy(path.join(src,e),path.join(dst,e));
  }else if(st.isFile() && (allowed.has(path.extname(src).toLowerCase()) || path.basename(src)==='index.html')){
    fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);
  }else throw Error('Unexpected runtime resource: '+src);
}
function replaceOnce(s,from,to){
  if(s.split(from).length!==2) throw Error('Game adapter anchor missing or ambiguous: '+from);
  return s.replace(from,()=>to);
}
export function adaptMain(id,s){
  if(id==='ashen-bell-vow'){
    s=replaceOnce(s,"if ('serviceWorker' in navigator && !window.__ABV_OFFLINE_WORLD__) {","if ('serviceWorker' in navigator && !window.__ABV_OFFLINE_WORLD__ && !window.H5Publisher?.isNative()) {");
    const anchor="const _recoverAudioOnGesture = () => {";
    return replaceOnce(s,anchor,[
      "window.addEventListener('h5publisher:pause', () => {",
      "  if (G.gameState === 'playing') openPauseModal();",
      "  if (G.saveDirtyTimer > 0 && G.worldState) saveProgress(false);",
      "  audio.setBackgroundDuck(true);",
      "});",
      "window.addEventListener('h5publisher:resume', () => { audio.setBackgroundDuck(false); audio.keepAliveResume(false); });",
      "window.addEventListener('h5publisher:back', () => { if (G.gameState === 'playing') openPauseModal(); });",
      anchor].join('\n'));
  }
  if(id==='curio-box'){
    const anchor="  window.addEventListener('pagehide', handleAppHide);";
    return replaceOnce(s,anchor,[
      "  window.addEventListener('h5publisher:pause', handleAppHide);",
      "  window.addEventListener('h5publisher:resume', handleAppShow);",
      "  window.addEventListener('h5publisher:back', () => {",
      "    if (game.run.phase === 'playing' && !game.titleOpen && !game.introActive && !game.hubOpen && !game.paused) setGamePaused(true);",
      "  });",
      anchor].join('\n'));
  }
  throw Error('Unknown game: '+id);
}
export function auditHtml(root){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  // Inspect entry HTML resource tags only; dynamic fetch/import/CSS dependencies require browser smoke tests.
  const seen=[];
  for(const m of html.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<(script|link|img|audio|video|source)\b[^>]*>/gi)){
    const tag=m[0], kind=m[1].toLowerCase();
    if(kind==='link' && !/\brel\s*=\s*["'][^"']*(?:stylesheet|icon|manifest|preload|modulepreload)[^"']*["']/i.test(tag)) continue;
    const a=tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
    if(!a)continue;const ref=a[1];if(/^(?:data:|#)/i.test(ref))continue;
    if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(ref)) throw Error('Non-local entry resource: '+ref);
    const rel=decodeURIComponent(ref.split(/[?#]/)[0]);
    if(rel.split('/').includes('..')||rel.includes('\\'))throw Error('Unsafe entry resource: '+ref);
    const target=path.resolve(root,rel);
    if(!fs.existsSync(target)||!fs.statSync(target).isFile())throw Error('Missing entry resource: '+ref);
    seen.push(ref);
  }
  return seen;
}
export function exportGame(id,checkout,out){
  if(!ids.includes(id)) throw Error('Unknown game: '+id);
  const source=path.resolve(checkout,'docs',id);
  if(fs.existsSync(out))throw Error('Output already exists; use a fresh directory: '+out);
  const dest=path.resolve(out),relative=path.relative(source,dest);
  if(!relative || (!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Output overlaps source');
  const roots=id==='ashen-bell-vow'?['index.html','styles.css','src','data','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','sw.js']:['index.html','style.css','src'];
  try{
    for(const r of roots)safeCopy(path.join(source,r),path.join(dest,r));
    const main=path.join(dest,'src','main.js');
    fs.writeFileSync(main,adaptMain(id,fs.readFileSync(main,'utf8')));
    const refs=auditHtml(dest);
    return {id,entryResources:refs};
  }catch(e){fs.rmSync(dest,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [id,checkout,output]=process.argv.slice(2);
    if(!ids.includes(id)||!checkout)throw Error('Usage: node scripts/import-blog.mjs <ashen-bell-vow|curio-box> <PhotoGallery checkout> [new output directory]');
    const sha=spawnSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'});
    if(sha.status!==0)throw Error('Expected a Git checkout');
    const out=output||path.join(repoRoot,'games',id);
    const result=exportGame(id,checkout,out);
    fs.writeFileSync(path.join(out,'publisher-source.json'),JSON.stringify({repository:'yixuanqi/PhotoGallery',commit:sha.stdout.trim(),...result},null,2)+'\n');
    console.log(JSON.stringify(result));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
