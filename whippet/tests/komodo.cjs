// Published BIP39 vectors only. Never fund these disposable recovery fixtures.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const ethers=require('../www/assets/ethers.umd.min.js'),E=require('../www/engine.js'),K=require('../www/komodo.js'),R=require('../www/recovery.js'),T=require('../www/transactions.js');
const current='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const old='legal winner thank year wave sausage worth useful legal winner thank yellow';
(async()=>{
 const recipe=E.recipe(ethers,current,'extra fixture passphrase'),open=E.unprotected(crypto.webcrypto,recipe),password='Disposable-test-password';
 const encrypted=await E.encrypt(crypto.webcrypto,recipe,password);
 for(const vault of [open,encrypted]){
  const fingerprint=await K.verifyDestination(crypto.webcrypto,vault,password,current,recipe.passphrase);
  await assert.rejects(()=>K.verifyDestination(crypto.webcrypto,vault,password,old,recipe.passphrase),/do not match/);
  await assert.rejects(()=>K.verifyDestination(crypto.webcrypto,vault,password,current,''),/do not match/);
  for(const phrase of [old,old.toUpperCase(),old.replace(' ','  '),old.replace('legal','légal'),Array(24).fill('fixture').join(' ')]){
   // Independent Node/OpenSSL SHA256 and secp256k1 verify the reference transform.
   const digest=crypto.createHash('sha256').update(phrase.trim(),'utf8').digest();digest[0]&=248;digest[31]=(digest[31]&127)|64;
   const ec=crypto.createECDH('secp256k1');ec.setPrivateKey(digest);
   const key=K.key(phrase,fingerprint);assert.equal(key.coin,'pep');assert.equal(key.compressed,true);
   assert.equal(key.privateKey.slice(2),digest.toString('hex'));assert.equal(key.publicKey.slice(2),ec.getPublicKey('hex','compressed'));
   const hash160=crypto.createHash('ripemd160').update(crypto.createHash('sha256').update(ec.getPublicKey(null,'compressed')).digest()).digest();
   assert.equal(T.script('pep',key.address),'76a914'+hash160.toString('hex')+'88ac');
  }
  assert.equal(K.key('  '+old+'\n',fingerprint).address,K.key(old,fingerprint).address);
  assert.notEqual(K.key(old.replace(' ','  '),fingerprint).address,K.key(old,fingerprint).address);
  assert.notEqual(K.key(old.toUpperCase(),fingerprint).address,K.key(old,fingerprint).address);
  for(const reused of [current,current.toUpperCase(),current.replaceAll(' ','  ')])assert.throws(()=>K.key(reused,fingerprint),/Do not reuse/);
  for(const bad of ['',old.split(' ').slice(1).join(' '),'x'.repeat(2049),null])assert.throws(()=>K.key(bad,fingerprint));
  assert.throws(()=>K.key(old,''),/Verify/);
 }
 await assert.rejects(()=>K.verifyDestination(crypto.webcrypto,encrypted,'Wrong-fixture-password',current,recipe.passphrase),/Incorrect password/);
 const normal=R.create(ethers),legacy=R.create(ethers,{mode:'komodo'}),invalidChecksum=Array(12).fill('abandon').join(' ');
 assert.equal(normal.inspect(invalidChecksum).valid,false);assert.equal(legacy.inspect(invalidChecksum).valid,true);
 assert.equal(legacy.inspect(Array(12).fill('legacy-custom').join(' ')).valid,true);
 assert.equal(legacy.inspect(Array(15).fill('abandon').join(' ')).valid,false);
 assert.deepEqual(legacy.suggest('aban',4).matches,normal.suggest('aban',4).matches);
 console.log('PASS: isolated legacy Komodo PEP derivation, independent SHA256/secp256k1 checks, exact text semantics, current-wallet backup/password verification, no seed reuse and separate recovery validation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
