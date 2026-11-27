import {FLOAT_PIGMENT} from '../runtime/float-pigment-pin.mjs';
export {FLOAT_PIGMENT};
export function classifyFloatPigmentProbe(probe) {
  if (!probe?.sourceRequiresGrid) return 'not-required-by-probe';
  if (!probe?.wasmBuildPass || !probe?.wasmGridExecutionPass) return 'reject-runtime-path';
  const required=['FpAbiVersion','FpNodeNew','FpNodeSetGridTemplateColumns','FpNodeCalculate'];
  if (!required.every(name=>probe.wasmExports?.includes(name))) return 'reject-missing-wasm-export';
  return probe.wxWebAssemblyRun === 'pass' ? 'wx-runtime-candidate' : 'host-wasm-proven-wx-pending';
}
