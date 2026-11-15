// Public disposable BIP39 fixture; independent BIP32 and signature verification.
const assert=require('node:assert/strict'),{webcrypto,pbkdf2Sync}=require('node:crypto');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const G=require('../../recovery/wallet.js'),F=require('../../recovery/formats.js'),B=require('../../recovery/wallet-format.js');
const bitcore=require('bitcore-lib-doge');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
(async()=>{
 const recipe=E.recipe(ethers,phrase,'TREZOR'),old=structuredClone(recipe);delete old.paths.bonc;
 for(const engine of [E,B]){
  assert.deepEqual(engine.validateRecipe(ethers,old),recipe);
  assert.throws(()=>engine.validateRecipe(ethers,{...recipe,paths:{...recipe.paths,bonc:"m/0'/3'/{index}'"}}));
  for(const [data,pw]of [[engine.unprotected(webcrypto,old),''],[await engine.encrypt(webcrypto,old,'Public-password-123'),'Public-password-123']])
   assert.deepEqual(E.validateRecipe(ethers,await engine.decrypt(webcrypto,JSON.parse(JSON.stringify(data)),pw)),recipe);
 }
 const bundle=await G.deriveAsync(ethers,phrase,{coin:'bonc',passphrase:'TREZOR',count:1000});
 assert.equal(bundle.format,'bonkcoin-seed-v1');assert.equal(new Set(bundle.wallets.map(w=>w.address)).size,1000);
 const master=bitcore.HDPrivateKey.fromSeed(pbkdf2Sync(phrase,'mnemonicTREZOR',2048,64,'sha512'));
 for(let i=0;i<200;i++){
  const key=master.deriveChild("m/0'/0'/"+i+"'").privateKey,row=bundle.wallets[i];
  const pub=key.publicKey.toBuffer(),hash=bitcore.crypto.Hash.sha256ripemd160(pub);
  assert.equal(row.address,bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([25]),hash])));
  assert.equal(row.wif,bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([151]),key.toBuffer(),Buffer.from([1])])));
  assert.equal(E.accounts(ethers,recipe,i).bonc.address,row.address);
  assert.equal(T.sweepKey('bonc',row.wif).address,row.address);
 }
 for(const exported of [bundle,F.exportJSON(ethers,B,webcrypto,bundle)])
  assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,JSON.parse(JSON.stringify(exported))),bundle);
 const owner=E.accounts(ethers,recipe).bonc,destination=E.accounts(ethers,recipe,1).bonc.address;
 const p2sh=bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([28]),Buffer.alloc(20,4)]));
 assert.match(T.script('bonc',p2sh),/^a914/);assert.throws(()=>T.script('bonc',E.accounts(ethers,recipe).pep.address));
 assert.throws(()=>T.sweepKey('bel',bundle.wallets[0].wif),'Bells shares address version, not private-key version');
 const funding=(count,value=T.COIN,coinbase=false)=>{
  const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:coinbase?'0'.repeat(64):'ab'.repeat(32),pos:coinbase?0xffffffff:0,script:'01'}],outputs:Array.from({length:count},()=>({value,script:T.script('bonc',owner.address)})),locktime:0})).slice(2);
  return Array.from({length:count},(_,pos)=>({...owner,index:0,raw,txid:T.parse(raw).txid,pos,height:100,value}));
 };
 const opts={coin:'bonc',destination,changeAddress:owner.address,tip:500,feeRate:1000000n,feeIncluded:true};
 for(const count of [1,2,6,8]){
  const plan=T.plan({...opts,amount:String(count),utxos:funding(count)}),signed=T.sign(plan,recipe),tx=new bitcore.Transaction(signed.raw);
  assert.equal(plan.amount+plan.fee,BigInt(count)*T.COIN);
  assert.equal(plan.fee,BigInt(78+149*count)*1000n,'Exact-size fee, not one coin or rounded kilobytes');
  assert.ok(plan.fee>=BigInt(signed.raw.length/2)*1000n);
  tx.inputs.forEach((input,i)=>{const chunks=input.script.chunks;assert.ok(bitcore.Transaction.sighash.verify(tx,bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),bitcore.PublicKey.fromBuffer(chunks[1].buf),i,new bitcore.Script(plan.inputs[i].script)));});
 }
 const utxos=funding(1);
 for(const extra of [{amount:'0.01'},{amount:'0.999'},{amount:'0.5',flatFee:true},{amount:'0.5',oneCoinFee:true},{amount:'0.5',feeRate:undefined},{amount:'0.5',feeRate:10000001n}])assert.throws(()=>T.plan({...opts,utxos,...extra}));
 assert.throws(()=>T.plan({...opts,utxos:funding(1,T.policy('bonc').maxMoney+1n),amount:'5'}),/network limit/);
 const mined=funding(1,T.COIN,true)[0];assert.throws(()=>T.verifyUTXO('bonc',mined,338),/mature/);assert.ok(T.verifyUTXO('bonc',mined,339));
 assert.equal(T.sweepFee(1001,1000000n,'bonc').requiredFee,1001000n);
 assert.equal(require('../www/komodo.js').supports('bonc'),false);
 assert.equal(require('../www/reporting.js').valueInUsdt('bonc',T.COIN,1,1),null);
 console.log('PASS: BONC 200 independent keys/WIFs, 1000-key offline/JSON round trips, signed multi-input Max sends, exact-byte fees, dust/caps/maturity, no invented price or Komodo.');
})().catch(e=>{console.error(e);process.exitCode=1;});
