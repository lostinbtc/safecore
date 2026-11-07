// Routes this isolated browser's loopback requests to the NEW checkout only.
// Does not alter the user's existing preview server or browser profile.
const {spawnSync} = require('node:child_process');
const path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));
for (const name of ['disclaimer_ui', 'preferences_ui', 'screen_protection_ui', 'balance_privacy_ui', 'connections_ui', 'navigation_ui', 'browser', 'wallets', 'creation', 'recovery_ui', 'scanner_ui', 'sweep_ui', 'komodo_ui', 'initial_discovery_ui', 'discovery_batches_ui', 'send_picker_ui', 'send_max_ui', 'receive_picker_ui', 'activity_ui', 'live_ui', 'send_refresh_ui', 'reporting_ui', 'delete_wallets', 'wallet_export_ui', 'cache_ui', 'coins', 'icons', 'reset_ui']) {
  console.log(`Running browser suite: ${name}`);
  const result = spawnSync(process.execPath, [`whippet/tests/${name}.cjs`], {stdio: ['inherit', 'inherit', 'pipe'], encoding:'utf8'});
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    // Only disposable fixture tests run here. Make the failure visible in public
    // check annotations too, without needing a maintainer token to download logs.
    if (process.env.GITHUB_ACTIONS) {
      const message = `${name}: ${result.error?.message || result.stderr || 'test failed'}`
        .slice(0, 6000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
      console.log(`::error file=whippet/tests/${name}.cjs::${message}`);
    }
    process.exit(result.status || 1);
  }
}
