// LinkeDOM 0.18.15 defaultView is a Proxy targeting globalThis.
// All authored window properties must be isolated from platform-owned globals.
export function createIsolatedWindow(domWindow){
  if(!domWindow||typeof domWindow!=='object'||!domWindow.document)throw Error('LinkeDOM window/document required');
  const target=Object.create(null);
  const win=new Proxy(target,{
    get(t,key,receiver){
      if(Reflect.has(t,key))return Reflect.get(t,key,receiver);
      return Reflect.get(domWindow,key,domWindow);
    },
    has(t,key){return Reflect.has(t,key)||Reflect.has(domWindow,key);}
  });
  for(const name of ['window','self','top','parent'])Object.defineProperty(target,name,{value:win,configurable:true});
  Object.defineProperty(target,'document',{value:domWindow.document,configurable:true});
  return win;
}
