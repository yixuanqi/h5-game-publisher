import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOAT_PIGMENT, classifyFloatPigmentProbe} from '../platforms/wechat/vendor-eval/vendor-pins.mjs';

test('float-pigment stays pinned and host WASM evidence never masquerades as wx evidence', () => {
  assert.equal(FLOAT_PIGMENT.sha, '830c70afdc0ee092e74ad928dc9c6e05844ef62a');
  assert.equal(FLOAT_PIGMENT.version, '0.10.5');
  const probe = {
    sourceRequiresGrid: true,
    wasmBuildPass: true,
    wasmGridExecutionPass: true,
    wasmExports: ['fp_probe_grid_second_x'],
    wxWebAssemblyRun: 'not-run'
  };
  assert.equal(classifyFloatPigmentProbe(probe), 'host-wasm-proven-wx-pending');
  assert.equal(classifyFloatPigmentProbe({...probe, wasmGridExecutionPass: false}), 'reject-runtime-path');
  assert.equal(classifyFloatPigmentProbe({...probe, wxWebAssemblyRun: 'pass'}), 'wx-runtime-candidate');
});
