// Public BIP39 test vectors only. No real user wallet material.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const E = require('../www/engine.js');
const ethers = require('../www/assets/ethers.umd.min.js');
const legacy = require('../www/assets/whippet-legacy.js');
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const bitcore = require('bitcore-lib-doge');

(async () => {
  const fixed = {getRandomValues(array) { array.fill(0); return array; }};
  assert.equal(E.createPhrase(ethers, fixed, 12), phrase);
  assert.equal(E.createPhrase(ethers, fixed, 24).split(' ').length, 24);
  assert.throws(() => E.createPhrase(ethers, fixed, 15));
  assert.throws(() => E.recipe(ethers, 'not a phrase'));
  for (const passphrase of ['', 'TREZOR', ' TREZOR ', 'Tést', 'Te\u0301st']) {
    const payload = E.recipe(ethers, phrase, passphrase);
    const seed = crypto.pbkdf2Sync(phrase, ('mnemonic' + passphrase).normalize('NFKD'), 2048, 64, 'sha512');
    const independent = bitcore.HDPrivateKey.fromSeed(bitcore.deps.Buffer.from(seed));
    for (const index of [0, 1, 3]) {
      const accounts = E.accounts(ethers, payload, index);
      for (const [coin, account] of Object.entries(accounts)) {
        const child = independent.deriveChild(account.path);
        const pub = Buffer.from(child.privateKey.toPublicKey().toBuffer());
        const hash = crypto.createHash('ripemd160').update(crypto.createHash('sha256').update(pub).digest()).digest();
        const decoded = bitcore.encoding.Base58Check.decode(account.address);
        assert.equal(decoded[0], E.NETWORKS[coin].prefix);
        assert.equal(decoded.subarray(1).toString('hex'), hash.toString('hex'));
      }
      assert.equal(accounts.wht.address, legacy.derive(ethers, phrase, {passphrase, count: index + 1}).wallets[index].address);
      assert.notEqual(accounts.wht.address, accounts.pep.address);
    }
  }
  const payload = E.recipe(ethers, phrase, 'TREZOR');
  const pool = E.receivePool(ethers,payload);
  for (const index of [0,1,19]) assert.deepEqual(Object.fromEntries(Object.entries(pool).map(([coin,list]) => [coin,list[index]])), E.accounts(ethers,payload,index));
  const extended=E.receivePool(ethers,payload,200);
  assert.deepEqual(extended.wht[199],E.accounts(ethers,payload,199).wht);
  assert.throws(() => E.receivePool(ethers,payload,201));
  assert.equal(JSON.stringify(pool).includes('privateKey'),false);
  const open = E.unprotected(crypto.webcrypto,payload);
  assert.equal(open.format,E.OPEN_FORMAT);
  assert.deepEqual(await E.decrypt(crypto.webcrypto,open,''),payload);
  assert.throws(() => E.validateEnvelope({...open,id:'bad'}));
  const password = 'Public-test-password-123';
  const sealed = await E.encrypt(crypto.webcrypto, payload, password);
  assert.equal(JSON.stringify(sealed).includes('abandon'), false);
  assert.deepEqual(await E.decrypt(crypto.webcrypto, sealed, password), payload);
  assert.notEqual((await E.encrypt(crypto.webcrypto, payload, password)).data, sealed.data);
  await assert.rejects(E.decrypt(crypto.webcrypto, sealed, 'Wrong-test-password-123'), /Incorrect password/);
  await assert.rejects(E.decrypt(crypto.webcrypto, {...sealed, data: (sealed.data[0] === '0' ? '1' : '0') + sealed.data.slice(1)}, password));
  assert.throws(() => E.validateEnvelope({...sealed, iterations: 999999999}));
  assert.throws(() => E.validateRecipe(ethers, {...payload, paths: {pep:'m/0',wht:E.NETWORKS.wht.path}}));
  assert.throws(() => E.accounts(ethers, payload, -1));
  console.log('PASS: all coin paths independently verified, legacy Whippet compatibility, encrypted recovery, wrong-password/tamper rejection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
