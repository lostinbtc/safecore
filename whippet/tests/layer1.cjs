// Public throwaway seed only. No network, real wallet files, or broadcasts.
const assert=require('node:assert/strict'),{webcrypto,pbkdf2Sync}=require('node:crypto');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const G=require('../../recovery/wallet.js'),F=require('../../recovery/formats.js'),B=require('../../recovery/wallet-format.js');
const bitcore=require('bitcore-lib-doge'),cash=require('bitcore-lib-cash');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const coins=['bch','dash','dgb','jkc','lky','rvn','cat','trmp','flop'],tip=800000;
const expected={flop:[35,158,3],cat:[21,149,760],trmp:[65,151,1707],bch:[0,128,145],dash:[76,204,5],dgb:[30,128,20],jkc:[16,144,2013],lky:[47,175,790],rvn:[60,128,175]};
function funding(coin,owner,count,value=T.COIN,extras={}){
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:Array.from({length:count},()=>({value,script:T.script(coin,owner.address)})),locktime:0,...extras})).slice(2);
 return Array.from({length:count},(_,pos)=>({...owner,raw,txid:T.parse(raw,coin).txid,pos,height:tip-200,value}));
}
function verify(plan,signed){
 const lib=plan.coin==='bch'?cash:bitcore,tx=new lib.Transaction(signed.raw);
 tx.inputs.forEach((input,i)=>{
  const chunks=input.script.chunks,sig=lib.crypto.Signature.fromTxFormat(chunks[0].buf),pub=lib.PublicKey.fromBuffer(chunks[1].buf),script=new lib.Script(plan.inputs[i].script);
  if(plan.coin==='lky'){
   // Independent Bitcore serialization + ECDSA; Core revival domain is uint256 LE.
   const copy=new lib.Transaction(signed.raw);
   copy.inputs.forEach((input,n)=>input.setScript(n===i?script:lib.Script.empty()));
   const chain=Buffer.from('000000000000000000000000000000004c55434b59434f494e5f5245564956414c','hex').reverse();
   const digest=lib.crypto.Hash.sha256sha256(Buffer.concat([chain,copy.toBuffer(),Buffer.from('01000000','hex')]));
   assert.ok(lib.crypto.ECDSA.verify(digest,sig,pub),'Luckycoin revival signature');
   assert.equal(lib.Transaction.sighash.verify(tx,sig,pub,i,script),false,'Legacy replay signature must not verify');
  }else{
   assert.ok(lib.Transaction.sighash.verify(tx,sig,pub,i,script,...(plan.coin==='bch'?[new cash.crypto.BN(String(plan.inputs[i].value))]:[])),plan.coin+' independent signature');
   if(plan.coin==='bch'){
    assert.equal(sig.nhashtype,0x41);
    assert.equal(lib.Transaction.sighash.verify(tx,sig,pub,i,script,new cash.crypto.BN(String(plan.inputs[i].value+1n))),false,'Input amount must be signed');
   }
  }
 });
 assert.equal(T.parse(signed.raw,plan.coin).outputs.reduce((n,o)=>n+o.value,0n)+plan.fee,plan.inputs.reduce((n,u)=>n+u.value,0n));
}
(async()=>{
 const recipe=E.recipe(ethers,phrase,'TREZOR'),old=structuredClone(recipe);for(const coin of coins)delete old.paths[coin];
 for(const engine of [E,B]){
  assert.deepEqual(engine.validateRecipe(ethers,old),recipe);
  for(const coin of coins)assert.throws(()=>engine.validateRecipe(ethers,{...recipe,paths:{...recipe.paths,[coin]:"m/44'/999'/0'/0/{index}"}}));
  for(const backup of [engine.unprotected(webcrypto,old),await engine.encrypt(webcrypto,old,'Public-password-123')])
   assert.deepEqual(engine.validateRecipe(ethers,await engine.decrypt(webcrypto,JSON.parse(JSON.stringify(backup)),'Public-password-123')),recipe);
 }
 const pool=E.receivePool(ethers,recipe,200),master=bitcore.HDPrivateKey.fromSeed(pbkdf2Sync(phrase,'mnemonicTREZOR',2048,64,'sha512'));
 for(const coin of coins){
  const [prefix,wif,path]=expected[coin],bundle=await G.deriveAsync(ethers,phrase,{coin,passphrase:'TREZOR',count:200});
  assert.equal(E.NETWORKS[coin].path,`m/44'/${path}'/0'/0/{index}`);
  for(let i=0;i<200;i++){
   const key=master.deriveChild(`m/44'/${path}'/0'/0/${i}`).privateKey;
   const address=coin==='bch'?new cash.PublicKey(key.publicKey.toBuffer()).toAddress().toString():bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([prefix]),bitcore.crypto.Hash.sha256ripemd160(key.publicKey.toBuffer())]));
   assert.equal(pool[coin][i].address,address,coin+' address '+i);
   assert.equal(bundle.wallets[i].address,address);
   assert.equal(bundle.wallets[i].wif,bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([wif]),key.toBuffer(),Buffer.from([1])])));
   assert.equal(T.sweepKey(coin,bundle.wallets[i].wif).address,address);
  }
  for(const data of [bundle,F.exportJSON(ethers,B,webcrypto,bundle)])
   assert.deepEqual(await F.importJSON(ethers,G,B,webcrypto,JSON.parse(JSON.stringify(data))),bundle);
  const owner=pool[coin][0],destination=pool[coin][1].address,feeRate=T.policy(coin).minRate;
  for(const count of [1,2,6,8]){
   const plan=T.plan({coin,destination,changeAddress:owner.address,amount:String(count),utxos:funding(coin,owner,count),tip,feeRate,feeIncluded:true});
   const signed=T.sign(plan,recipe);verify(plan,signed);
   assert.equal(plan.fee,(BigInt(78+149*count)*feeRate+999n)/1000n);
   assert.ok(plan.fee>=(BigInt(signed.raw.length/2)*feeRate+999n)/1000n);
   assert.equal(plan.amount+plan.fee,BigInt(count)*T.COIN);
   assert.throws(()=>T.sign({...plan,extraPayload:'00'},recipe));
  }
  const opts={coin,destination,changeAddress:owner.address,amount:'1',utxos:funding(coin,owner,1),tip,feeRate,feeIncluded:true};
  for(const extra of [{feeRate:undefined},{feeRate:T.policy(coin).maxRate+1n},{flatFee:true},{oneCoinFee:true}])assert.throws(()=>T.plan({...opts,...extra}));
  const key=T.sweepKey(coin,bundle.wallets[2].wif),src={...pool[coin][2],index:2};
  const plan=T.sweepPlan({coin,destination:owner.address,utxos:funding(coin,src,2),tip,feeRate});
  verify(plan,T.signSweep(plan,key,recipe,0));
  const mined=funding(coin,owner,1,T.COIN,{inputs:[{txid:'0'.repeat(64),pos:0xffffffff,script:'01'}]})[0];
  assert.throws(()=>T.verifyUTXO(coin,mined,mined.height+T.policy(coin).maturity-2),/mature/);
  assert.ok(T.verifyUTXO(coin,mined,mined.height+T.policy(coin).maturity-1));
  assert.equal(require('../www/komodo.js').supports(coin),false);
 }
 // Also cover a 24-word recovery recipe and the offline tool's last supported
 // address, not only the wallet's 200-address receive window.
 const longPhrase=ethers.utils.entropyToMnemonic('0x'+'01'.repeat(32)),passphrase='Public 24-word fixture';
 const longRecipe=E.recipe(ethers,longPhrase,passphrase);
 const longMaster=bitcore.HDPrivateKey.fromSeed(pbkdf2Sync(longPhrase,'mnemonic'+passphrase,2048,64,'sha512'));
 for(const coin of coins)for(const index of [0,199,999]){
  const [prefix,,path]=expected[coin],key=longMaster.deriveChild(`m/44'/${path}'/0'/0/${index}`).privateKey;
  const address=coin==='bch'?new cash.PublicKey(key.publicKey.toBuffer()).toAddress().toString():bitcore.encoding.Base58Check.encode(Buffer.concat([Buffer.from([prefix]),bitcore.crypto.Hash.sha256ripemd160(key.publicKey.toBuffer())]));
  assert.equal(E.accounts(ethers,longRecipe,index)[coin].address,address);
  assert.equal(B.accounts(ethers,longRecipe,index)[coin].address,address);
 }
 const hash='76a04053bda0a88bda5177b86a15c3b29f559873',address='bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a';
 assert.equal(E.cashAddress(hash),address);assert.equal(B.cashAddress(hash),address);
 assert.equal(T.script('bch',address),'76a914'+hash+'88ac');assert.equal(T.script('bch',address.toUpperCase()),T.script('bch',address));
 assert.equal(T.script('bch',E.cashAddress(hash,1)),'a914'+hash+'87');
 for(const bad of [address+'a',address.replace('qpm','Qpm'),address.replace('bitcoincash','bchtest'),E.accounts(ethers,recipe).btc.address])assert.throws(()=>T.script('bch',bad));
 const dash=funding('dash',pool.dash[0],1,T.COIN,{version:(5<<16)|3,extraPayload:'010203'})[0];
 assert.ok(T.verifyUTXO('dash',dash,tip));assert.throws(()=>T.parse(dash.raw,'btc'),/Trailing/);
 for(const coin of ['bch','rvn']){
  const owner=pool[coin][0],prev=funding(coin,owner,1,T.COIN,{outputs:[{value:T.COIN,script:coin==='bch'?'ef'+'00'.repeat(34)+T.script(coin,owner.address):T.script(coin,owner.address)+'c0'}]})[0];
  assert.throws(()=>T.verifyUTXO(coin,prev,tip),/match/);
 }
 const meta=funding('dgb',pool.dgb[0],1,T.COIN,{outputs:[{value:T.COIN,script:T.script('dgb',pool.dgb[0].address)},{value:0n,script:'6a024441'}]})[0];
 assert.throws(()=>T.verifyUTXO('dgb',meta,tip),/metadata/);
 console.log('PASS: nine chains: 1,800 independently derived keys, offline/backup round trips, multi-input and sweep signatures, BCH/LKY replay rules, fees, maturity and unsupported token rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
