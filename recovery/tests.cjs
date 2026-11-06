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
