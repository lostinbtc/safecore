/* Local-only development wallet. No transaction signing or broadcast yet. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WalletEngine = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NETWORKS = Object.freeze({
    flop: Object.freeze({ name: 'Flopcoin', ticker: 'FLOP', decimals: 8, prefix: 35, wif: 158, path: "m/44'/3'/0'/0/{index}" }),
    cat: Object.freeze({ name: 'Catcoin', ticker: 'CAT', decimals: 8, prefix: 21, wif: 149, path: "m/44'/760'/0'/0/{index}" }),
    trmp: Object.freeze({ name: 'TrumPOW', ticker: 'TRMP', decimals: 8, prefix: 65, wif: 151, path: "m/44'/1707'/0'/0/{index}" }),
    bch: Object.freeze({ name: 'Bitcoin Cash', ticker: 'BCH', prefix: 0, wif: 128, path: "m/44'/145'/0'/0/{index}" }),
    dash: Object.freeze({ name: 'Dash', ticker: 'DASH', prefix: 76, wif: 204, path: "m/44'/5'/0'/0/{index}" }),
    dgb: Object.freeze({ name: 'DigiByte', ticker: 'DGB', prefix: 30, wif: 128, path: "m/44'/20'/0'/0/{index}" }),
    jkc: Object.freeze({ name: 'Junkcoin', ticker: 'JKC', prefix: 16, wif: 144, path: "m/44'/2013'/0'/0/{index}" }),
    lky: Object.freeze({ name: 'Luckycoin', ticker: 'LKY', prefix: 47, wif: 175, path: "m/44'/790'/0'/0/{index}" }),
    rvn: Object.freeze({ name: 'Ravencoin', ticker: 'RVN', prefix: 60, wif: 128, path: "m/44'/175'/0'/0/{index}" }),
    bonc: Object.freeze({ name: 'Bonkcoin', ticker: 'BONC', prefix: 25, wif: 151, path: "m/0'/0'/{index}'" }),
    dingo: Object.freeze({ name: 'Dingocoin', ticker: 'DINGO', prefix: 30, wif: 158, path: "m/44'/3'/0'/0/{index}" }),
    bel: Object.freeze({ name: 'Bellscoin', ticker: 'BELLS', prefix: 25, wif: 153, path: "m/44'/762'/0'/0/{index}" }),
    pep: Object.freeze({ name: 'Pepecoin', ticker: 'PEP', prefix: 56, path: "m/44'/3434'/0'/0/{index}" }),
    wht: Object.freeze({ name: 'Whippet', ticker: 'WHT', prefix: 73, path: "m/0'/3'/{index}'" }),
    shic: Object.freeze({ name: 'Shibacoin', ticker: 'SHIC', prefix: 63, path: "m/44'/4474'/0'/0/{index}" }),
    doge: Object.freeze({ name: 'Dogecoin', ticker: 'DOGE', prefix: 30, wif: 158, path: "m/44'/3'/0'/0/{index}" }),
    btc: Object.freeze({ name: 'Bitcoin', ticker: 'BTC', prefix: 0, wif: 128, path: "m/44'/0'/0'/0/{index}" }),
    ltc: Object.freeze({ name: 'Litecoin', ticker: 'LTC', prefix: 48, wif: 176, path: "m/44'/2'/0'/0/{index}" }),
  });
  const ITERATIONS = 600000;
  // CashAddr mainnet, ordinary 160-bit P2PKH/P2SH only. Token-aware and
  // future address types are rejected, not silently converted.
  const CASH_ALPHABET='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function cashPoly(words) {
    let c=1n; const generators=[0x98f2bc8e61n,0x79b76d99e2n,0xf33e5fb3c4n,0xae2eabe2a8n,0x1e4f43e470n];
    for(const value of words){const top=c>>35n;c=((c&0x07ffffffffn)<<5n)^BigInt(value);for(let i=0;i<5;i++)if((top>>BigInt(i))&1n)c^=generators[i];}
    return c^1n;
  }
  function cashBits(values,from,to,pad) {
    let acc=0,bits=0;const result=[],mask=(1<<to)-1;
    for(const value of values){if(value<0||value>>from)throw Error('Invalid Bitcoin Cash address.');acc=((acc<<from)|value)&((1<<(from+to-1))-1);bits+=from;while(bits>=to){bits-=to;result.push((acc>>bits)&mask);}}
    if(pad){if(bits)result.push((acc<<(to-bits))&mask);}
    else if(bits>=from||((acc<<(to-bits))&mask))throw Error('Invalid Bitcoin Cash address padding.');
    return result;
  }
  function cashAddress(hash,type=0) {
    if(typeof hash!=='string'||!/^([a-f0-9]{40})$/i.test(hash)||![0,1].includes(type))throw Error('Unsupported Bitcoin Cash address.');
    const words=cashBits([type<<3,...hash.match(/../g).map(h=>parseInt(h,16))],8,5,true);
    const prefix=[...'bitcoincash'].map(c=>c.charCodeAt(0)&31);
    const checksum=cashPoly([...prefix,0,...words,...Array(8).fill(0)]);
    return 'bitcoincash:'+[...words,...Array.from({length:8},(_,i)=>Number((checksum>>BigInt(5*(7-i)))&31n))].map(n=>CASH_ALPHABET[n]).join('');
  }
  function readCashAddress(address) {
    if(typeof address!=='string'||address.length>100||address!==address.toLowerCase()&&address!==address.toUpperCase())throw Error('Invalid Bitcoin Cash address.');
    const text=address.toLowerCase(),parts=(text.includes(':')?text:'bitcoincash:'+text).split(':');
    if(parts.length!==2||parts[0]!=='bitcoincash'||parts[1].length!==42)throw Error('Use a mainnet Bitcoin Cash address.');
    const words=[...parts[1]].map(c=>CASH_ALPHABET.indexOf(c));
    if(words.includes(-1)||cashPoly([...[...parts[0]].map(c=>c.charCodeAt(0)&31),0,...words])!==0n)throw Error('Bitcoin Cash address checksum does not match.');
    const data=cashBits(words.slice(0,-8),5,8,false);
    if(data.length!==21||![0,8].includes(data[0]))throw Error('Token-aware or unsupported Bitcoin Cash address.');
    return {type:data[0]>>3,hash:data.slice(1).map(n=>n.toString(16).padStart(2,'0')).join('')};
  }
  const paths = () => Object.fromEntries(Object.entries(NETWORKS).map(([coin,n])=>[coin,n.path]));
  const validPaths = p => p?.pep===NETWORKS.pep.path && p?.wht===NETWORKS.wht.path
    && Object.entries(NETWORKS).every(([coin,n])=>p[coin]===undefined || p[coin]===n.path);
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
        || !validPaths(payload.paths)
        || payload.paths.bonc !== undefined && payload.paths.bonc !== NETWORKS.bonc.path
        || payload.paths.dingo !== undefined && payload.paths.dingo !== NETWORKS.dingo.path
        || payload.paths.bel !== undefined && payload.paths.bel !== NETWORKS.bel.path
        || payload.paths.shic !== undefined && payload.paths.shic !== NETWORKS.shic.path
        || payload.paths.ltc !== undefined && payload.paths.ltc !== NETWORKS.ltc.path
        || payload.paths.doge !== undefined && payload.paths.doge !== NETWORKS.doge.path
        || payload.paths.btc !== undefined && payload.paths.btc !== NETWORKS.btc.path) {
      throw new Error('Unsupported wallet recovery recipe.');
    }
    return { format: payload.format, mnemonic: normalize(ethers, payload.mnemonic),
      passphrase: payload.passphrase, paths: paths() };
  }
  function recipe(ethers, mnemonic, passphrase = '') {
    return validateRecipe(ethers, { format: 'pepecoin-whippet-seed-v1', mnemonic,
      passphrase, paths: paths() });
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
      return [coin, { coin, index, path, address: coin==='bch'?cashAddress(hash160.slice(2)):ethers.utils.base58.encode(ethers.utils.concat([bytes, checksum])) }];
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
          address: coin==='bch'?cashAddress(hash.slice(2)):ethers.utils.base58.encode(ethers.utils.concat([bytes, checksum]))};
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
          || !validPaths(p.paths)
          || p.paths.bonc !== undefined && p.paths.bonc !== NETWORKS.bonc.path
          || p.paths.dingo !== undefined && p.paths.dingo !== NETWORKS.dingo.path
          || p.paths.bel !== undefined && p.paths.bel !== NETWORKS.bel.path
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
    validateRecipe, accounts, receivePool, cashAddress, readCashAddress, unprotected, encrypt, decrypt, validateEnvelope });
});
