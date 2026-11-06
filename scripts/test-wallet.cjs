const {spawnSync} = require('node:child_process');
const path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));
for (const name of ['engine', 'receive', 'library', 'transactions', 'network_cache', 'network_consistency', 'discovery', 'sweep', 'sweep_network', 'send_refresh', 'komodo', 'reporting', 'recovery', 'scanner']) {
  const result = spawnSync(process.execPath, [`whippet/tests/${name}.cjs`], {stdio: 'inherit'});
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
