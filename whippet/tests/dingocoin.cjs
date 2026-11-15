// Public throwaway seed only; independent keys/signatures, no network or funds.
const assert=require('node:assert/strict'),{webcrypto,pbkdf2Sync}=require('node:crypto');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const G=require('../../recovery/wallet.js'),F=require('../../recovery/formats.js'),B=require('../../recovery/wallet-format.js');
const bitcore=require('bitcore-lib-doge'),R=require('../www/reporting.js');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
(async()=>{
 const recipe=E.recipe(ethers,phrase,'TREZOR'),old=structuredClone(recipe);delete old.paths.dingo;
 for(const engine of [E,B]){
  assert.deepEqual(engine.validateRecipe(ethers,old),recipe);
  assert.throws(()=>engine.validateRecipe(ethers,{...recipe,paths:{...recipe.paths,dingo:"m/44'/0'/0'/0/{index}"}}));
  for(const [data,pw]of [[engine.unprotected(webcrypto,old),''],[await engine.encrypt(webcrypto,old,'Public-password-123'),'Public-password-123']])
   assert.deepEqual(E.validateRecipe(ethers,await engine.decrypt(webcrypto,JSON.parse(JSON.stringify(data)),pw)),recipe);
 }
 const bundle=await G.deriveAsync(ethers,phrase,{coin:'dingo',passphrase:'TREZOR',count:1000});
 assert.equal(bundle.format,'dingocoin-seed-v1');assert.equal(new Set(bundle.wallets.map(w=>w.address)).size,1000);
 const independent=bitcore.HDPrivateKey.fromSeed(pbkdf2Sync(phrase,'mnemonicTREZOR',2048,64,'sha512'));
 for(let i=0;i<200;i++){
  const key=independent.deriveChild("m/44'/3'/0'/0/"+i).privateKey,row=bundle.wallets[i];
  assert.equal(row.address,key.toAddress().toString());assert.equal(row.wif,key.toWIF());
  assert.equal(E.accounts(ethers,recipe,i).dingo.address,row.address);
  assert.equal(E.accounts(ethers,recipe,i).doge.address,row.address,'Official paths match; chain identity must not rely on addresses');
  assert.equal(T.sweepKey('dingo',row.wif).address,row.address);
 }
 for(const exported of [bundle,F.exportJSON(ethers,B,webcrypto,bundle)])
  assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,JSON.parse(JSON.stringify(exported))),bundle);
 const owner=E.accounts(ethers,recipe).dingo,destination=E.accounts(ethers,recipe,1).dingo.address;
 const p2sh=bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([22]),Buffer.alloc(20,4)]));
 assert.match(T.script('dingo',p2sh),/^a914/);assert.throws(()=>T.script('dingo','bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9e75rs'));
 const funding=(count,value=10n*T.COIN,coinbase=false)=>{
  const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:coinbase?'0'.repeat(64):'ab'.repeat(32),pos:coinbase?0xffffffff:0,script:'01'}],outputs:Array.from({length:count},()=>({value,script:T.script('dingo',owner.address)})),locktime:0})).slice(2);
  return Array.from({length:count},(_,pos)=>({...owner,index:0,raw,txid:T.parse(raw).txid,pos,height:100,value}));
 };
 const opts={coin:'dingo',destination,changeAddress:owner.address,tip:500,feeRate:T.COIN,feeIncluded:true};
 for(const count of [1,6,7,8]){
  const utxos=funding(count),plan=T.plan({...opts,amount:String(count*10),utxos});
  const expected=BigInt(Math.ceil((78+149*count)/1000))*T.COIN;
  assert.equal(plan.fee,expected);assert.equal(plan.amount+plan.fee,BigInt(count)*10n*T.COIN);
  const signed=T.sign(plan,recipe),tx=new bitcore.Transaction(signed.raw);
  assert.ok(plan.fee>=BigInt(Math.ceil(signed.raw.length/2/1000))*T.COIN);
  tx.inputs.forEach((input,i)=>{const chunks=input.script.chunks;assert.ok(bitcore.Transaction.sighash.verify(tx,bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),bitcore.PublicKey.fromBuffer(chunks[1].buf),i,new bitcore.Script(plan.inputs[i].script)));});
 }
 const utxos=funding(1);assert.throws(()=>T.plan({...opts,utxos,amount:'1.99'}),/at least 1/);
 assert.equal(T.plan({...opts,utxos,amount:'2'}).amount,T.COIN);
 assert.throws(()=>T.plan({...opts,utxos,amount:'9.5'}),/change/);
 assert.throws(()=>T.plan({...opts,utxos,amount:'5',flatFee:true}));
 assert.throws(()=>T.plan({...opts,utxos,amount:'5',oneCoinFee:true}));
 assert.throws(()=>T.plan({...opts,utxos,amount:'5',feeRate:undefined}),/current/);
 assert.throws(()=>T.plan({...opts,utxos,amount:'5',feeRate:10n*T.COIN+1n}),/safety/);
 assert.throws(()=>T.plan({...opts,utxos:funding(1,T.policy('dingo').maxMoney+1n),amount:'5'}),/network limit/);
 const mined=funding(1,10n*T.COIN,true)[0];assert.throws(()=>T.verifyUTXO('dingo',mined,338),/mature/);assert.ok(T.verifyUTXO('dingo',mined,339));
 assert.equal(T.sweepFee(999,T.COIN,'dingo').requiredFee,T.COIN);
 assert.equal(T.sweepFee(1001,T.COIN,'dingo').requiredFee,2n*T.COIN);
 assert.equal(T.sweepFee(1001,T.COIN,'dingo').fee,250000000n);
 assert.throws(()=>T.sweepFee(17000,T.COIN,'dingo'),/safety/);
 assert.equal(require('../www/komodo.js').supports('dingo'),false);
 const now=Date.now(),q=R.dingoQuote({dingocoin:{usd:.00001,last_updated_at:Math.floor(now/1000)}},now);
 assert.equal(R.valueInUsdt('dingo',100000000n,null,1,null,null,null,null,null,q.value),.00001);
 console.log('PASS: DINGO 200 independent keys, 1000-key offline round trips, legacy backups, signatures, whole-kB fees, 1-coin dust, amount/rate caps, maturity and official DOGE-compatible key format.');
})().catch(e=>{console.error(e);process.exitCode=1;});
