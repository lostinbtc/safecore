(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WhippetWallet = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NETWORK = Object.freeze({ name: 'Whippet mainnet', pubKeyHash: 73, scriptHash: 22, wif: 158 });
  const PATH_TEMPLATE = "m/0'/3'/{index}'";
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

  function encodeKey(ethers, privateKey) {
    const bytes = ethers.utils.arrayify(privateKey);
    if (bytes.length !== 32) throw new Error('A private key must contain 32 bytes.');
    const publicKey = ethers.utils.computePublicKey(privateKey, true);
    const hash = ethers.utils.ripemd160(ethers.utils.sha256(publicKey));
    return {
      address: encodeChecked(ethers, ethers.utils.concat([[NETWORK.pubKeyHash], hash])),
      wif: encodeChecked(ethers, ethers.utils.concat([[NETWORK.wif], bytes, [1]])),
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
    const mnemonic = normalizePhrase(ethers, phrase);
    const count = options.count === undefined ? DEFAULT_COUNT : options.count;
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new Error('Choose between 1 and 1000 addresses.');
    const passphrase = options.passphrase === undefined ? '' : String(options.passphrase);
    const branch = ethers.utils.HDNode.fromMnemonic(mnemonic, passphrase).derivePath("m/0'/3'");
    const wallets = Array.from({ length: count }, (_, index) => {
      const node = branch.derivePath(String(index) + "'");
      return { index, path: PATH_TEMPLATE.replace('{index}', String(index)), ...encodeKey(ethers, node.privateKey) };
    });
    return { format: 'whippet-seed-v1', network: NETWORK, mnemonic, passphrase,
      derivation: { standard: 'BIP39 + BIP32', pathTemplate: PATH_TEMPLATE, compressed: true }, wallets };
  }

  async function deriveAsync(ethers, phrase, options = {}) {
    const mnemonic = normalizePhrase(ethers, phrase);
    const count = options.count === undefined ? DEFAULT_COUNT : options.count;
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new Error('Choose between 1 and 1000 addresses.');
    const passphrase = options.passphrase === undefined ? '' : String(options.passphrase);
    const branch = ethers.utils.HDNode.fromMnemonic(mnemonic, passphrase).derivePath("m/0'/3'");
    const wallets = [];
    for (let index = 0; index < count; index++) {
      if (options.signal?.aborted) throw new Error('Generation cancelled.');
      const node = branch.derivePath(String(index) + "'");
      wallets.push({ index, path: PATH_TEMPLATE.replace('{index}', String(index)), ...encodeKey(ethers, node.privateKey) });
      if ((index + 1) % 25 === 0) {
        options.onProgress?.(index + 1, count);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    if (options.signal?.aborted) throw new Error('Generation cancelled.');
    return { format: 'whippet-seed-v1', network: NETWORK, mnemonic, passphrase,
      derivation: { standard: 'BIP39 + BIP32', pathTemplate: PATH_TEMPLATE, compressed: true }, wallets };
  }

  function restore(ethers, backup) {
    if (!backup || backup.format !== 'whippet-seed-v1'
        || backup.network?.pubKeyHash !== NETWORK.pubKeyHash || backup.network?.wif !== NETWORK.wif
        || backup.network?.scriptHash !== NETWORK.scriptHash || backup.derivation?.compressed !== true
        || backup.derivation?.pathTemplate !== PATH_TEMPLATE
        || !Array.isArray(backup.wallets) || typeof backup.passphrase !== 'string') {
      throw new Error('This is not a supported Whippet seed backup.');
    }
    const recovered = derive(ethers, backup.mnemonic, { count: backup.wallets.length, passphrase: backup.passphrase });
    for (let index = 0; index < recovered.wallets.length; index++) {
      const expected = recovered.wallets[index], saved = backup.wallets[index];
      if (saved.address !== expected.address || saved.wif !== expected.wif || saved.path !== expected.path
          || saved.index !== expected.index || saved.publicKey !== expected.publicKey) {
        throw new Error('The saved keys do not match this recovery phrase and derivation recipe.');
      }
    }
    return recovered;
  }

  async function restoreAsync(ethers, backup, options = {}) {
    if (!backup || backup.format !== 'whippet-seed-v1'
        || backup.network?.pubKeyHash !== NETWORK.pubKeyHash || backup.network?.wif !== NETWORK.wif
        || backup.network?.scriptHash !== NETWORK.scriptHash || backup.derivation?.compressed !== true
        || backup.derivation?.pathTemplate !== PATH_TEMPLATE || !Array.isArray(backup.wallets)
        || typeof backup.passphrase !== 'string') throw new Error('This is not a supported Whippet seed backup.');
    const recovered = await deriveAsync(ethers, backup.mnemonic, { ...options, count: backup.wallets.length, passphrase: backup.passphrase });
    for (let index = 0; index < recovered.wallets.length; index++) {
      const expected = recovered.wallets[index], saved = backup.wallets[index];
      if (saved.address !== expected.address || saved.wif !== expected.wif || saved.path !== expected.path
          || saved.index !== expected.index || saved.publicKey !== expected.publicKey) {
        throw new Error('The saved keys do not match this recovery phrase and derivation recipe.');
      }
    }
    return recovered;
  }

  return Object.freeze({ NETWORK, PATH_TEMPLATE, DEFAULT_COUNT, MAX_COUNT, generatePhrase, normalizePhrase, encodeKey, derive, deriveAsync, restore, restoreAsync });
});
