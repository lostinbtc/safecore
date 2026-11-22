// Fresh disposable entropy only. Never read local wallet files.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
const offline=require('../../recovery/wallet.js'),bitcore=require('bitcore-lib-doge');
const phrase=E.createPhrase(ethers,crypto.webcrypto,12);
for(const passphrase of ['', 'Disposable extra passphrase é']){
  const recipe=E.recipe(ethers,phrase,passphrase),pool=E.receivePool(ethers,recipe,200);
  const seed=crypto.pbkdf2Sync(phrase,('mnemonic'+passphrase).normalize('NFKD'),2048,64,'sha512');
  const master=bitcore.HDPrivateKey.fromSeed(seed);
  for(const coin of Object.keys(E.NETWORKS)){
    const rows=E.recoveryKeys(ethers,recipe,coin,0,200);
    const reference=offline.derive(ethers,phrase,{coin,count:200,passphrase}).wallets;
    assert.equal(rows.length,200);
    for(const row of rows){
      assert.ok(row.address===pool[coin][row.index].address,'Export matches app receive pool');
      assert.ok(row.wif===reference[row.index].wif&&row.publicKey===reference[row.index].publicKey,'Export matches offline recovery');
      const decoded=bitcore.encoding.Base58Check.decode(row.wif);
      assert.equal(decoded.length,34);assert.equal(decoded[0],E.NETWORKS[coin].wif);assert.equal(decoded[33],1);
      const independent=master.deriveChild(row.path);
      assert.ok(decoded.subarray(1,33).equals(independent.privateKey.toBuffer()),'Independent private key derivation');
      assert.ok(row.publicKey===independent.publicKey.toBuffer().toString('hex'),'Independent compressed public key');
    }
    assert.deepEqual(E.recoveryKeys(ethers,recipe,coin,190,10),rows.slice(190));
  }
}
for(const [coin,start,count] of [['__proto__',0,1],['btc',-1,10],['btc',0,201],['btc',199,2],['btc',0,0],['btc',0,1.5]])
  assert.throws(()=>E.recoveryKeys(ethers,E.recipe(ethers,phrase),coin,start,count));
console.log('PASS: 200 keys for all 18 coins, app/offline parity, independent WIF/key checks with and without BIP39 passphrase, range rejection.');
