// Public throwaway BIP39 data only. Independent derivation/signature verification.
const assert=require('node:assert/strict'),{webcrypto,pbkdf2Sync}=require('node:crypto');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const G=require('../../recovery/wallet.js'),F=require('../../recovery/formats.js'),B=require('../../recovery/wallet-format.js');
const bitcore=require('bitcore-lib-doge'),{bech32,bech32m}=require('bech32');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
(async()=>{
 const recipe=E.recipe(ethers,phrase,'TREZOR'),old=structuredClone(recipe);delete old.paths.bel;
 for(const engine of [E,B]){
  assert.deepEqual(engine.validateRecipe(ethers,old),recipe);
  assert.throws(()=>engine.validateRecipe(ethers,{...recipe,paths:{...recipe.paths,bel:"m/44'/0'/0'/0/{index}"}}));
  const plain=engine.unprotected(webcrypto,old),sealed=await engine.encrypt(webcrypto,old,'Public-fixture-password-123');
  for(const [data,password] of [[plain,''],[sealed,'Public-fixture-password-123']])assert.deepEqual(E.validateRecipe(ethers,await engine.decrypt(webcrypto,JSON.parse(JSON.stringify(data)),password)),recipe);
 }
 const bundle=await G.deriveAsync(ethers,phrase,{coin:'bel',passphrase:'TREZOR',count:1000});
 assert.equal(bundle.format,'bellscoin-seed-v1');assert.equal(new Set(bundle.wallets.map(w=>w.address)).size,1000);
 const independent=bitcore.HDPrivateKey.fromSeed(pbkdf2Sync(phrase,'mnemonicTREZOR',2048,64,'sha512'));
 for(let index=0;index<200;index++){
  const row=bundle.wallets[index],key=independent.deriveChild("m/44'/762'/0'/0/"+index).privateKey;
  const decoded=bitcore.encoding.Base58Check.decode(row.wif);
  assert.equal(decoded[0],153);assert.equal(decoded.at(-1),1);assert.deepEqual(decoded.subarray(1,33),key.toBuffer());
  const address=bitcore.encoding.Base58Check.decode(row.address);assert.equal(address[0],25);
  assert.deepEqual(address.subarray(1),bitcore.crypto.Hash.sha256ripemd160(key.toPublicKey().toBuffer()));
  assert.equal(row.address,E.accounts(ethers,recipe,index).bel.address);assert.equal(T.sweepKey('bel',row.wif).address,row.address);
 }
 const exported=JSON.parse(JSON.stringify(F.exportJSON(ethers,B,webcrypto,bundle)));
 assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,exported),bundle);
 assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,bundle),bundle);
 const owner=E.accounts(ethers,recipe).bel,destination=E.accounts(ethers,recipe,1).bel.address;
 for(const coin of ['pep','doge','ltc','shic','wht','btc'])assert.throws(()=>T.script(coin,owner.address));
 for(const address of [bech32.encode('bel',[0,...bech32.toWords(Buffer.alloc(20,7))]),bech32m.encode('bel',[1,...bech32m.toWords(Buffer.alloc(32,7))])])assert.ok(T.script('bel',address));
 const p2sh=bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([30]),Buffer.alloc(20,4)]));assert.match(T.script('bel',p2sh),/^a914/);
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:500000000n,script:T.script('bel',owner.address)}],locktime:0})).slice(2);
 const utxo={...owner,raw,txid:T.parse(raw).txid,pos:0,height:100,value:500000000n};
 const opts={coin:'bel',destination,changeAddress:owner.address,amount:'1',tip:500,utxos:[utxo],feeRate:10000n};
 const plan=T.plan(opts),signed=T.sign(plan,recipe),tx=new bitcore.Transaction(signed.raw);
 assert.equal(plan.fee,2270n);assert.equal(plan.amount+plan.fee+plan.change,500000000n);
 assert.ok(plan.fee>=BigInt(signed.raw.length/2)*10n);
 for(const count of [2,8]){
  const manyRaw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:Array.from({length:count},()=>({value:500000000n,script:T.script('bel',owner.address)})),locktime:0})).slice(2);
  const many=T.plan({...opts,amount:String(count*5),feeIncluded:true,utxos:Array.from({length:count},(_,pos)=>({...utxo,pos,raw:manyRaw,txid:T.parse(manyRaw).txid}))});
  assert.equal(many.inputs.length,count);assert.equal(many.fee,BigInt(78+149*count)*10n);assert.equal(many.amount+many.fee,BigInt(count)*500000000n);
  assert.ok(many.fee>=BigInt(T.sign(many,recipe).raw.length/2)*10n);
 }
 tx.inputs.forEach((input,i)=>{const chunks=input.script.chunks;assert.equal(bitcore.Transaction.sighash.verify(tx,bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),bitcore.PublicKey.fromBuffer(chunks[1].buf),i,new bitcore.Script(plan.inputs[i].script)),true);});
 assert.throws(()=>T.plan({...opts,feeRate:undefined}),/current/);assert.throws(()=>T.plan({...opts,feeRate:1000001n}),/safety/);
 assert.throws(()=>T.plan({...opts,flatFee:true}));assert.equal(T.supportsOneCoinFee('bel'),false);
 assert.equal(T.policy('bel').maturity,30);assert.equal(require('../www/komodo.js').supports('bel'),false);
 const coinbase=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'0'.repeat(64),pos:0xffffffff,script:'00'}],outputs:[{value:500000000n,script:T.script('bel',owner.address)}],locktime:0})).slice(2);
 const mined={...utxo,raw:coinbase,txid:T.parse(coinbase).txid};assert.throws(()=>T.verifyUTXO('bel',mined,128),/mature/);assert.ok(T.verifyUTXO('bel',mined,129));
 console.log('PASS: BELLS 200 independent keys, 1000-key offline JSON round trip, legacy backups, signatures, SegWit/P2SH destinations, exact size fees, maturity and no Komodo.');
})().catch(e=>{console.error(e);process.exitCode=1;});
