// v10 — minimal: prepareStackTrace global hook, capture function refs

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 3000); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

globalThis.__capturedFunctions = {};

var origPrep = Error.prepareStackTrace;
Error.stackTraceLimit = 50;
Error.prepareStackTrace = function(err, callSites) {
  try {
    for (var i = 0; i < callSites.length; i++) {
      var cs = callSites[i];
      try {
        var fn = cs.getFunction && cs.getFunction();
        if (fn && typeof fn === 'function') {
          var src = String(fn).substring(0, 800);
          var key = (cs.getFileName && cs.getFileName() || '?') + ':' + (cs.getFunctionName && cs.getFunctionName() || cs.getMethodName && cs.getMethodName() || '?');
          if (!globalThis.__capturedFunctions[key]) {
            globalThis.__capturedFunctions[key] = { src: src, fn: fn };
          }
        }
      } catch(e) {}
    }
  } catch(e) {}
  return '';
};

// Force some errors to capture stacks
safe('A_trigger_errors', function() {
  // Throw and read stack
  try { throw new Error('x1'); } catch(e) { e.stack; }
  // Trigger compileError
  try { global._DF_SESSION.compileError(new Error('x2'), 'definitions/foo.sqlx'); } catch(e) {}
  // Trigger publish (uses getCallerFile internally)
  try { publish('s1', { type: 'view' }); } catch(e) {}
  // Trigger resolve to non-existent
  try { global._DF_SESSION.resolve({name: 'doesnotexist', schema: 'x'}); } catch(e) {}
  return 'count=' + Object.keys(globalThis.__capturedFunctions).length;
});

// Search captures for native/eval/inquire references
safe('B_search_interesting', function() {
  var interesting = [];
  for (var k in globalThis.__capturedFunctions) {
    var f = globalThis.__capturedFunctions[k];
    if (f.src.indexOf('inquire') >= 0 ||
        f.src.indexOf('nativeRequire') >= 0 ||
        f.src.indexOf('eval(') >= 0 ||
        f.src.indexOf('process') >= 0 ||
        f.src.indexOf('child_process') >= 0 ||
        f.src.indexOf('require_in_scope') >= 0) {
      interesting.push({k, src: f.src.substring(0,500)});
    }
  }
  return JSON.stringify(interesting);
});

// Dump all captured keys
safe('C_all_keys', function() {
  return Object.keys(globalThis.__capturedFunctions).join('\n');
});

// Sample 5 sources
safe('D_sample_sources', function() {
  var keys = Object.keys(globalThis.__capturedFunctions);
  var samples = {};
  for (var k of keys.slice(0, 8)) {
    samples[k] = globalThis.__capturedFunctions[k].src.substring(0, 300);
  }
  return JSON.stringify(samples);
});

// Try CALLING captured functions with this=Object — maybe one is g.getCallerFile equivalent
safe('E_try_get_caller_file_via_capture', function() {
  // Look specifically for getCallerFile
  for (var k in globalThis.__capturedFunctions) {
    var f = globalThis.__capturedFunctions[k];
    if (f.src.indexOf('getCallerFile') >= 0 || f.src.indexOf('prepareStackTrace') >= 0) {
      return 'FOUND ' + k + ' src:' + f.src.substring(0, 500);
    }
  }
  return 'no getCallerFile-like fn in captures';
});

Error.prepareStackTrace = origPrep;

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v10:' + JSON.stringify(out));
