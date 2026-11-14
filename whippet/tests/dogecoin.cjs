// Public BIP39 fixtures only. Synthetic transactions; no broadcasts.
const assert=require('node:assert/strict'),{webcrypto,pbkdf2Sync}=require('node:crypto');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),R=require('../www/reporting.js'),S=require('../www/scanner.js');
const G=require('../../recovery/wallet.js'),F=require('../../recovery/formats.js'),B=require('../../recovery/wallet-format.js');
const ethers=require('../www/assets/ethers.umd.min.js'),bitcore=require('bitcore-lib-doge');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
(async()=>{
 const recipe=E.recipe(ethers,phrase),old=structuredClone(recipe);delete old.paths.doge;
 for(const engine of [E,B]){
  assert.deepEqual(engine.validateRecipe(ethers,old),recipe);
  assert.throws(()=>engine.validateRecipe(ethers,{...old,paths:{...old.paths,doge:"m/44'/0'/0'/0/{index}"}}));
  for(const backup of [engine.unprotected(webcrypto,old),await engine.encrypt(webcrypto,old,'Public-fixture-password')])assert.deepEqual(engine.validateRecipe(ethers,await engine.decrypt(webcrypto,backup,'Public-fixture-password')),recipe);
 }
 const bundle=await G.deriveAsync(ethers,phrase,{coin:'doge',count:1000});
 const independent=bitcore.HDPrivateKey.fromSeed(pbkdf2Sync(phrase,'mnemonic',2048,64,'sha512'));
 for(const i of [0,1,19,199,999]){
  const key=independent.deriveChild("m/44'/3'/0'/0/"+i).privateKey,row=bundle.wallets[i];
  assert.equal(row.address,key.toAddress(bitcore.Networks.livenet).toString());
  assert.equal(row.wif,key.toWIF());assert.equal(row.address,E.accounts(ethers,recipe,i).doge.address);
  assert.equal(T.sweepKey('doge',row.wif).address,row.address);assert.throws(()=>T.sweepKey('ltc',row.wif));
  // Shared WIF prefixes do not identify a chain: each asset produces a different address.
  for(const coin of ['pep','wht','shic'])assert.notEqual(T.sweepKey(coin,row.wif).address,row.address);
 }
 assert.equal(new Set(bundle.wallets.map(w=>w.address)).size,1000);
 for(const backup of [bundle,F.exportJSON(ethers,B,webcrypto,bundle)])assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,backup),bundle);
 const owner=E.accounts(ethers,recipe).doge,destination=bundle.wallets[1].address;
 const p2sh=bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([22]),Buffer.alloc(20,9)]));
 assert.equal(T.script('doge',p2sh),'a914'+'09'.repeat(20)+'87');
 assert.equal(S.address('dogecoin:'+destination+'?amount=999','doge',T.script),destination);
 for(const bad of [bundle.wallets[0].address.slice(0,-1)+'0',E.accounts(ethers,recipe).pep.address,E.accounts(ethers,recipe).ltc.address,'ltc1q'+'q'.repeat(40)])assert.throws(()=>T.script('doge',bad));
 const funding=(address,coinbase=false)=>ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:(coinbase?'00':'ab').repeat(32),pos:coinbase?0xffffffff:0,script:''}],outputs:[{value:500000000n,script:T.script('doge',address)}],locktime:0})).slice(2);
 const raw=funding(owner.address),input={...owner,raw,txid:T.parse(raw).txid,pos:0,height:1,value:500000000n};
 function verify(signed,inputs){const tx=new bitcore.Transaction(signed.raw);for(let i=0;i<inputs.length;i++){const chunks=tx.inputs[i].script.chunks;assert.equal(bitcore.Transaction.sighash.verify(tx,bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),bitcore.PublicKey.fromBuffer(chunks[1].buf),i,new bitcore.Script(inputs[i].script)),true);}}
 for(const recipient of [destination,p2sh]){
  const p=T.plan({coin:'doge',destination:recipient,changeAddress:owner.address,amount:'5',tip:500,utxos:[input],feeIncluded:true,flatFee:true,feeRate:100000n});
  assert.equal(p.fee,1000000n);assert.equal(p.amount,499000000n);assert.equal(p.change,0n);verify(T.sign(p,recipe),p.inputs);
  assert.throws(()=>T.sign({...p,fee:1000001n},recipe));
 }
 for(const bad of [{value:input.value+1n},{txid:'ff'.repeat(32)},{address:destination}])assert.throws(()=>T.verifyUTXO('doge',{...input,...bad},500));
 const cb=funding(owner.address,true),reward={...input,raw:cb,txid:T.parse(cb).txid,height:261};T.verifyUTXO('doge',reward,500);assert.throws(()=>T.verifyUTXO('doge',reward,499));
 assert.throws(()=>T.plan({coin:'doge',destination,changeAddress:owner.address,amount:'0.009',tip:500,utxos:[input]}));
 for(const compressed of [true,false]){
  const privateKey=new bitcore.PrivateKey({...independent.deriveChild("m/44'/3'/0'/0/0").privateKey.toObject(),compressed});
  const key=T.sweepKey('doge',privateKey.toWIF()),sourceRaw=funding(key.address);
  const source={index:0,address:key.address,raw:sourceRaw,txid:T.parse(sourceRaw).txid,pos:0,height:1,value:500000000n};
  const p=T.sweepPlan({coin:'doge',destination,utxos:[source],tip:500,feeRate:100000n,compressed});
  assert.equal(p.fee,compressed?241250n:281250n);assert.equal(p.amount+p.fee,500000000n);
  verify(T.signSweep(p,key,recipe,1),p.inputs);assert.throws(()=>T.signSweep(p,{...key,coin:'shic'},recipe,1));
 }
 const quote=R.dogeQuote({dogecoin:{usd:.1,last_updated_at:Math.floor(Date.now()/1000)}});assert.equal(quote.value,.1);
 assert.equal(R.valueInUsdt('doge',500000000n,null,.5,null,null,.1),1);
 assert.throws(()=>R.dogeQuote({dogecoin:{usd:.1,last_updated_at:1}}));
 console.log('PASS: Dogecoin derivation, portable backups, offline exports, address validation, independent signatures, fee rules, maturity and sweeps.');
})().catch(e=>{console.error(e);process.exitCode=1;});
