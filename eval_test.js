// v13 — dump EVERY callsite raw, look for inlined or anonymous bundle frames

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 3500); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

globalThis.__allFrames = [];
Error.stackTraceLimit = Infinity;

Error.prepareStackTrace = function(err, callSites) {
  try {
    var frame = [];
    frame.push('TAG:' + err.message);
    for (var i = 0; i < callSites.length; i++) {
      var cs = callSites[i];
      try {
        var info = {
          i: i,
          file: cs.getFileName && cs.getFileName(),
          fn_name: cs.getFunctionName && cs.getFunctionName(),
          method: cs.getMethodName && cs.getMethodName(),
          type: cs.getTypeName && cs.getTypeName(),
          line: cs.getLineNumber && cs.getLineNumber(),
          col: cs.getColumnNumber && cs.getColumnNumber(),
          isEval: cs.isEval && cs.isEval(),
          isNative: cs.isNative && cs.isNative(),
          isToplevel: cs.isToplevel && cs.isToplevel(),
          isConstructor: cs.isConstructor && cs.isConstructor(),
          isAsync: cs.isAsync && cs.isAsync(),
          evalOrigin: cs.getEvalOrigin && cs.getEvalOrigin(),
          hasFn: !!(cs.getFunction && cs.getFunction()),
        };
        if (info.hasFn) {
          var f = cs.getFunction();
          info.fn_src_head = String(f).substring(0, 120);
          // Store global for later
          var key = (info.file || '?') + ':' + (info.fn_name || info.method || '?') + ':' + (cs.getLineNumber && cs.getLineNumber());
          globalThis['__fn_' + i + '_' + err.message] = f;
        }
        frame.push(info);
      } catch(e) { frame.push({err: e.message.substring(0,80)}); }
    }
    globalThis.__allFrames.push(frame);
  } catch(e) {}
  return '';
};

// ============ Force errors with distinct TAGs ============
safe('A_basic_throw', function() {
  try { throw new Error('TAG_BASIC'); } catch(e) { e.stack; }
  return 'ok';
});

safe('B_compile_with_proxy_proto', function() {
  // Make a Proxy that throws when bundle accesses projectConfig.warehouse
  var origPC = global._DF_SESSION.projectConfig;
  global._DF_SESSION.projectConfig = new Proxy(origPC, {
    get: function(target, prop) {
      if (prop === 'warehouse') throw new Error('TAG_WAREHOUSE_GETTER');
      return target[prop];
    }
  });
  try { global._DF_SESSION.compile(); } catch(e) { e.stack; }
  // restore
  global._DF_SESSION.projectConfig = origPC;
  return 'ok';
});

safe('C_publish_with_throwing_target', function() {
  // Override projectConfig.assertionSchema getter to throw
  var orig = global._DF_SESSION.projectConfig.assertionSchema;
  Object.defineProperty(global._DF_SESSION.projectConfig, 'assertionSchema', {
    get: function() { throw new Error('TAG_AS_GETTER'); },
    configurable: true
  });
  try { assert('throw_test', 'SELECT 1'); } catch(e) { e.stack; }
  // restore
  Object.defineProperty(global._DF_SESSION.projectConfig, 'assertionSchema', { value: orig, writable: true, configurable: true });
  return 'ok';
});

safe('D_compile_internal_throw_via_action_target', function() {
  var p = publish('throwtgt', { type: 'view' });
  p.query('SELECT 1');
  // Make proto.target throw when accessed during compile
  Object.defineProperty(p.proto, 'target', {
    get: function() { throw new Error('TAG_TARGET_GETTER'); },
    configurable: true
  });
  try { global._DF_SESSION.compile(); } catch(e) { e.stack; }
  return 'ok';
});

// ============ Inspect all collected frames ============
safe('E_dump_frame_count', function() {
  return 'total_stacks=' + globalThis.__allFrames.length + ' total_frames=' + globalThis.__allFrames.reduce((s,f) => s + f.length, 0);
});

safe('F_dump_all_frames', function() {
  return JSON.stringify(globalThis.__allFrames).substring(0, 3000);
});

// Search frame metadata for `?` file (bundle anonymous)
safe('G_bundle_frames_search', function() {
  var bundleFrames = [];
  for (var stack of globalThis.__allFrames) {
    for (var f of stack) {
      if (f && f.file && f.file !== 'eval_test.js' && f.file !== '?' && f.fn_src_head) {
        bundleFrames.push(f);
      }
    }
  }
  return JSON.stringify(bundleFrames.slice(0, 20));
});

// Walk a captured function's full source looking for inquire-like patterns
safe('H_grab_g_call_stack_via_caller', function() {
  // Find the g function reference
  var gFn = null;
  for (var k in globalThis) {
    if (k.startsWith('__fn_') && globalThis[k] && String(globalThis[k]).indexOf('vm.compileModule') >= 0) {
      gFn = globalThis[k];
      break;
    }
  }
  if (!gFn) return 'no g';
  // Try to call g with reserved/special paths that might trigger different errors
  var attempts = {};
  for (var p of ['', '.', '/', '..', 'foo\x00bar', 'node_modules/protobufjs/minimal', '../node_modules/protobufjs/minimal', './node_modules/protobufjs', '../../node_modules/protobufjs', 'node_modules/@dataform/core/build/some-fake']) {
    try {
      var r = gFn(p);
      attempts[p] = 'GOT keys=' + Object.keys(r||{}).slice(0,5).join(',');
    } catch(e) {
      attempts[p] = 'err:' + e.message.substring(0,80);
    }
  }
  return JSON.stringify(attempts);
});

Error.prepareStackTrace = undefined;

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v13:' + JSON.stringify(out));
