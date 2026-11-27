export function createLocalStorageFacade(adapter){
  if(!adapter||typeof adapter.get!=='function'||typeof adapter.set!=='function'||typeof adapter.remove!=='function')throw Error('Storage adapter required');
  return Object.freeze({
    getItem(key){const v=adapter.get(String(key));return v==null?null:String(v);},
    setItem(key,value){if(adapter.set(String(key),String(value))!==true)throw Error('Mini Game storage write failed');},
    removeItem(key){if(adapter.remove(String(key))!==true)throw Error('Mini Game storage remove failed');}
  });
}
