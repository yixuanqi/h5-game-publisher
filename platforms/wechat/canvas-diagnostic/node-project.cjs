// Host-only module scope. Do not modify the generated WeChat project.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function stageNodeProject(project){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'h5publisher-canvas-'));
  const staged=path.join(root,'project');
  const cleanup=()=>fs.rmSync(root,{recursive:true,force:true});
  try{
    fs.cpSync(project,staged,{recursive:true,errorOnExist:true,force:false});
    fs.writeFileSync(path.join(staged,'package.json'),JSON.stringify({type:'commonjs'})+'\n',{flag:'wx'});
    return {project:staged,cleanup};
  }catch(e){cleanup();throw e;}
}
module.exports={stageNodeProject};
