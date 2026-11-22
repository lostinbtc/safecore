// Routes this isolated browser's loopback requests to the NEW checkout only.
// Does not alter the user's existing preview server or browser profile.
const {spawnSync} = require('node:child_process');
const path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));
console.log('Running browser suite: recovery_keys_ui');
const recoveryKeys = spawnSync(process.execPath, ['whippet/tests/recovery_keys_ui.cjs'], {stdio:['inherit','inherit','pipe'],encoding:'utf8'});
if(recoveryKeys.stderr)process.stderr.write(recoveryKeys.stderr);
if(recoveryKeys.error || recoveryKeys.status !== 0){
  if(process.env.GITHUB_ACTIONS){
    // Source location only; never put key values or assertion payloads in annotations.
    const line=recoveryKeys.stderr?.match(/recovery_keys_ui\.cjs:(\d+):/)?.[1]||'1';
    console.log(`::error file=whippet/tests/recovery_keys_ui.cjs,line=${line}::Recovery-key UI test failed. See the browser test step for details.`);
  }
  process.exit(recoveryKeys.status || 1);
}
const utilityControls = spawnSync(process.execPath, ['whippet/tests/utility_controls_ui.cjs'], {stdio: 'inherit'});
if (utilityControls.error || utilityControls.status !== 0) process.exit(utilityControls.status || 1);
const activityVisibility = spawnSync(process.execPath, ['whippet/tests/activity_visibility_ui.cjs'], {stdio: 'inherit'});
if (activityVisibility.error || activityVisibility.status !== 0) process.exit(activityVisibility.status || 1);
const assetDetail = spawnSync(process.execPath, ['whippet/tests/asset_detail_ui.cjs'], {stdio: 'inherit'});
if (assetDetail.error || assetDetail.status !== 0) process.exit(assetDetail.status || 1);
const priceResilience = spawnSync(process.execPath, ['whippet/tests/price_resilience_ui.cjs'], {stdio: 'inherit'});
if (priceResilience.error || priceResilience.status !== 0) process.exit(priceResilience.status || 1);
const recovery = spawnSync(process.execPath, ['recovery/ui-tests.cjs'], {stdio: 'inherit'});
if (recovery.error || recovery.status !== 0) process.exit(recovery.status || 1);
const coinDefaults = spawnSync(process.execPath, ['whippet/tests/coin_defaults_ui.cjs'], {stdio: 'inherit'});
if (coinDefaults.error || coinDefaults.status !== 0) process.exit(coinDefaults.status || 1);
for (const name of ['all_coin_fee_ui', 'overview_updates_ui', 'layer1_ui', 'disclaimer_ui', 'preferences_ui', 'screen_protection_ui', 'device_storage_ui', 'balance_privacy_ui', 'connections_ui', 'shibacoin_ui', 'bellscoin_ui', 'dingocoin_ui', 'bonkcoin_ui', 'catcoin_ui', 'flopcoin_ui', 'litecoin_ui', 'dogecoin_ui', 'bitcoin_ui', 'bitcoin_send_ui', 'automatic_fee_ui', 'public_cache_ui', 'fee_sweep_ui', 'navigation_ui', 'browser', 'wallets', 'creation', 'recovery_copy_ui', 'recovery_ui', 'scanner_ui', 'sweep_ui', 'komodo_ui', 'initial_discovery_ui', 'discovery_batches_ui', 'send_picker_ui', 'send_max_ui', 'one_coin_fee_ui', 'receive_picker_ui', 'activity_ui', 'live_ui', 'send_refresh_ui', 'reporting_ui', 'delete_wallets', 'wallet_export_ui', 'cache_ui', 'coins', 'icons', 'reset_ui']) {
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
