// v14 — lightweight raw callsite dump; no proxies blowing memory

var out = {};
function safe(k, fn) {
  try { var v = fn(); out[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 4000); }
  catch(e) { out[k] = 'ERR:' + (e.message || String(e)).substring(0, 400); }
}

globalThis.__allFrames = [];
Error.stackTraceLimit = 100;

Error.prepareStackTrace = function(err, callSites) {
  try {
    var frame = ['TAG:' + (err.message ? err.message.substring(0,40) : '?')];
    for (var i = 0; i < callSites.length; i++) {
      var cs = callSites[i];
      try {
        var info = {
          file: cs.getFileName && cs.getFileName(),
          fn: cs.getFunctionName && cs.getFunctionName(),
          line: cs.getLineNumber && cs.getLineNumber()
        };
        var f = cs.getFunction && cs.getFunction();
        if (f) {
          info.fn_src_head = String(f).substring(0, 150);
        } else {
          info.no_fn = true;
        }
        frame.push(info);
      } catch(e) {}
    }
    globalThis.__allFrames.push(frame);
  } catch(e) {}
  return '';
};

// ============ Trigger throws WITHOUT blowing memory ============
safe('A', function() {
  // Simple throws
  try { throw new Error('TAG_A1'); } catch(e) { e.stack; }
  try { publish('p1',{type:'view'}); } catch(e) {}
  try { operate('o1','select 1'); } catch(e) {}
  try { assert('a1','select 1'); } catch(e) {}
  try { global._DF_SESSION.resolve({name:'no',schema:'s'}); } catch(e) { e.stack; }
  try { global._DF_SESSION.compileError(new Error('TAG_CE'), null); } catch(e) {}
  // Force compile() — but DON'T proxy projectConfig
  try { global._DF_SESSION.compile(); } catch(e) { e.stack; }
  return 'errs done, stacks=' + globalThis.__allFrames.length;
});

safe('B_dump_all', function() {
  return JSON.stringify(globalThis.__allFrames);
});

// Find bundle-internal frames (not eval_test.js)
safe('C_bundle_frames_only', function() {
  var unique = {};
  for (var stack of globalThis.__allFrames) {
    for (var f of stack) {
      if (typeof f === 'string') continue;
      if (f.file && f.file !== 'eval_test.js' && f.fn_src_head) {
        var k = f.file + ':' + f.fn + ':' + f.line;
        unique[k] = f;
      }
    }
  }
  return JSON.stringify(unique);
});

Error.prepareStackTrace = undefined;

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
throw new Error('PROBE_v14:' + JSON.stringify(out));
