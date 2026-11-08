(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WhippetWallet = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NETWORK = Object.freeze({ name: 'Whippet mainnet', pubKeyHash: 73, scriptHash: 22, wif: 158 });
  const PATH_TEMPLATE = "m/0'/3'/{index}'";
  const NETWORKS = Object.freeze({
    wht: Object.freeze({ network: NETWORK, path: PATH_TEMPLATE, format: 'whippet-seed-v1' }),
    pep: Object.freeze({ network: Object.freeze({ name: 'Pepecoin mainnet', pubKeyHash: 56, scriptHash: 22, wif: 158 }), path: "m/44'/3434'/0'/0/{index}", format: 'pepecoin-seed-v1' }),
  });
  function config(coin = 'wht') {
    if (!Object.hasOwn(NETWORKS, coin)) throw new Error('Choose Pepecoin or Whippet.');
    return NETWORKS[coin];
  }
  function backupCoin(backup) {
    const coin = Object.keys(NETWORKS).find(key => NETWORKS[key].format === backup?.format);
    if (!coin) throw new Error('Unsupported recovery backup.');
    return coin;
  }
  const DEFAULT_COUNT = 200;
  const MAX_COUNT = 1000;

  function normalizePhrase(ethers, phrase) {
    const normalized = String(phrase).normalize('NFKD').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!ethers.utils.isValidMnemonic(normalized)) throw new Error('Enter a valid English BIP39 recovery phrase.');
    return normalized;
  }

  function encodeChecked(ethers, payload) {
    const checksum = ethers.utils.arrayify(ethers.utils.sha256(ethers.utils.sha256(payload))).slice(0, 4);
    return ethers.utils.base58.encode(ethers.utils.concat([payload, checksum]));
  }

  function encodeKey(ethers, privateKey, coin = 'wht') {
    const network = config(coin).network;
    const bytes = ethers.utils.arrayify(privateKey);
    if (bytes.length !== 32) throw new Error('A private key must contain 32 bytes.');
    const publicKey = ethers.utils.computePublicKey(privateKey, true);
    const hash = ethers.utils.ripemd160(ethers.utils.sha256(publicKey));
    return {
      address: encodeChecked(ethers, ethers.utils.concat([[network.pubKeyHash], hash])),
      wif: encodeChecked(ethers, ethers.utils.concat([[network.wif], bytes, [1]])),
      publicKey: publicKey.slice(2),
    };
  }

  function generatePhrase(ethers, words, cryptoSource) {
    if (![12, 24].includes(words)) throw new Error('Choose 12 or 24 words.');
    if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') throw new Error('Secure browser randomness is unavailable.');
    const entropy = new Uint8Array(words === 12 ? 16 : 32);
    cryptoSource.getRandomValues(entropy);
    return ethers.utils.entropyToMnemonic(entropy);
  }

  function derive(ethers, phrase, options = {}) {
    const coin = options.coin ?? 'wht', settings = config(coin);
    const [prefix, suffix] = settings.path.split('{index}');
    const mnemonic = normalizePhrase(ethers, phrase);
    const count = options.count === undefined ? DEFAULT_COUNT : options.count;
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new Error('Choose between 1 and 1000 addresses.');
    const passphrase = options.passphrase === undefined ? '' : String(options.passphrase);
    const branch = ethers.utils.HDNode.fromMnemonic(mnemonic, passphrase).derivePath(prefix.slice(0, -1));
    const wallets = Array.from({ length: count }, (_, index) => {
      const node = branch.derivePath(String(index) + suffix);
      return { index, path: settings.path.replace('{index}', String(index)), ...encodeKey(ethers, node.privateKey, coin) };
    });
    return { format: settings.format, network: settings.network, mnemonic, passphrase,
      derivation: { standard: 'BIP39 + BIP32', pathTemplate: settings.path, compressed: true }, wallets };
  }

  async function deriveAsync(ethers, phrase, options = {}) {
    const coin = options.coin ?? 'wht', settings = config(coin);
    const [prefix, suffix] = settings.path.split('{index}');
    const mnemonic = normalizePhrase(ethers, phrase);
    const count = options.count === undefined ? DEFAULT_COUNT : options.count;
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new Error('Choose between 1 and 1000 addresses.');
    const passphrase = options.passphrase === undefined ? '' : String(options.passphrase);
    const branch = ethers.utils.HDNode.fromMnemonic(mnemonic, passphrase).derivePath(prefix.slice(0, -1));
    const wallets = [];
    for (let index = 0; index < count; index++) {
      if (options.signal?.aborted) throw new Error('Generation cancelled.');
      const node = branch.derivePath(String(index) + suffix);
      wallets.push({ index, path: settings.path.replace('{index}', String(index)), ...encodeKey(ethers, node.privateKey, coin) });
      if ((index + 1) % 25 === 0) {
        options.onProgress?.(index + 1, count);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    if (options.signal?.aborted) throw new Error('Generation cancelled.');
    return { format: settings.format, network: settings.network, mnemonic, passphrase,
      derivation: { standard: 'BIP39 + BIP32', pathTemplate: settings.path, compressed: true }, wallets };
  }

  function validateBackup(backup) {
    const coin = backupCoin(backup), settings = config(coin);
    if (backup.network?.name !== settings.network.name
        || backup.network?.pubKeyHash !== settings.network.pubKeyHash || backup.network?.wif !== settings.network.wif
        || backup.network?.scriptHash !== settings.network.scriptHash || backup.derivation?.compressed !== true
        || backup.derivation?.pathTemplate !== settings.path
        || !Array.isArray(backup.wallets) || typeof backup.passphrase !== 'string') {
      throw new Error('This is not a supported recovery backup.');
    }
    return coin;
  }
  function verifyBackup(recovered, backup) {
    for (let index = 0; index < recovered.wallets.length; index++) {
      const expected = recovered.wallets[index], saved = backup.wallets[index];
      if (!saved || saved.address !== expected.address || saved.wif !== expected.wif || saved.path !== expected.path
          || saved.index !== expected.index || saved.publicKey !== expected.publicKey) {
        throw new Error('The saved keys do not match this recovery phrase and derivation recipe.');
      }
    }
    return recovered;
  }
  function restore(ethers, backup) {
    const coin = validateBackup(backup);
    return verifyBackup(derive(ethers, backup.mnemonic, { coin, count: backup.wallets.length, passphrase: backup.passphrase }), backup);
  }

  async function restoreAsync(ethers, backup, options = {}) {
    const coin = validateBackup(backup);
    return verifyBackup(await deriveAsync(ethers, backup.mnemonic, { ...options, coin, count: backup.wallets.length, passphrase: backup.passphrase }), backup);
  }

  return Object.freeze({ NETWORK, PATH_TEMPLATE, NETWORKS, backupCoin, DEFAULT_COUNT, MAX_COUNT, generatePhrase, normalizePhrase, encodeKey, derive, deriveAsync, restore, restoreAsync });
});
