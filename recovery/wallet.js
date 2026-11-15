(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./wallet-format.js') : root.WalletEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WhippetWallet = api;
})(typeof globalThis === 'object' ? globalThis : this, function (E) {
  'use strict';
  const NETWORK = Object.freeze({ name: 'Whippet mainnet', pubKeyHash: 73, scriptHash: 22, wif: 158 });
  const PATH_TEMPLATE = "m/0'/3'/{index}'";
  const NETWORKS = Object.freeze({
    flop: Object.freeze({ network: Object.freeze({ name: 'Flopcoin mainnet', pubKeyHash: 35, scriptHash: 22, wif: 158 }), path: "m/44'/3'/0'/0/{index}", format: 'flopcoin-seed-v1' }),
    cat: Object.freeze({ network: Object.freeze({ name: 'Catcoin mainnet', pubKeyHash: 21, scriptHash: 88, wif: 149 }), path: "m/44'/760'/0'/0/{index}", format: 'catcoin-seed-v1' }),
    trmp: Object.freeze({ network: Object.freeze({ name: 'TrumPOW mainnet', pubKeyHash: 65, scriptHash: 28, wif: 151 }), path: "m/44'/1707'/0'/0/{index}", format: 'trumpow-seed-v1' }),
    bch: Object.freeze({ network: Object.freeze({ name: 'Bitcoin Cash mainnet', pubKeyHash: 0, scriptHash: 5, wif: 128 }), path: "m/44'/145'/0'/0/{index}", format: 'bitcoincash-seed-v1' }),
    dash: Object.freeze({ network: Object.freeze({ name: 'Dash mainnet', pubKeyHash: 76, scriptHash: 16, wif: 204 }), path: "m/44'/5'/0'/0/{index}", format: 'dash-seed-v1' }),
    dgb: Object.freeze({ network: Object.freeze({ name: 'DigiByte mainnet', pubKeyHash: 30, scriptHash: 63, wif: 128 }), path: "m/44'/20'/0'/0/{index}", format: 'digibyte-seed-v1' }),
    jkc: Object.freeze({ network: Object.freeze({ name: 'Junkcoin mainnet', pubKeyHash: 16, scriptHash: 5, wif: 144 }), path: "m/44'/2013'/0'/0/{index}", format: 'junkcoin-seed-v1' }),
    lky: Object.freeze({ network: Object.freeze({ name: 'Luckycoin mainnet', pubKeyHash: 47, scriptHash: 5, wif: 175 }), path: "m/44'/790'/0'/0/{index}", format: 'luckycoin-seed-v1' }),
    rvn: Object.freeze({ network: Object.freeze({ name: 'Ravencoin mainnet', pubKeyHash: 60, scriptHash: 122, wif: 128 }), path: "m/44'/175'/0'/0/{index}", format: 'ravencoin-seed-v1' }),
    bonc: Object.freeze({ network: Object.freeze({ name: 'Bonkcoin mainnet', pubKeyHash: 25, scriptHash: 28, wif: 151 }), path: "m/0'/0'/{index}'", format: 'bonkcoin-seed-v1' }),
    dingo: Object.freeze({ network: Object.freeze({ name: 'Dingocoin mainnet', pubKeyHash: 30, scriptHash: 22, wif: 158 }), path: "m/44'/3'/0'/0/{index}", format: 'dingocoin-seed-v1' }),
    bel: Object.freeze({ network: Object.freeze({ name: 'Bellscoin mainnet', pubKeyHash: 25, scriptHash: 30, wif: 153 }), path: "m/44'/762'/0'/0/{index}", format: 'bellscoin-seed-v1' }),
    wht: Object.freeze({ network: NETWORK, path: PATH_TEMPLATE, format: 'whippet-seed-v1' }),
    pep: Object.freeze({ network: Object.freeze({ name: 'Pepecoin mainnet', pubKeyHash: 56, scriptHash: 22, wif: 158 }), path: "m/44'/3434'/0'/0/{index}", format: 'pepecoin-seed-v1' }),
    doge: Object.freeze({ network: Object.freeze({ name: 'Dogecoin mainnet', pubKeyHash: 30, scriptHash: 22, wif: 158 }), path: "m/44'/3'/0'/0/{index}", format: 'dogecoin-seed-v1' }),
    btc: Object.freeze({ network: Object.freeze({ name: 'Bitcoin mainnet', pubKeyHash: 0, scriptHash: 5, wif: 128 }), path: "m/44'/0'/0'/0/{index}", format: 'bitcoin-seed-v1' }),
    ltc: Object.freeze({ network: Object.freeze({ name: 'Litecoin mainnet', pubKeyHash: 48, scriptHash: 50, wif: 176 }), path: "m/44'/2'/0'/0/{index}", format: 'litecoin-seed-v1' }),
    shic: Object.freeze({ network: Object.freeze({ name: 'Shibacoin mainnet', pubKeyHash: 63, scriptHash: 22, wif: 158 }), path: "m/44'/4474'/0'/0/{index}", format: 'shibacoin-seed-v1' }),
  });
  function config(coin = 'wht') {
    if (!Object.hasOwn(NETWORKS, coin)) throw new Error('Choose a supported asset.');
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
      address: coin==='bch'?E.cashAddress(hash.slice(2)):encodeChecked(ethers, ethers.utils.concat([[network.pubKeyHash], hash])),
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
