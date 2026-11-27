import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {snapshot, assertSnapshot, assertDisjoint, gitBlob} from '../../../scripts/source-integrity.mjs';
import {FLOAT_PIGMENT, classifyFloatPigmentProbe} from './vendor-pins.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'platforms/wechat/bootstrap/compatibility.json'), 'utf8'));
const gameCheckout = fs.realpathSync(process.argv[2] || 'upstream');
const vendor = fs.realpathSync(process.argv[3] || 'vendor-float-pigment');
const source = path.join(gameCheckout, 'docs', spec.game);
const work = path.join(root, '.work/wechat-vendor-layout');
const evidence = path.join(work, 'evidence');
const probeDir = path.join(work, 'float-pigment-probe');
fs.mkdirSync(evidence, {recursive: true});
assertDisjoint(gameCheckout, work);
assertDisjoint(vendor, work);

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, {cwd, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
};
const run = (cmd, args, options = {}) => {
  const started = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {...process.env, CARGO_TERM_COLOR: 'never', RUST_BACKTRACE: '1'},
    timeout: options.timeout ?? 12 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024
  });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, [
    '$ ' + cmd + ' ' + args.join(' '),
    r.stdout || '',
    r.stderr || ''
  ].join('\n'));
  return {stdout: r.stdout || '', stderr: r.stderr || '', elapsedMs: Date.now() - started};
};

assert.equal(git(gameCheckout, 'rev-parse', 'HEAD'), spec.sourceSha);
assert.equal(git(gameCheckout, 'status', '--porcelain', '--untracked-files=all', '--', 'docs/' + spec.game), '');
assert.equal(gitBlob(fs.readFileSync(path.join(source, 'src/main.js'))), spec.mainBlob);
assert.equal(git(vendor, 'rev-parse', 'HEAD'), FLOAT_PIGMENT.sha);
const sourceBefore = snapshot(source);

const report = {
  stage: '0.5.2c-float-pigment-wasm-grid',
  result: 'fail',
  framework: git(root, 'rev-parse', 'HEAD'),
  sourceSha: spec.sourceSha,
  sourceIntegrity: 'unknown',
  officialDevTools: 'not-run',
  wxWebAssemblyRun: 'not-run',
  releaseReady: false,
  parityReady: false,
  candidate: {...FLOAT_PIGMENT},
  limitations: [
    'Host Node WebAssembly execution is not WeChat WXWebAssembly evidence.',
    'This probe validates layout-core execution only; DOM/BOM, painting, text shaping and event routing remain separate.',
    'No upstream game source is modified and no production dependency is approved by this probe.'
  ]
};

try {
  const cargoToml = fs.readFileSync(path.join(vendor, 'Cargo.toml'), 'utf8');
  const license = fs.readFileSync(path.join(vendor, 'LICENSE'), 'utf8');
  const version = cargoToml.match(/\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/)?.[1];
  assert.equal(version, FLOAT_PIGMENT.version);
  assert.match(cargoToml, /license\s*=\s*"MIT"/);
  assert.match(license, /Permission is hereby granted/);

  const html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(source, 'styles.css'), 'utf8');
  const saveUi = fs.readFileSync(path.join(source, 'src/ui/hudCore.js'), 'utf8');
  const sourceRequiresGrid =
    /id=["']save-slots-grid["']/.test(html) &&
    /\.save-slots-grid\s*\{[\s\S]{0,500}?display\s*:\s*grid\s*;/m.test(css) &&
    /getElementById\(['"]save-slots-grid['"]\)/.test(saveUi) &&
    /innerHTML\s*=\s*['"]['"]/.test(saveUi);
  assert.equal(sourceRequiresGrid, true, 'Frozen V46.1 dynamic save UI Grid contract was not found');
  report.sourceRequiresGrid = sourceRequiresGrid;
  report.sourceEvidence = {
    dynamicSaveSlots: true,
    cssGrid: true,
    sourceFiles: ['index.html', 'styles.css', 'src/ui/hudCore.js']
  };

  fs.rmSync(probeDir, {recursive: true, force: true});
  fs.mkdirSync(path.join(probeDir, 'src'), {recursive: true});
  const vendorRel = path.relative(probeDir, vendor).split(path.sep).join('/');
  const cargo = `[package]
name = "fp_probe"
version = "0.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
float-pigment-css = { path = "${vendorRel}/float-pigment-css", default-features = false, features = ["std"] }
float-pigment-layout = { path = "${vendorRel}/float-pigment-layout" }
float-pigment-forest = { path = "${vendorRel}/float-pigment-forest" }

[profile.release]
opt-level = "s"
lto = "fat"
codegen-units = 1
panic = "abort"
`;
  const rust = String.raw`use float_pigment_css::{length_num::LengthNum, typing::Display};
use float_pigment_forest::{ChildOperation, Len, Node, StyleSetter};
use float_pigment_forest::ffi::{NodeCalculateLayout, NodeLayoutGetLeft};
use float_pigment_layout::{DefLength, LayoutGridTemplate, LayoutTrackListItem, LayoutTrackSize};

#[no_mangle]
pub unsafe extern "C" fn fp_probe_grid_second_x(width: f32, gap: f32) -> f32 {
    let root_ptr = Node::new_ptr();
    let root = &*root_ptr;
    root.set_display(Display::Grid);
    root.set_width(DefLength::Points(Len::from_f32(width)));
    root.set_column_gap(DefLength::Points(Len::from_f32(gap)));
    root.set_grid_template_columns(LayoutGridTemplate::TrackList(vec![
        LayoutTrackListItem::TrackSize(LayoutTrackSize::Fr(1.0)),
        LayoutTrackListItem::TrackSize(LayoutTrackSize::Fr(1.0)),
        LayoutTrackListItem::TrackSize(LayoutTrackSize::Fr(1.0)),
    ]));
    let a = Node::new_ptr();
    let b = Node::new_ptr();
    let c = Node::new_ptr();
    for child in [a, b, c] {
        (&*child).set_height(DefLength::Points(Len::from_f32(20.0)));
        root.append_child(child);
    }
    NodeCalculateLayout(root_ptr.cast(), width, f32::INFINITY, width, 200.0);
    NodeLayoutGetLeft(b.cast())
}
`;
  fs.writeFileSync(path.join(probeDir, 'Cargo.toml'), cargo);
  fs.writeFileSync(path.join(probeDir, 'src/lib.rs'), rust);

  report.toolchain = {
    rustc: run('rustc', ['--version'], {cwd: probeDir, timeout: 30_000}).stdout.trim(),
    cargo: run('cargo', ['--version'], {cwd: probeDir, timeout: 30_000}).stdout.trim()
  };
  const build = run('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], {
    cwd: probeDir,
    timeout: 18 * 60 * 1000
  });
  report.wasmBuildPass = true;
  report.wasmBuildElapsedMs = build.elapsedMs;

  const wasmPath = path.join(probeDir, 'target/wasm32-unknown-unknown/release/fp_probe.wasm');
  assert.ok(fs.existsSync(wasmPath), 'WASM probe output missing');
  const bytes = fs.readFileSync(wasmPath);
  const module = new WebAssembly.Module(bytes);
  report.wasmImports = WebAssembly.Module.imports(module);
  report.wasmExports = WebAssembly.Module.exports(module).map((x) => x.name);
  report.wasm = {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
  assert.ok(report.wasmExports.includes('fp_probe_grid_second_x'), 'WASM grid probe export missing');

  const instantiated = await WebAssembly.instantiate(bytes, {});
  const width = 300;
  const gap = 9;
  const actualX = instantiated.instance.exports.fp_probe_grid_second_x(width, gap);
  const expectedX = (width - gap * 2) / 3 + gap;
  report.wasmGrid = {width, gap, expectedSecondX: expectedX, actualSecondX: actualX, delta: Math.abs(actualX - expectedX)};
  assert.ok(Number.isFinite(actualX));
  assert.ok(Math.abs(actualX - expectedX) <= 0.05, `Grid mismatch: expected ${expectedX}, got ${actualX}`);
  report.wasmGridExecutionPass = true;

  report.decision = classifyFloatPigmentProbe(report);
  assert.equal(report.decision, 'host-wasm-proven-wx-pending');
  report.result = 'host-wasm-grid-proven';
} catch (e) {
  report.error = String(e.stack || e);
  report.wasmBuildPass ??= false;
  report.wasmGridExecutionPass ??= false;
  report.decision = classifyFloatPigmentProbe(report);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  try {
    assertSnapshot(source, sourceBefore, 'Original source');
    report.sourceIntegrity = 'pass';
  } catch (e) {
    report.sourceIntegrity = 'fail';
    report.result = 'fail';
    report.error = String(e.stack || e);
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(evidence, 'float-pigment-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
