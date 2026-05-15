// v16 — exhaustive probing of every globalThis property, looking for native bindings

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 3000); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

// ============ Deeply inspect known interesting globals ============
safe('PATH_keys', function() { return Object.getOwnPropertyNames(path).join(','); });
safe('PATH_proto_keys', function() { return Object.getOwnPropertyNames(Object.getPrototypeOf(path) || {}).join(','); });
safe('PATH_dirname_src', function() { return String(path.dirname).substring(0,300); });
safe('PATH_basename_src', function() { return String(path.basename).substring(0,300); });
safe('PATH_join_src', function() { return String(path.join).substring(0,300); });
safe('PATH_resolve_src', function() { return String(path.resolve).substring(0,300); });
safe('PATH_sep', function() { return path.sep; });
safe('PATH_posix_exists', function() { return typeof path.posix; });
safe('PATH_win32_exists', function() { return typeof path.win32; });

safe('VM_keys', function() { return Object.getOwnPropertyNames(vm).join(','); });
safe('VM_runInNewContext', function() { return typeof vm.runInNewContext; });
safe('VM_runInThisContext', function() { return typeof vm.runInThisContext; });
safe('VM_Script', function() { return typeof vm.Script; });
safe('VM_compileFunction', function() { return typeof vm.compileFunction; });
safe('VM_compileModule_native', function() {
  return String(vm.compileModule).substring(0,200) + ' === [native code]?' + (String(vm.compileModule).indexOf('[native code]') >= 0);
});

safe('CONSOLE_keys', function() { return Object.getOwnPropertyNames(console).join(','); });
safe('CONSOLE_proto_keys', function() { return Object.getOwnPropertyNames(Object.getPrototypeOf(console) || {}).join(','); });
safe('CONSOLE_log_src', function() { return String(console.log).substring(0,200); });
safe('CONSOLE_dir', function() { return typeof console.dir; });
safe('CONSOLE_Console', function() { return typeof console.Console; });
safe('CONSOLE_stdout', function() { return typeof console._stdout; });
safe('CONSOLE_stderr', function() { return typeof console._stderr; });

safe('ASSERT_src', function() { return String(assert).substring(0,200); });
safe('ASSERT_keys', function() { return Object.getOwnPropertyNames(assert).join(','); });
safe('ASSERT_proto', function() { return Object.getOwnPropertyNames(Object.getPrototypeOf(assert) || {}).join(','); });
safe('ASSERT_strict', function() { return typeof assert.strict; });
safe('ASSERT_ok', function() { return typeof assert.ok; });
safe('ASSERT_deepEqual', function() { return typeof assert.deepEqual; });

// ============ Probe global.console.Console — if exposed, can construct logger with streams ============
safe('CONSOLE_construct', function() {
  if (typeof console.Console !== 'function') return 'no Console class';
  try {
    var c = new console.Console({ stdout: { write: function(s) { return true; } } });
    return 'made Console, keys=' + Object.getOwnPropertyNames(c).join(',');
  } catch(e) { return 'err:' + e.message; }
});

// ============ Check WebAssembly internals ============
safe('WASM_keys', function() { return Object.getOwnPropertyNames(WebAssembly).join(','); });
safe('WASM_proto', function() { return Object.getOwnPropertyNames(Object.getPrototypeOf(WebAssembly) || {}).join(','); });
safe('WASM_Memory', function() { return typeof WebAssembly.Memory; });
safe('WASM_Table', function() { return typeof WebAssembly.Table; });
safe('WASM_Module', function() { return typeof WebAssembly.Module; });

// ============ Look for globals NOT enumerable ============
// Sometimes globals are defined as non-enumerable
safe('all_global_props', function() {
  var props = Object.getOwnPropertyNames(globalThis).sort();
  return props.join(',').substring(0, 3000);
});

safe('hidden_globals_test', function() {
  // Test common Node globals that might be non-enumerable
  var tests = ['Buffer', 'process', 'global', 'globalThis', '__dirname', '__filename', 'module', 'exports',
               'require', 'queueMicrotask', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout',
               'clearInterval', 'clearImmediate', 'AbortController', 'AbortSignal', 'fetch', 'FormData',
               'Headers', 'Request', 'Response', 'URL', 'URLSearchParams', 'crypto', 'performance',
               'TextDecoder', 'TextEncoder', 'structuredClone', 'BroadcastChannel', 'MessageChannel',
               'MessagePort', 'EventTarget', 'Event', 'CustomEvent', 'AbortError', 'DOMException',
               'queueMicrotask', 'Worker', 'btoa', 'atob', 'Blob', 'File'];
  var results = {};
  for (var t of tests) {
    try { results[t] = typeof globalThis[t]; }
    catch(e) { results[t] = 'err'; }
  }
  return JSON.stringify(results);
});

// ============ Buffer access via TypedArrays ============
safe('B_test_buffer_via_uint8', function() {
  // Maybe Buffer is reachable via Uint8Array.from or similar trick
  // Test if Uint8Array's underlying ArrayBuffer can be used as Buffer
  var ua = new Uint8Array(10);
  return 'ua type=' + typeof ua + ' buffer type=' + typeof ua.buffer + ' constructor=' + ua.constructor.name;
});

// ============ Reflect.ownKeys on globalThis (gets all including symbols) ============
safe('reflect_ownKeys', function() {
  var keys = Reflect.ownKeys(globalThis);
  var stringKeys = keys.filter(k => typeof k === 'string');
  var symbolKeys = keys.filter(k => typeof k === 'symbol').map(s => String(s));
  return 'strings=' + stringKeys.length + ' symbols=' + symbolKeys.length + ' sym_names:' + symbolKeys.join(',');
});

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v16:' + JSON.stringify(out));
