import {installCanvasBridge} from './canvas-bridge.mjs';

export function installWxDomCanvas(document,wx){
  if(!document||typeof document.getElementById!=='function')throw Error('DOM document required');
  if(!wx||typeof wx.createCanvas!=='function')throw Error('wx.createCanvas required');
  const screenNode=document.getElementById('gameCanvas');
  if(!screenNode)throw Error('Frozen gameCanvas node missing');
  let screenSurface=null;
  const createSurface=(width,height,node)=>{
    let surface;
    if(node===screenNode&&!screenSurface){
      surface=wx.createCanvas();
      screenSurface=surface;
    }else if(typeof wx.createOffscreenCanvas==='function'){
      surface=wx.createOffscreenCanvas({type:'2d',width,height});
    }else{
      surface=wx.createCanvas();
    }
    if(!surface||typeof surface.getContext!=='function')throw Error('Native Canvas surface unavailable');
    surface.width=width;surface.height=height;
    return surface;
  };
  const bridge=installCanvasBridge(document,createSurface);
  const context=screenNode.getContext('2d');
  if(!context||!screenSurface)throw Error('Screen Canvas 2D unavailable');
  return Object.freeze({screenNode,screen:screenSurface,context,bridge});
}
