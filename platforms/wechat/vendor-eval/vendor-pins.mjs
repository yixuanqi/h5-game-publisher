export const FLOAT_PIGMENT = Object.freeze({
  repo: 'wechat-miniprogram/float-pigment',
  sha: '830c70afdc0ee092e74ad928dc9c6e05844ef62a',
  version: '0.10.5',
  license: 'MIT'
});

export function classifyFloatPigmentProbe(probe) {
  if (!probe?.sourceRequiresGrid) return 'not-required-by-probe';
  if (!probe?.wasmBuildPass || !probe?.wasmGridExecutionPass) return 'reject-runtime-path';
  if (!probe?.wasmExports?.includes('fp_probe_grid_second_x')) return 'reject-missing-wasm-export';
  return probe.wxWebAssemblyRun === 'pass' ? 'wx-runtime-candidate' : 'host-wasm-proven-wx-pending';
}
