// Public BIP39 fixtures only. No user wallets, funding, or broadcasts.
const assert=require('node:assert/strict'),{webcrypto,pbkdf2Sync}=require('node:crypto');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const G=require('../../recovery/wallet.js'),F=require('../../recovery/formats.js'),B=require('../../recovery/wallet-format.js');
const bitcore=require('bitcore-lib-doge');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
(async()=>{
 const recipe=E.recipe(ethers,phrase,'TREZOR'),legacy=structuredClone(recipe);delete legacy.paths.shic;
 assert.equal(E.NETWORKS.shic.path,"m/44'/4474'/0'/0/{index}");
 assert.equal(E.NETWORKS.shic.prefix,63);assert.equal(E.NETWORKS.shic.wif,158);
 assert.deepEqual(E.validateRecipe(ethers,legacy),recipe);
 assert.deepEqual(B.validateRecipe(ethers,legacy),recipe);
 for(const engine of [E,B]){
  assert.throws(()=>engine.validateRecipe(ethers,{...recipe,paths:{...recipe.paths,shic:"m/44'/3'/0'/0/{index}"}}));
  const plain=engine.unprotected(webcrypto,legacy);
  assert.deepEqual(E.accounts(ethers,await engine.decrypt(webcrypto,plain,'')),E.accounts(ethers,recipe));
  const encrypted=await engine.encrypt(webcrypto,legacy,'Public-fixture-password-123');
  assert.deepEqual(engine.validateRecipe(ethers,await engine.decrypt(webcrypto,encrypted,'Public-fixture-password-123')),recipe);
 }
 const bundle=await G.deriveAsync(ethers,phrase,{coin:'shic',passphrase:'TREZOR',count:1000});
 assert.equal(bundle.format,'shibacoin-seed-v1');
 assert.equal(new Set(bundle.wallets.map(w=>w.address)).size,1000);
 const independent=bitcore.HDPrivateKey.fromSeed(pbkdf2Sync(phrase,'mnemonicTREZOR',2048,64,'sha512'));
 for(const index of [0,1,19,199,999]){
  const row=bundle.wallets[index],key=independent.deriveChild("m/44'/4474'/0'/0/"+index).privateKey;
  const checked=bitcore.encoding.Base58Check.decode(row.wif);
  assert.equal(checked[0],158);assert.equal(checked.at(-1),1);
  assert.equal(checked.subarray(1,33).toString('hex'),key.toBuffer().toString('hex'));
  const address=bitcore.encoding.Base58Check.decode(row.address);
  assert.equal(address[0],63);
  assert.deepEqual(address.subarray(1),bitcore.crypto.Hash.sha256ripemd160(key.toPublicKey().toBuffer()));
  assert.equal(row.address,E.accounts(ethers,recipe,index).shic.address);
  assert.equal(T.sweepKey('shic',row.wif).address,row.address);
  for(const coin of ['pep','wht'])assert.throws(()=>T.script(coin,row.address));
 }
 const exported=F.exportJSON(ethers,B,webcrypto,bundle);
 E.validateEnvelope(exported);assert.deepEqual(E.validateRecipe(ethers,exported.recipe),recipe);
 assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,exported,{coin:'pep'}),bundle);
 assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,bundle),bundle);
 assert.equal(F.exportText(bundle).trim().split('\n').length,1000);
 assert.ok(F.exportCSV(bundle).includes(bundle.wallets[999].address));
 const bad=structuredClone(bundle);bad.wallets[0].wif=bundle.wallets[1].wif;
 await assert.rejects(F.importJSON(ethers,G,B,webcrypto,bad),/do not match/);
 const owner=E.accounts(ethers,recipe).shic,destination=E.accounts(ethers,recipe,1).shic.address;
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:500000000n,script:T.script('shic',owner.address)}],locktime:0})).slice(2);
 const plan=T.plan({coin:'shic',destination,changeAddress:owner.address,amount:'1',tip:500,utxos:[{...owner,raw,txid:T.parse(raw).txid,pos:0,height:1,value:500000000n}]});
 const signed=T.sign(plan,recipe),tx=new bitcore.Transaction(signed.raw);
 tx.inputs.forEach((input,i)=>{const chunks=input.script.chunks;assert.equal(bitcore.Transaction.sighash.verify(tx,bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),bitcore.PublicKey.fromBuffer(chunks[1].buf),i,new bitcore.Script(plan.inputs[i].script)),true);});
 assert.equal(T.parse(signed.raw).outputs[0].value,100000000n);
 assert.equal(plan.amount+plan.fee+plan.change,500000000n);
 assert.throws(()=>T.sign({...plan,coin:'pep'},recipe));
 console.log('PASS: SHIC independent HD/WIF/address/signature checks; 1000-key offline JSON round trip; old encrypted/plain backup compatibility; wrong-chain and tampered-backup rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
