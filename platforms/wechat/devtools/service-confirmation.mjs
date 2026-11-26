// Only the vendor's documented service-port confirmation, on a disposable
// hosted runner with no account credentials. Never answer general y/N prompts.
export function createServiceConfirmation(allowed,send){
  let tail='',sent=false;
  return {get sent(){return sent;},observe(chunk){
    if(!allowed||sent)return;
    tail=(tail+chunk).slice(-4096);
    const explicit=/IDE service port disabled\.[\s\S]{0,400}?please enter y to confirm enabling CLI capability/i.test(tail);
    const prompt=/Enable IDE Service\s*\(y\/N\)/i.test(tail);
    if(explicit||prompt){sent=true;send();}
  }};
}
