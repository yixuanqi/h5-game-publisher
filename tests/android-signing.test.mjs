import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signingOptions} from '../platforms/android/sign-aab.mjs';
test('AAB signing is explicit, certificate-pinned, and fails without credentials',()=>{
  const env={H5_SIGNING_MODE:'test',H5_UPLOAD_CERT_SHA256:'ab'.repeat(32),H5_KEY_ALIAS:'test-key',H5_STORE_PASSWORD:'test-password',H5_KEY_PASSWORD:'test-password',H5_KEYSTORE:'/tmp/key.p12'};
  assert.equal(signingOptions(env).mode,'test');
  for(const k of Object.keys(env)){const bad={...env};delete bad[k];assert.throws(()=>signingOptions(bad),/Missing/);}
  assert.throws(()=>signingOptions({...env,H5_UPLOAD_CERT_SHA256:'wrong'}),/certificate/);
  assert.throws(()=>signingOptions({...env,H5_SIGNING_MODE:'automatic'}),/Explicit/);
  assert.throws(()=>signingOptions({...env,H5_KEY_ALIAS:'-bad'}),/alias/);
});
