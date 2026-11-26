// Independent TTY control; not a WeChat login or authorization.
const readline=require('node:readline');
if(!process.stdin.isTTY||!process.stdout.isTTY){console.error('NOT_A_TTY');process.exit(2);}
console.log('PUBLISHER_TTY_READY');
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
rl.question('Enable IDE Service (y/N) ? ',answer=>{console.log(answer.trim()==='y'?'PUBLISHER_TTY_CONFIRM_OK':'PUBLISHER_TTY_CONFIRM_BAD');rl.close();process.exitCode=answer.trim()==='y'?0:3;});
