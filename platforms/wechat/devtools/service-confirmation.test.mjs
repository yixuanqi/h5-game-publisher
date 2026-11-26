import test from 'node:test';
import assert from 'node:assert/strict';
import {createServiceConfirmation} from './service-confirmation.mjs';
test('only confirms the exact vendor service message, once, even across chunks',()=>{
  let n=0;const c=createServiceConfirmation(true,()=>n++);
  c.observe('IDE service port disabled. To use CLI Call, please enter ');
  assert.equal(n,0);c.observe('y to confirm enabling CLI capability');
  assert.equal(n,1);c.observe('Enable IDE Service (y/N)');assert.equal(n,1);assert.equal(c.sent,true);
});
test('no confirmation for login, project trust, token, upload or generic prompts',()=>{
  let n=0;const c=createServiceConfirmation(true,()=>n++);
  c.observe('Please log in. Trust this project (y/N). Upload? (y/N). Access token required.');
  assert.equal(n,0);assert.equal(c.sent,false);
});
test('disabled outside disposable CI',()=>{
  let n=0;const c=createServiceConfirmation(false,()=>n++);
  c.observe('Enable IDE Service (y/N)');assert.equal(n,0);
});
test('explicit service confirmation prompt accepted',()=>{
  let n=0;const c=createServiceConfirmation(true,()=>n++);
  c.observe('Enable IDE Service (y/N)');assert.equal(n,1);
});
