// v11 — trigger deep bundle errors to capture inner bundle functions

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 3500); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

globalThis.__capt = {};
Error.stackTraceLimit = 100;

// Global hook — capture EVERY function reference from EVERY stack trace
Error.prepareStackTrace = function(err, callSites) {
  try {
    for (var i = 0; i < callSites.length; i++) {
      var cs = callSites[i];
      try {
        var fn = cs.getFunction && cs.getFunction();
        if (!fn || typeof fn !== 'function') continue;
        var fileName = (cs.getFileName && cs.getFileName()) || '?';
        var fnName = (cs.getFunctionName && cs.getFunctionName()) ||
                     (cs.getMethodName && cs.getMethodName()) || '?';
        var src = String(fn);
        // Key by source hash so duplicates by name don't overwrite each other
        var key = fileName + ':' + fnName + ':' + src.length;
        if (!globalThis.__capt[key]) {
          globalThis.__capt[key] = { src: src, fn: fn, fileName: fileName, fnName: fnName };
        }
      } catch(e) {}
    }
  } catch(e) {}
  return '';
};

// ============ Trigger deep errors ============
safe('A_simple_throw', function() {
  try { throw new Error('x'); } catch(e) { e.stack; }
  return Object.keys(globalThis.__capt).length;
});

// Force error DEEP in compile path — mess with action's compile method
safe('B_inject_throw_in_action', function() {
  try {
    var p = publish('deeperr', { type: 'view' });
    p.query('SELECT 1'); // make it valid
    // Now mess with its compile so when session.compile() reaches it, it throws
    p.compile = function() { throw new Error('DEEP_FROM_ACTION_COMPILE'); };
    // Force session compile
    try { global._DF_SESSION.compile(); } catch(e) { e.stack; }
    return 'compiled, captures=' + Object.keys(globalThis.__capt).length;
  } catch(e) { return 'err:' + e.message + ' captures=' + Object.keys(globalThis.__capt).length; }
});

// Force error from deep proto verify
safe('C_force_proto_verify_error', function() {
  try {
    var p2 = publish('verifytest', { type: 'view' });
    p2.query('SELECT 1');
    // Inject a property that fails verifyObjectMatchesProto
    p2.proto.unexpected_field_to_trigger_throw = 'attacker';
    try { global._DF_SESSION.compile(); } catch(e) { e.stack; }
    return 'captures=' + Object.keys(globalThis.__capt).length;
  } catch(e) { return 'err:' + e.message; }
});

// Force resolve error
safe('D_force_resolve_error', function() {
  try { global._DF_SESSION.resolve({name: 'does_not_exist', schema: 'x', database: 'y'}); } catch(e) { e.stack; }
  try {
    // resolveTarget?
    var sql = global._DF_SESSION.compilationSql();
    return 'sql_keys=' + Object.keys(sql).join(',') + ' captures=' + Object.keys(globalThis.__capt).length;
  } catch(e) { return 'err:' + e.message + ' captures=' + Object.keys(globalThis.__capt).length; }
});

// ============ Search captures ============
safe('E_search_native_refs', function() {
  var results = [];
  for (var k in globalThis.__capt) {
    var f = globalThis.__capt[k];
    var s = f.src;
    if (s.indexOf('inquire') >= 0 ||
        s.indexOf('nativeRequire') >= 0 ||
        s.indexOf('eval("quire"') >= 0 ||
        s.indexOf('eval(\'quire\'') >= 0 ||
        s.indexOf('child_process') >= 0 ||
        s.indexOf('require(\'fs\')') >= 0 ||
        s.indexOf('process.env') >= 0) {
      results.push({ k, src_preview: s.substring(0, 400) });
    }
  }
  return JSON.stringify(results);
});

safe('F_all_captured_files', function() {
  var files = {};
  for (var k in globalThis.__capt) {
    var f = globalThis.__capt[k];
    files[f.fileName] = (files[f.fileName] || 0) + 1;
  }
  return JSON.stringify(files);
});

safe('G_sample_names_per_file', function() {
  var fileMap = {};
  for (var k in globalThis.__capt) {
    var f = globalThis.__capt[k];
    if (!fileMap[f.fileName]) fileMap[f.fileName] = [];
    if (fileMap[f.fileName].length < 5) fileMap[f.fileName].push(f.fnName);
  }
  return JSON.stringify(fileMap);
});

safe('H_full_sources_of_interest', function() {
  // Dump full sources of ALL captured functions from bundle (not from our eval_test.js)
  var bundle_fns = [];
  for (var k in globalThis.__capt) {
    var f = globalThis.__capt[k];
    if (f.fileName && f.fileName.indexOf('eval_test') < 0 && f.fileName !== '?') {
      bundle_fns.push({ k, src: f.src.substring(0, 800) });
    }
  }
  return JSON.stringify(bundle_fns.slice(0, 20));
});

// Restore
Error.prepareStackTrace = undefined;

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v11:' + JSON.stringify(out));
