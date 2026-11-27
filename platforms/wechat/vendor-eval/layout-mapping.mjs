// Translate a bounded source style subset into the vendor's declarative UI.
// This module never computes child coordinates or paints pixels.
import {length} from '../layout/box-model.mjs';
const xml=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function mapMenu(data,width,env){
  const style={root:{width,height:env.height,flexDirection:'column',alignItems:'stretch'}},gaps=[],omissions=[],items=[];
  const gap=length(data.parent['row-gap']??'0',width,env);
  const visible=data.children.filter(c=>c.style.display!=='none');
  for(let i=0;i<visible.length;i++){
    const c=visible[i],s=c.style,id='item'+i;
    if(s.width!=='100%'||s['text-align']!=='left')throw Error('Unsupported source menu contract');
    const px=p=>length(s[p]??'0',width,env),size=px('font-size');
    const top=px('padding-top'),bottom=px('padding-bottom'),border=px('border-bottom-width');
    const lineHeight=s['line-height']??'normal';
    const text={width:'100%',fontSize:size,fontFamily:s['font-family']??'serif',color:s.color,textAlign:'left',verticalAlign:'middle',whiteSpace:'nowrap'};
    if(s['font-weight'])text.fontWeight=s['font-weight'];
    // Explicitly use vendor text line-height when CSS specifies normal.
    if(lineHeight!=='normal')text.lineHeight=/^\d+(?:\.\d+)?$/.test(lineHeight)?size*Number(lineHeight):length(lineHeight,size,env);
    style[id]={width:'100%',flexDirection:'column',justifyContent:'center',minHeight:px('min-height'),paddingTop:top,paddingBottom:bottom,paddingLeft:px('padding-left'),paddingRight:px('padding-right'),borderBottomWidth:border,borderColor:s['border-bottom-color']??s.color,borderRadius:px('border-radius'),marginBottom:i===visible.length-1?0:gap,opacity:Number(s.opacity??1)};
    style[id+'text']=text;
    if(s.background?.startsWith('linear-gradient('))omissions.push({id:c.key,property:'linear-gradient',value:s.background});
    else if(s.background)style[id].backgroundColor=s.background;
    if(c.before?.content)omissions.push({id:c.key,property:'::before',value:c.before.content});
    if(s['letter-spacing']&&s['letter-spacing']!=='normal'&&s['letter-spacing']!=='0')omissions.push({id:c.key,property:'letter-spacing',value:s['letter-spacing']});
    items.push({vendorId:id,sourceKey:c.key,text:c.text,disabled:c.disabled});
    gaps.push('<view id="'+id+'"><text id="'+id+'text" value="'+xml(c.text)+'"></text></view>');
  }
  return {template:'<view id="root">'+gaps.join('')+'</view>',style,items,omissions};
}
