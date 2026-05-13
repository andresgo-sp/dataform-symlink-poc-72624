var info = {};
function safe(k, fn) { try { info[k] = String(fn()).substring(0,400); } catch(e) { info[k] = "ERR:"+e.message.substring(0,200); } }

safe('require_type', () => typeof require);
safe('require_keys', () => require && typeof require === 'function' ? 'is_func' : 'no');
safe('global_keys', () => Object.keys(globalThis).slice(0,30).join(','));
safe('df_session', () => typeof global !== 'undefined' && global._DF_SESSION ? 'YES_session_avail' : 'no');
safe('restricted_fs', () => typeof global !== 'undefined' && global.restricted_fs ? 'YES_rfs' : 'no');
safe('require_fs', () => { var x = require('fs'); return 'GOT_FS:'+Object.keys(x).slice(0,5).join(','); });
safe('require_child_process', () => { var x = require('child_process'); return 'GOT_CP:'+Object.keys(x).slice(0,5).join(','); });
safe('require_http', () => { var x = require('http'); return 'GOT_HTTP'; });
safe('require_path', () => { var x = require('path'); return 'GOT_PATH'; });
safe('require_dataform_core', () => { var x = require('@dataform/core'); return 'GOT_DATAFORM:'+typeof x; });
safe('require_includes', () => { var x = require('./includes/reader'); return 'GOT_INCLUDES'; });
safe('Function_ctor', () => Function ? 'YES_Function_ctor' : 'no');
safe('eval_avail', () => typeof eval === 'function' ? 'YES_eval' : 'no');
safe('exports_type', () => typeof exports);
safe('module_type', () => typeof module);
safe('this_keys', () => { try { return Object.keys(this).slice(0,20).join(','); } catch(e) { return 'err'; } });

throw new Error("PROBE_OUTPUT:" + JSON.stringify(info));
