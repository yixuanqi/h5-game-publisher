export function createLocationBridge(){
  const state={protocol:'wechatgame:',hostname:'',host:'',pathname:'/',search:'',hash:'',origin:'null'};
  return Object.freeze(Object.defineProperties({},{
    protocol:{enumerable:true,get:()=>state.protocol},
    hostname:{enumerable:true,get:()=>state.hostname},
    host:{enumerable:true,get:()=>state.host},
    pathname:{enumerable:true,get:()=>state.pathname},
    search:{enumerable:true,get:()=>state.search},
    hash:{enumerable:true,get:()=>state.hash},
    origin:{enumerable:true,get:()=>state.origin},
    href:{enumerable:true,get:()=>state.protocol+'///',set(){throw Error('Browser navigation unavailable in WeChat Mini Game');}},
    assign:{enumerable:true,value(){throw Error('Browser navigation unavailable in WeChat Mini Game');}},
    replace:{enumerable:true,value(){throw Error('Browser navigation unavailable in WeChat Mini Game');}},
    reload:{enumerable:true,value(){throw Error('Browser reload unavailable in WeChat Mini Game');}},
    toString:{value(){return state.protocol+'///';}}
  }));
}
