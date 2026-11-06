/* Generator exports and the existing Whippet/SafeCore backup contract. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WhippetFormats = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function exportJSON(ethers, walletEngine, crypto, bundle) {
    const recipe = walletEngine.recipe(ethers, bundle.mnemonic, bundle.passphrase);
    return { ...walletEngine.unprotected(crypto, recipe), whippetGenerator: bundle };
  }
  async function importJSON(ethers, generator, walletEngine, crypto, backup, options = {}) {
    if (backup?.format === 'whippet-seed-v1') return generator.restoreAsync(ethers, backup, options);
    walletEngine.validateEnvelope(backup);
    const recipe = walletEngine.validateRecipe(ethers, await walletEngine.decrypt(crypto, backup, options.password || ''));
    if (backup.whippetGenerator) {
      const bundle = await generator.restoreAsync(ethers, backup.whippetGenerator, options);
      if (bundle.mnemonic !== recipe.mnemonic || bundle.passphrase !== recipe.passphrase) {
        throw new Error('The wallet recipe and saved generator keys do not match.');
      }
      return bundle;
    }
    return generator.deriveAsync(ethers, recipe.mnemonic, { ...options, passphrase: recipe.passphrase });
  }
  function exportText(bundle) {
    return bundle.wallets.map(wallet => wallet.wif).join('\n') + '\n';
  }
  function exportAddressText(bundle) {
    return bundle.wallets.map(wallet => `Address ${wallet.index + 1} · ${wallet.path}\nAddress: ${wallet.address}\nPrivate key (WIF): ${wallet.wif}`).join('\n\n') + '\n';
  }
  function exportCSV(bundle) {
    const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
    const rows = [['address_number', 'path', 'address', 'public_key', 'private_key_wif'],
      ...bundle.wallets.map(wallet => [wallet.index + 1, wallet.path, wallet.address, wallet.publicKey, wallet.wif])];
    return rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
  }
  return Object.freeze({ exportJSON, importJSON, exportText, exportAddressText, exportCSV });
});
