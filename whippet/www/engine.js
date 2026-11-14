/* Handles BIP39 validation, recovery recipes, address derivation and vault encryption; no networking or transaction signing. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WalletEngine = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NETWORKS = Object.freeze({
    pep: Object.freeze({ name: 'Pepecoin', ticker: 'PEP', decimals: 8, prefix: 56, wif: 158, path: "m/44'/3434'/0'/0/{index}" }),
    wht: Object.freeze({ name: 'Whippet', ticker: 'WHT', decimals: 8, prefix: 73, wif: 158, path: "m/0'/3'/{index}'" }),
    shic: Object.freeze({ name: 'Shibacoin', ticker: 'SHIC', decimals: 8, prefix: 63, wif: 158, path: "m/44'/4474'/0'/0/{index}" }),
    doge: Object.freeze({ name: 'Dogecoin', ticker: 'DOGE', decimals: 8, prefix: 30, wif: 158, path: "m/44'/3'/0'/0/{index}" }),
    btc: Object.freeze({ name: 'Bitcoin', ticker: 'BTC', decimals: 8, prefix: 0, wif: 128, path: "m/44'/0'/0'/0/{index}" }),
    ltc: Object.freeze({ name: 'Litecoin', ticker: 'LTC', decimals: 8, prefix: 48, wif: 176, path: "m/44'/2'/0'/0/{index}" }),
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
        || payload.paths?.pep !== NETWORKS.pep.path || payload.paths?.wht !== NETWORKS.wht.path
        || payload.paths.shic !== undefined && payload.paths.shic !== NETWORKS.shic.path
        || payload.paths.ltc !== undefined && payload.paths.ltc !== NETWORKS.ltc.path
        || payload.paths.doge !== undefined && payload.paths.doge !== NETWORKS.doge.path
        || payload.paths.btc !== undefined && payload.paths.btc !== NETWORKS.btc.path) {
      throw new Error('Unsupported wallet recovery recipe.');
    }
    return { format: payload.format, mnemonic: normalize(ethers, payload.mnemonic),
      passphrase: payload.passphrase, paths: { pep: NETWORKS.pep.path, wht: NETWORKS.wht.path, shic: NETWORKS.shic.path, ltc: NETWORKS.ltc.path, doge: NETWORKS.doge.path, btc: NETWORKS.btc.path } };
  }
  function recipe(ethers, mnemonic, passphrase = '') {
    return validateRecipe(ethers, { format: 'pepecoin-whippet-seed-v1', mnemonic,
      passphrase, paths: { pep: NETWORKS.pep.path, wht: NETWORKS.wht.path, shic: NETWORKS.shic.path, ltc: NETWORKS.ltc.path, doge: NETWORKS.doge.path, btc: NETWORKS.btc.path } });
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
    if (!Number.isSafeInteger(count) || count < 1 || count > 200) throw new Error('Invalid receive pool size.');
    const valid = validateRecipe(ethers, payload);
    const master = ethers.utils.HDNode.fromMnemonic(valid.mnemonic, valid.passphrase);
    return deriveReceivePool(ethers, master, count);
  }
  function publicAddress(ethers, publicKey, prefix) {
    const hash = ethers.utils.ripemd160(ethers.utils.sha256(publicKey));
    const bytes = ethers.utils.concat([[prefix], hash]);
    const checksum = ethers.utils.arrayify(ethers.utils.sha256(ethers.utils.sha256(bytes))).slice(0, 4);
    return ethers.utils.base58.encode(ethers.utils.concat([bytes, checksum]));
  }
  function deriveReceivePool(ethers, master, count, includePublicKey = false) {
    return Object.fromEntries(Object.entries(NETWORKS).map(([coin, network]) => {
      const [prefix, suffix] = network.path.split('{index}');
      const branch = master.derivePath(prefix.replace(/\/$/, ''));
      return [coin, Array.from({length: count}, (_, index) => {
        const node = branch.derivePath(String(index) + suffix);
        return {coin, index, path: network.path.replace('{index}', String(index)),
          address: publicAddress(ethers, node.publicKey, network.prefix),
          ...(includePublicKey ? {publicKey:node.publicKey} : {})};
      })];
    }));
  }
  const PUBLIC_CACHE_PREFIX = 'corevault.public-addresses.';
  function cachedReceivePool(ethers, payload, storage, walletId, count = 200) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 200 || !/^(?:[a-f0-9]{32}|[a-f0-9]{56})$/.test(walletId)) throw new Error('Invalid public address cache scope.');
    const valid = validateRecipe(ethers, payload);
    const master = ethers.utils.HDNode.fromMnemonic(valid.mnemonic, valid.passphrase);
    // Domain-separated authentication key exists only while the wallet is open.
    // Never persist it, a seed, private key, chain code or extended public key.
    const key = ethers.utils.computeHmac('sha256', master.privateKey, ethers.utils.toUtf8Bytes('SafeCore public receive cache authentication v1'));
    const metadata = {version:1,walletId,count,networks:Object.entries(NETWORKS).map(([coin,n])=>[coin,n.prefix,n.path,n.decimals])};
    const authenticate = body => ethers.utils.computeHmac('sha256', key, ethers.utils.toUtf8Bytes(JSON.stringify(body)));
    const sameMac = (a,b) => {
      if (typeof b!=='string' || !/^0x[0-9a-f]{64}$/.test(b)) return false;
      let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
    };
    const checkedPools = body => {
      if (JSON.stringify(body.metadata)!==JSON.stringify(metadata) || !body.pools || Object.keys(body.pools).length!==Object.keys(NETWORKS).length) throw new Error('Cache scope changed.');
      return Object.fromEntries(Object.entries(NETWORKS).map(([coin,n])=>{
        const pool=body.pools[coin];
        if(!Array.isArray(pool)||pool.length!==count)throw new Error('Invalid cached pool.');
        return [coin,pool.map((a,index)=>{
          const path=n.path.replace('{index}',String(index));
          if(!a||a.coin!==coin||a.index!==index||a.path!==path||!/^0x0[23][0-9a-f]{64}$/.test(a.publicKey)||a.address!==publicAddress(ethers,a.publicKey,n.prefix))throw new Error('Invalid cached address.');
          return {coin,index,path,address:a.address};
        })];
      }));
    };
    const cacheId=PUBLIC_CACHE_PREFIX+walletId;
    try {
      const raw=storage.getItem(cacheId);
      if(raw&&raw.length<=524288){
        const cache=JSON.parse(raw);
        if(sameMac(authenticate(cache.body),cache.mac))return checkedPools(cache.body);
      }
    } catch (_) { /* Corrupt/untrusted/unavailable caches never supply an address. */ }
    const body={metadata,pools:deriveReceivePool(ethers,master,count,true)};
    const pools=checkedPools(body);
    try {
      // Bound this optional cache to three wallets, leaving room for wallet data.
      const older=[];
      for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(PUBLIC_CACHE_PREFIX)&&k!==cacheId)older.push(k);}
      while(older.length>=3)storage.removeItem(older.shift());
      storage.setItem(cacheId,JSON.stringify({body,mac:authenticate(body)}));
    } catch (_) { /* Quota/private-mode failures fall back to freshly derived data. */ }
    return pools;
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
          || p.paths?.pep !== NETWORKS.pep.path || p.paths?.wht !== NETWORKS.wht.path
          || p.paths.shic !== undefined && p.paths.shic !== NETWORKS.shic.path
          || p.paths.ltc !== undefined && p.paths.ltc !== NETWORKS.ltc.path
          || p.paths.doge !== undefined && p.paths.doge !== NETWORKS.doge.path
          || p.paths.btc !== undefined && p.paths.btc !== NETWORKS.btc.path) throw new Error('Invalid unprotected wallet backup.');
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
    validateRecipe, accounts, receivePool, cachedReceivePool, PUBLIC_CACHE_PREFIX, unprotected, encrypt, decrypt, validateEnvelope });
});
