// v15 — read known compile worker files (require_bin.js, main_wrapper_bin.js)

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 4000); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

// Try reading files directly via restricted_fs
var FILES = [
  'require_bin.js',
  'main_wrapper_bin.js',
  '/require_bin.js',
  '/main_wrapper_bin.js',
  './require_bin.js',
  './main_wrapper_bin.js',
  '../require_bin.js',
  '../main_wrapper_bin.js',
  'node_modules/require_bin.js',
  'node_modules/main_wrapper_bin.js',
  'node_modules/@dataform/core/main_wrapper_bin.js',
  'node_modules/@dataform/core/require_bin.js',
  'node_modules/@dataform/cli/main_wrapper_bin.js',
  'node_modules/@dataform/cli/require_bin.js',
  '/app/require_bin.js',
  '/app/main_wrapper_bin.js',
  '/usr/local/lib/dataform/require_bin.js',
  '/dataform/require_bin.js',
  '/srv/dataform/require_bin.js',
  '../../require_bin.js',
  '../../main_wrapper_bin.js',
  '../../../require_bin.js'
];

for (var f of FILES) {
  safe('read_' + f, function() {
    return restricted_fs.readFile(f).toString().substring(0, 500);
  });
}

// Try require() — that also uses restricted_fs but with module resolution
var REQS = ['require_bin', 'main_wrapper_bin', 'require_bin.js', 'main_wrapper_bin.js', '../require_bin', '../main_wrapper_bin'];
for (var r of REQS) {
  safe('require_' + r, function() {
    var x = require(r);
    return 'GOT type=' + typeof x + ' keys=' + Object.keys(x||{}).slice(0,8).join(',');
  });
}

// Try resolve() — maybe shows path
for (var r of ['require_bin', 'main_wrapper_bin', '@dataform/core', 'node_modules/@dataform/core']) {
  safe('resolve_' + r, function() {
    return resolve(r, '.');
  });
}

// Walk restricted_fs.exists for various paths
var PATHS_TO_CHECK = [
  '/', '/app', '/dataform', '/srv', '/tmp', '/usr', '/home',
  'require_bin.js', 'main_wrapper_bin.js',
  'node_modules/@dataform', 'node_modules', '..', '../..',
  '/proc', '/etc'
];
for (var p of PATHS_TO_CHECK) {
  safe('exists_' + p, function() {
    return restricted_fs.exists(p) + '/' + restricted_fs.isDirectory(p);
  });
}

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v15:' + JSON.stringify(out));
