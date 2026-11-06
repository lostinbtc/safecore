/* Local-only development wallet. No transaction signing or broadcast yet. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WalletEngine = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NETWORKS = Object.freeze({
    pep: Object.freeze({ name: 'Pepecoin', ticker: 'PEP', prefix: 56, path: "m/44'/3434'/0'/0/{index}" }),
    wht: Object.freeze({ name: 'Whippet', ticker: 'WHT', prefix: 73, path: "m/0'/3'/{index}'" }),
  });
  const ITERATIONS = 600000;
  const FORMAT = 'pepecoin-whippet-encrypted-v1';
  const OPEN_FORMAT = 'corevault-unprotected-v1';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  function normalize(ethers, phrase) {
    const value = String(phrase).normalize('NFKD').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!ethers.utils.isValidMnemonic(value)) throw new Error('Enter a valid English BIP39 recovery phrase.');
    return value;
  }
  function createPhrase(ethers, crypto, words = 12) {
    if (![12, 24].includes(words)) throw new Error('Choose 12 or 24 words.');
    return ethers.utils.entropyToMnemonic(crypto.getRandomValues(new Uint8Array(words === 12 ? 16 : 32)));
  }
  function validateRecipe(ethers, payload) {
    if (!payload || payload.format !== 'pepecoin-whippet-seed-v1' || typeof payload.passphrase !== 'string'
        || payload.paths?.pep !== NETWORKS.pep.path || payload.paths?.wht !== NETWORKS.wht.path) {
      throw new Error('Unsupported wallet recovery recipe.');
    }
    return { format: payload.format, mnemonic: normalize(ethers, payload.mnemonic),
      passphrase: payload.passphrase, paths: { pep: NETWORKS.pep.path, wht: NETWORKS.wht.path } };
  }
  function recipe(ethers, mnemonic, passphrase = '') {
    return validateRecipe(ethers, { format: 'pepecoin-whippet-seed-v1', mnemonic,
      passphrase, paths: { pep: NETWORKS.pep.path, wht: NETWORKS.wht.path } });
  }
  function accounts(ethers, payload, index = 0) {
    const valid = validateRecipe(ethers, payload);
    if (!Number.isSafeInteger(index) || index < 0 || index > 999) throw new Error('Address index is out of range.');
    const master = ethers.utils.HDNode.fromMnemonic(valid.mnemonic, valid.passphrase);
    return Object.fromEntries(Object.entries(NETWORKS).map(([coin, network]) => {
      const path = network.path.replace('{index}', String(index));
      const node = master.derivePath(path);
      const hash160 = ethers.utils.ripemd160(ethers.utils.sha256(node.publicKey));
      const bytes = ethers.utils.concat([[network.prefix], hash160]);
      const checksum = ethers.utils.arrayify(ethers.utils.sha256(ethers.utils.sha256(bytes))).slice(0, 4);
      return [coin, { coin, index, path, address: ethers.utils.base58.encode(ethers.utils.concat([bytes, checksum])) }];
    }));
  }
  const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  function receivePool(ethers, payload, count = 20) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new Error('Invalid receive pool size.');
    const valid = validateRecipe(ethers, payload);
    const master = ethers.utils.HDNode.fromMnemonic(valid.mnemonic, valid.passphrase);
    return Object.fromEntries(Object.entries(NETWORKS).map(([coin, network]) => {
      const [prefix, suffix] = network.path.split('{index}');
      const branch = master.derivePath(prefix.replace(/\/$/, ''));
      return [coin, Array.from({length: count}, (_, index) => {
        const node = branch.derivePath(String(index) + suffix);
        const hash = ethers.utils.ripemd160(ethers.utils.sha256(node.publicKey));
        const bytes = ethers.utils.concat([[network.prefix], hash]);
        const checksum = ethers.utils.arrayify(ethers.utils.sha256(ethers.utils.sha256(bytes))).slice(0, 4);
        return {coin, index, path: network.path.replace('{index}', String(index)),
          address: ethers.utils.base58.encode(ethers.utils.concat([bytes, checksum]))};
      })];
    }));
  }
  function unprotected(crypto, payload) {
    return validateEnvelope({format: OPEN_FORMAT, id: hex(crypto.getRandomValues(new Uint8Array(16))), recipe: JSON.parse(JSON.stringify(payload))});
  }
  function unhex(value, bytes) {
    if (typeof value !== 'string' || !/^[0-9a-f]+$/.test(value) || value.length % 2
        || (bytes && value.length !== bytes * 2)) throw new Error('Invalid encrypted backup.');
    return Uint8Array.from(value.match(/../g), n => parseInt(n, 16));
  }
  async function key(crypto, password, salt) {
    if (typeof password !== 'string' || password.length < 12) throw new Error('Use a wallet password of at least 12 characters.');
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function validateEnvelope(envelope) {
    if (envelope?.format === OPEN_FORMAT) {
      const p = envelope.recipe;
      if (!/^[0-9a-f]{32}$/.test(envelope.id) || !p || p.format !== 'pepecoin-whippet-seed-v1'
          || typeof p.mnemonic !== 'string' || p.mnemonic.length > 1000 || typeof p.passphrase !== 'string' || p.passphrase.length > 1000
          || p.paths?.pep !== NETWORKS.pep.path || p.paths?.wht !== NETWORKS.wht.path) throw new Error('Invalid unprotected wallet backup.');
      return envelope;
    }
    if (!envelope || envelope.format !== FORMAT || envelope.kdf !== 'PBKDF2-SHA256'
        || envelope.iterations !== ITERATIONS || envelope.cipher !== 'AES-256-GCM'
        || typeof envelope.data !== 'string' || envelope.data.length < 32 || envelope.data.length > 32768) {
      throw new Error('Unsupported or oversized encrypted backup.');
    }
    unhex(envelope.salt, 16); unhex(envelope.iv, 12); unhex(envelope.data);
    return envelope;
  }
  async function encrypt(crypto, payload, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(FORMAT) },
      await key(crypto, password, salt), encoder.encode(JSON.stringify(payload)));
    return { format: FORMAT, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, cipher: 'AES-256-GCM',
      salt: hex(salt), iv: hex(iv), data: hex(new Uint8Array(encrypted)) };
  }
  async function decrypt(crypto, envelope, password) {
    validateEnvelope(envelope);
    if (envelope.format === OPEN_FORMAT) return JSON.parse(JSON.stringify(envelope.recipe));
    const secret = await key(crypto, password, unhex(envelope.salt));
    try {
      const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(envelope.iv),
        additionalData: encoder.encode(FORMAT) }, secret, unhex(envelope.data));
      return JSON.parse(decoder.decode(raw));
    } catch (_) { throw new Error('Incorrect password or damaged backup.'); }
  }
  return Object.freeze({ NETWORKS, FORMAT, OPEN_FORMAT, ITERATIONS, normalize, createPhrase, recipe,
    validateRecipe, accounts, receivePool, unprotected, encrypt, decrypt, validateEnvelope });
});
