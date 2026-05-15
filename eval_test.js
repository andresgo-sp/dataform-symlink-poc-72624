// v5 — dump bundle source, search for nativeRequire & reachable paths

var out = {};
function safe(k, fn) {
  try {
    var v = fn();
    out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 3000);
  } catch(e) {
    out[k] = 'ERR:' + (e && e.message ? e.message : String(e)).substring(0, 400);
  }
}

// Read bundle source
var BUNDLE = '';
try {
  BUNDLE = restricted_fs.readFile('node_modules/@dataform/core/bundle.js').toString();
  out.BUNDLE_SIZE = BUNDLE.length;
} catch(e) {
  out.BUNDLE_READ_ERR = e.message;
}

if (BUNDLE.length > 0) {
  // ============ TIER A: Find nativeRequire references ============
  safe('A1_nativeRequire_count', function() {
    return (BUNDLE.match(/nativeRequire/g) || []).length;
  });

  safe('A2_nativeRequire_first_5_contexts', function() {
    var results = [];
    var idx = 0;
    while (results.length < 5) {
      idx = BUNDLE.indexOf('nativeRequire', idx);
      if (idx < 0) break;
      results.push({
        offset: idx,
        context: BUNDLE.substring(Math.max(0, idx - 200), idx + 300)
      });
      idx += 13;
    }
    return JSON.stringify(results);
  });

  // ============ TIER B: Find where p (or whatever) is defined ============
  safe('B1_module_p_definition', function() {
    // Webpack pattern: var p = __webpack_require__(N)
    // Or: const p = require(...)
    // Search for things like "var p=" or "let p=" or "const p="
    var patterns = ['var p=', 'var p =', 'let p=', 'const p='];
    var results = [];
    for (var pat of patterns) {
      var idx = BUNDLE.indexOf(pat);
      while (idx >= 0 && results.length < 10) {
        var ctx = BUNDLE.substring(Math.max(0,idx-30), idx + 200);
        if (ctx.indexOf('nativeRequire') >= 0 || ctx.indexOf('require(') >= 0) {
          results.push({ pat, offset: idx, ctx });
        }
        idx = BUNDLE.indexOf(pat, idx + pat.length);
      }
    }
    return JSON.stringify(results.slice(0, 5));
  });

  // ============ TIER C: Find exports related to nativeRequire ============
  safe('C1_exports_nativeRequire', function() {
    var pat = /exports\.nativeRequire/g;
    var matches = BUNDLE.match(pat);
    if (!matches) return 'no exports.nativeRequire';
    var idx = BUNDLE.indexOf('exports.nativeRequire');
    return BUNDLE.substring(Math.max(0, idx - 100), idx + 600);
  });

  safe('C2_module_exports_block_containing_nativeRequire', function() {
    // Find the module that exports nativeRequire
    var idx = BUNDLE.search(/exports\.nativeRequire\s*=/);
    if (idx < 0) return 'not_found';
    // Walk back to find module start
    var start = Math.max(0, idx - 1000);
    var end = Math.min(BUNDLE.length, idx + 600);
    return BUNDLE.substring(start, end);
  });

  // ============ TIER D: Find the actual nativeRequire implementation ============
  safe('D1_native_require_func', function() {
    // Look for function nativeRequire(... or nativeRequire: function or nativeRequire = function
    var patterns = [
      /function\s+nativeRequire\s*\(/,
      /nativeRequire\s*:\s*function/,
      /nativeRequire\s*=\s*function/,
      /nativeRequire\s*=\s*\(/,
      /nativeRequire\s*\(\s*[a-zA-Z_$]/,
    ];
    var results = [];
    for (var p of patterns) {
      var m = BUNDLE.match(p);
      if (m) {
        var idx = BUNDLE.indexOf(m[0]);
        results.push({
          pat: p.toString(),
          ctx: BUNDLE.substring(Math.max(0, idx - 100), idx + 500)
        });
      }
    }
    return JSON.stringify(results);
  });

  // ============ TIER E: How is `p` resolved in core.main? Find specific instance ============
  safe('E1_core_main_full', function() {
    // Find 'mainWithVersionCheck' definition first as anchor
    var idx = BUNDLE.indexOf('function mainWithVersionCheck');
    if (idx < 0) idx = BUNDLE.indexOf('mainWithVersionCheck(a){');
    if (idx >= 0) {
      // Walk back to find module init / closure context
      var start = Math.max(0, idx - 2500);
      return BUNDLE.substring(start, idx + 200);
    }
    return 'not found';
  });

  // ============ TIER F: Search for getCallerFile / readWorkflowSettings (g, f from compile()) ============
  safe('F1_readWorkflowSettings', function() {
    var idx = BUNDLE.indexOf('readWorkflowSettings');
    if (idx < 0) return 'not_found';
    return BUNDLE.substring(Math.max(0, idx - 200), idx + 800);
  });

  safe('F2_getCallerFile', function() {
    var idx = BUNDLE.indexOf('getCallerFile');
    if (idx < 0) return 'not_found';
    return BUNDLE.substring(Math.max(0, idx - 200), idx + 800);
  });

  // ============ TIER G: Webpack module map / IDs ============
  safe('G1_webpack_pattern', function() {
    // Look for webpack module registration patterns
    var m1 = BUNDLE.match(/__webpack_require__/g);
    var m2 = BUNDLE.match(/\bclasses\$jscomp\$inline/g);
    return 'webpack_require_count=' + (m1 ? m1.length : 0) + ' jscomp_inline=' + (m2 ? m2.length : 0);
  });

  // ============ TIER H: Find ALL globals exposed by the bundle ============
  safe('H1_globalThis_assignments', function() {
    // Find r.X = or global.X = or globalThis.X = assignments
    var pat = /global(?:This)?\.([a-zA-Z_$][\w$]*)\s*=/g;
    var matches = new Set();
    var m;
    while ((m = pat.exec(BUNDLE)) !== null && matches.size < 50) {
      matches.add(m[1]);
    }
    return [...matches].join(',');
  });

  safe('H2_r_assignments', function() {
    // r.X = pattern (single-letter aliases for global)
    var pat = /\br\.([a-zA-Z_$][\w$]*)\s*=/g;
    var counts = {};
    var m;
    while ((m = pat.exec(BUNDLE)) !== null) {
      counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,30).map(x=>x[0]+'='+x[1]).join(',');
  });
}

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v5:' + JSON.stringify(out));
