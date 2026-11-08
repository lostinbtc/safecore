'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ethers = require('./assets/ethers.umd.min.js');
const generator = require('./wallet.js');
const formats = require('./formats.js');
const backupEngine = require('./wallet-format.js');
const walletEngine = require('../whippet/www/engine.js');
const bitcore = require('bitcore-lib-doge');

// Published BIP39 vector. No user recovery material belongs in these tests.
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function main() {
  assert.equal(generator.derive(ethers, phrase).wallets.length, 200);
  for (const count of [0, -1, 1001, 1.5, NaN]) {
    assert.throws(() => generator.derive(ethers, phrase, {count}), /1 and 1000/);
  }
  const bundle = await generator.deriveAsync(ethers, phrase, {count: 1000, passphrase: 'TREZOR'});
  assert.equal(bundle.wallets.length, 1000);
  assert.equal(new Set(bundle.wallets.map(row => row.address)).size, 1000);
  const exported = formats.exportJSON(ethers, backupEngine, crypto.webcrypto, bundle);
  walletEngine.validateEnvelope(exported);
  const recipe = walletEngine.validateRecipe(ethers, await walletEngine.decrypt(crypto.webcrypto, exported, ''));
  for (const index of [0, 19, 199, 999]) {
    const row = bundle.wallets[index];
    assert.equal(row.address, walletEngine.accounts(ethers, recipe, index).wht.address);
    const raw = Buffer.from(ethers.utils.base58.decode(row.wif));
    const payload = raw.subarray(0, -4);
    const check = crypto.createHash('sha256').update(crypto.createHash('sha256').update(payload).digest()).digest().subarray(0, 4);
    assert.deepEqual(raw.subarray(-4), check);
    assert.equal(payload[0], 158); assert.equal(payload.at(-1), 1);
    const key = crypto.createECDH('secp256k1'); key.setPrivateKey(payload.subarray(1, 33));
    assert.equal(key.getPublicKey('hex', 'compressed'), row.publicKey);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(exported, null, 2)) < 1000000);
  assert.deepEqual(await formats.importJSON(ethers, generator, backupEngine, crypto.webcrypto, exported), bundle);
  assert.equal(formats.exportText(bundle).trim().split('\n').length, 1000);
  assert.equal(formats.exportAddressText(bundle).trim().split('\n\n').length, 1000);
  assert.ok(formats.exportAddressText(bundle).includes(bundle.wallets[999].address));
  assert.ok(formats.exportAddressText(bundle).includes(bundle.wallets[999].wif));
  assert.equal(formats.exportCSV(bundle).trim().split('\r\n').length, 1001);
  const small = generator.derive(ethers, phrase, {count: 3, passphrase: 'TREZOR'});
  assert.deepEqual(await formats.importJSON(ethers, generator, backupEngine, crypto.webcrypto, small), small);
  const password = 'Public-fixture-password-123';
  const native = await walletEngine.encrypt(crypto.webcrypto, recipe, password);
  assert.deepEqual(await formats.importJSON(ethers, generator, backupEngine, crypto.webcrypto, native,
    {count: 3, password}), small);
  const pep = await generator.deriveAsync(ethers, phrase, {coin:'pep', count:1000, passphrase:'TREZOR'});
  const independentMaster=bitcore.HDPrivateKey.fromSeed(Buffer.from(ethers.utils.mnemonicToSeed(phrase,'TREZOR').slice(2),'hex'));
  assert.equal(new Set(pep.wallets.map(row=>row.address)).size,1000);
  assert.equal(generator.derive(ethers,phrase,{coin:'pep'}).wallets.length,200);
  for(const index of [0,19,199,999]){
    const row=pep.wallets[index];
    assert.equal(row.address,walletEngine.accounts(ethers,recipe,index).pep.address);
    const privateKey=ethers.utils.HDNode.fromMnemonic(phrase,'TREZOR').derivePath(row.path).privateKey;
    assert.equal(independentMaster.deriveChild(row.path).privateKey.toBuffer().toString('hex'),privateKey.slice(2));
    assert.equal(ethers.utils.hexlify(ethers.utils.base58.decode(row.wif).slice(1,33)),privateKey);
    const payload=Buffer.from(ethers.utils.base58.decode(row.wif));
    assert.equal(payload[0],158);assert.equal(payload[payload.length-5],1);
    assert.deepEqual(payload.subarray(-4),crypto.createHash('sha256').update(crypto.createHash('sha256').update(payload.subarray(0,-4)).digest()).digest().subarray(0,4));
    assert.notEqual(row.address,bundle.wallets[index].address);
    assert.notEqual(row.wif,bundle.wallets[index].wif);
  }
  const pepJSON=formats.exportJSON(ethers,backupEngine,crypto.webcrypto,pep);
  assert.ok(pepJSON.recoveryGenerator);assert.equal(pepJSON.whippetGenerator,undefined);
  assert.deepEqual(walletEngine.validateRecipe(ethers,await walletEngine.decrypt(crypto.webcrypto,pepJSON,'')),recipe);
  assert.deepEqual(await formats.importJSON(ethers,generator,backupEngine,crypto.webcrypto,pepJSON,{coin:'wht'}),pep);
  const pepSmall=generator.derive(ethers,phrase,{coin:'pep',count:3,passphrase:'TREZOR'});
  assert.deepEqual(await formats.importJSON(ethers,generator,backupEngine,crypto.webcrypto,native,{coin:'pep',count:3,password}),pepSmall);
  assert.deepEqual(generator.restore(ethers,pepSmall),pepSmall);
  assert.deepEqual(await generator.restoreAsync(ethers,pepSmall),pepSmall);
  for(const mutate of [b=>b.network.pubKeyHash=73,b=>b.derivation.pathTemplate=generator.PATH_TEMPLATE,b=>b.wallets[0].wif=small.wallets[0].wif,b=>b.wallets[0]=null]){
    const bad=structuredClone(pepSmall);mutate(bad);
    assert.throws(()=>generator.restore(ethers,bad));await assert.rejects(generator.restoreAsync(ethers,bad));
  }
  assert.throws(()=>generator.derive(ethers,phrase,{coin:'btc'}),/Choose/);
  assert.equal(formats.exportText(pep).trim().split('\n').length,1000);
  assert.ok(formats.exportAddressText(pep).includes(pep.wallets[999].path));
  assert.ok(formats.exportCSV(pep).includes(pep.wallets[999].address));
  await assert.rejects(formats.importJSON(ethers, generator, backupEngine, crypto.webcrypto, native,
    {count: 3, password: 'Incorrect-fixture-password'}), /Incorrect password/);
  const altered = formats.exportJSON(ethers, backupEngine, crypto.webcrypto, small);
  altered.recipe = walletEngine.recipe(ethers, phrase, 'different');
  await assert.rejects(formats.importJSON(ethers, generator, backupEngine, crypto.webcrypto, altered), /do not match/);
  const controller = new AbortController();
  await assert.rejects(generator.deriveAsync(ethers, phrase, {count: 1000, signal: controller.signal,
    onProgress() { controller.abort(); }}), /cancelled/);
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /max="1000" value="200"/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /https?:\/\//);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(__dirname, match[1].split('?')[0])), 'Missing local asset');
  }
  console.log('PASS: 200 default, 1000 keys, independent WIF/public-key checks, and wallet JSON compatibility.');
  console.log('PASS: native encrypted import, legacy JSON, all text/CSV exports, cancellation and offline assets.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
