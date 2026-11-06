(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const engine = window.WhippetWallet;
  const formats = window.WhippetFormats;
  let current = null, showing = false, operation = 0, controller = null, pendingBackup = null, fileSelection = 0;
  function status(message, error = false) {
    byId('status').textContent = message;
    byId('status').dataset.error = String(error);
  }
  function setBusy(busy) {
    for (const id of ['words', 'count', 'generate', 'phrase', 'passphrase', 'derive', 'restore', 'backup-password', 'unlock-backup']) byId(id).disabled = busy;
    byId('cancel-generation').hidden = !busy;
    if (busy) {
      byId('phrase-suggestions').hidden = true;
      byId('phrase').setAttribute('aria-expanded', 'false');
      byId('phrase').removeAttribute('aria-activedescendant');
    }
  }
  function cancelOperation() {
    operation++; controller?.abort(); controller = null; setBusy(false);
  }
  function forgetResults() {
    current = null; showing = false;
    byId('wallets').replaceChildren(); byId('results').hidden = true;
    byId('reveal').textContent = 'Show private keys'; byId('reveal').setAttribute('aria-pressed', 'false');
  }
  function render(bundle) {
    forgetResults(); current = bundle;
    const fragment = document.createDocumentFragment();
    for (const wallet of bundle.wallets) {
      const article = document.createElement('article'); article.className = 'wallet';
      const title = document.createElement('h3'); title.textContent = 'Address ' + (wallet.index + 1) + ' · ' + wallet.path;
      const address = document.createElement('code'); address.className = 'address'; address.textContent = wallet.address;
      const key = document.createElement('code'); key.className = 'key'; key.hidden = true;
      const label = document.createElement('small'); label.textContent = 'Private key · WIF';
      const value = document.createElement('span'); value.textContent = wallet.wif;
      key.append(label, value); article.append(title, address, key); fragment.append(article);
    }
    byId('wallets').append(fragment); byId('total').textContent = bundle.wallets.length + ' addresses'; byId('results').hidden = false;
  }
  async function action(callback, message = 'Deriving keys locally…') {
    cancelOperation(); const token = operation;
    controller = new AbortController(); const signal = controller.signal;
    forgetResults(); setBusy(true); status(message);
    const options = { signal, onProgress: (done, total) => { if (token === operation) status(`Deriving keys locally: ${done} / ${total}…`); } };
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      const bundle = await callback(options);
      if (token !== operation || signal.aborted) return false;
      byId('phrase').value = bundle.mnemonic; byId('passphrase').value = bundle.passphrase;
      byId('count').value = String(bundle.wallets.length);
      const length = bundle.mnemonic.split(' ').length;
      if ([12, 24].includes(length)) byId('words').value = String(length);
      render(bundle); status('Whippet keys derived locally. Download a private backup to keep the recovery recipe.');
      return true;
    } catch (error) {
      if (token === operation) { forgetResults(); status(error.message, true); }
      return false;
    } finally { if (token === operation) { controller = null; setBusy(false); } }
  }
  function derive(options) {
    return engine.deriveAsync(window.ethers, byId('phrase').value, {
      ...options, count: Number(byId('count').value), passphrase: byId('passphrase').value,
    });
  }
  byId('generate').addEventListener('click', () => action(options => {
    byId('phrase').value = engine.generatePhrase(window.ethers, Number(byId('words').value), window.crypto);
    return derive(options);
  }));
  byId('derive').addEventListener('click', () => action(derive));
  for (const id of ['phrase', 'passphrase', 'count']) byId(id).addEventListener('input', () => {
    fileSelection++; cancelOperation(); forgetResults(); status('Inputs changed. Derive keys to update the address list.');
  });
  byId('cancel-generation').addEventListener('click', () => { cancelOperation(); forgetResults(); status('Generation cancelled.'); });
  byId('reveal').addEventListener('click', () => {
    showing = !showing;
    for (const key of document.querySelectorAll('.key')) key.hidden = !showing;
    byId('reveal').setAttribute('aria-pressed', String(showing)); byId('reveal').textContent = showing ? 'Hide private keys' : 'Show private keys';
  });
  function download(body, type, filename) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  byId('download').addEventListener('click', () => {
    if (!current) return;
    try { download(JSON.stringify(formats.exportJSON(window.ethers, window.WalletEngine, window.crypto, current), null, 2) + '\n', 'application/json', 'whippet-private-backup.json'); }
    catch (error) { status(error.message, true); }
  });
  byId('download-text').addEventListener('click', () => { if (current) download(formats.exportText(current), 'text/plain;charset=utf-8', 'whippet-private-keys.txt'); });
  byId('download-address-text').addEventListener('click', () => { if (current) download(formats.exportAddressText(current), 'text/plain;charset=utf-8', 'whippet-addresses-and-private-keys.txt'); });
  byId('download-csv').addEventListener('click', () => { if (current) download(formats.exportCSV(current), 'text/csv;charset=utf-8', 'whippet-addresses-and-private-keys.csv'); });
  async function importBackup(backup, password = '') {
    const count = Number(byId('count').value);
    const restored = await action(options => formats.importJSON(window.ethers, engine, window.WalletEngine,
      window.crypto, backup, { ...options, count, password }), 'Restoring and verifying the private backup locally…');
    if (restored) status('Private backup restored and every displayed address and key verified.');
    return restored;
  }
  byId('restore').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; const selection = ++fileSelection;
    try {
      if (!file) return;
      cancelOperation(); forgetResults();
      if (file.size > 1000000) throw new Error('The selected backup is too large.');
      const backup = JSON.parse(await file.text());
      if (selection !== fileSelection) return;
      if (backup?.format === window.WalletEngine.FORMAT) {
        window.WalletEngine.validateEnvelope(backup);
        pendingBackup = backup; byId('backup-error').textContent = ''; byId('backup-password').value = '';
        byId('backup-password-dialog').showModal(); byId('backup-password').focus();
      } else await importBackup(backup);
    } catch (error) { if (selection === fileSelection) { forgetResults(); status(error.message, true); } }
  });
  function closeBackup() {
    pendingBackup = null; byId('backup-password').value = ''; byId('backup-error').textContent = ''; byId('backup-password-dialog').close();
  }
  byId('backup-password-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!pendingBackup) return;
    const backup = pendingBackup, password = byId('backup-password').value;
    byId('backup-password').value = ''; byId('backup-error').textContent = '';
    if (await importBackup(backup, password)) closeBackup();
    else if (pendingBackup) { byId('backup-error').textContent = 'Unable to unlock this backup. Check its wallet password.'; byId('backup-password').focus(); }
  });
  byId('cancel-backup').addEventListener('click', () => { cancelOperation(); closeBackup(); });
  byId('backup-password-dialog').addEventListener('cancel', () => { cancelOperation(); pendingBackup = null; byId('backup-password').value = ''; });
  byId('clear').addEventListener('click', () => {
    fileSelection++; cancelOperation(); forgetResults(); byId('phrase').value = ''; byId('passphrase').value = ''; status('Keys cleared from the page.');
  });
  window.addEventListener('pagehide', () => {
    fileSelection++; cancelOperation(); forgetResults(); byId('phrase').value = ''; byId('passphrase').value = '';
    pendingBackup = null; byId('backup-password').value = '';
    if (byId('backup-password-dialog').open) byId('backup-password-dialog').close();
  });
})();
