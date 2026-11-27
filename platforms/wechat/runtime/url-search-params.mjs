export function createURLSearchParamsCtor(nativeCtor){
  if(typeof nativeCtor==='function')return nativeCtor;
  return class MiniURLSearchParams{
    constructor(input=''){
      this._pairs=[];
      const raw=String(input??'').replace(/^\?/,'');
      if(!raw)return;
      for(const part of raw.split('&')){
        if(!part)continue;
        const i=part.indexOf('='),k=i<0?part:part.slice(0,i),v=i<0?'':part.slice(i+1);
        const decode=s=>decodeURIComponent(String(s).replace(/\+/g,' '));
        this._pairs.push([decode(k),decode(v)]);
      }
    }
    get(name){name=String(name);const p=this._pairs.find(x=>x[0]===name);return p?p[1]:null;}
    has(name){name=String(name);return this._pairs.some(x=>x[0]===name);}
    getAll(name){name=String(name);return this._pairs.filter(x=>x[0]===name).map(x=>x[1]);}
    toString(){return this._pairs.map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');}
  };
}
