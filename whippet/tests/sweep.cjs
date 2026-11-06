// Public key scalar 1 is a disposable test vector. Never use it for real funds.
const assert=require('node:assert/strict'),E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js'),bitcore=require('bitcore-lib-doge');
const U=ethers.utils,recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
assert.deepEqual(T.sweepFee(192),{rate:1000000n,requiredFee:192000n,fee:240000n});
assert.equal(T.sweepFee(193,1000001n).fee,241251n); // Fractional base unit rounds up once.
assert.equal(T.sweepFee(193,1000001n).requiredFee,193001n);
assert.equal(T.sweepFee(193,100000n).fee,241250n); // Recommended floor, not relay-only pricing.
assert.equal(T.sweepFee(193,2000000n).fee,482500n);
assert.equal(T.sweepFee(193,1250000n).requiredFee,T.sweepFee(193).fee);
assert.equal(T.sweepFee(193,1250001n).requiredFee,T.sweepFee(193).fee+1n);
assert.deepEqual([999,1000,1001].map(size=>T.sweepFee(size).fee),[1248750n,1250000n,1251250n]);
for(const size of [0,-1,1.5,100000,NaN])assert.throws(()=>T.sweepFee(size),/size/);
function wif(scalar,compressed=true,prefix=158){const b=U.concat([[prefix],U.zeroPad(U.arrayify(U.hexlify(scalar)),32),compressed?[1]:[]]);return U.base58.encode(U.concat([b,U.arrayify(U.sha256(U.sha256(b))).slice(0,4)]));}
for(const coin of ['pep','wht'])for(const compressed of [true,false]){
 const encoded=wif(1,compressed),key=T.sweepKey(coin,encoded),dest=E.accounts(ethers,recipe,199)[coin].address;
 assert.equal(key.publicKey.length,compressed?68:132);
 for(const bad of ['',encoded.slice(0,-1)+'0',recipe.mnemonic,wif(0),wif(1,true,128),'https://example.test/'+encoded])assert.throws(()=>T.sweepKey(coin,bad),/valid mainnet WIF/);
 const funding={version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:'',sequence:0xffffffff}],outputs:[{value:100000000n,script:T.script(coin,key.address)},{value:200000000n,script:T.script(coin,key.address)}],locktime:0};
 const raw=U.hexlify(T.serialize(funding)).slice(2),prev=T.parse(raw),utxos=prev.outputs.map((o,pos)=>({index:0,address:key.address,txid:prev.txid,pos,height:1,value:o.value,raw}));
 const p=T.sweepPlan({coin,destination:dest,utxos,tip:500,feeRate:1000000n,compressed});
 assert.equal(p.fee,compressed?427500n:507500n);assert.equal(p.amount,300000000n-p.fee);assert.equal(p.change,0n);assert.equal(p.inputs.length,2);
 const signed=T.signSweep(p,key,recipe,199),parsed=T.parse(signed.raw);assert.equal(parsed.outputs.length,1);assert.equal(parsed.outputs[0].script,T.script(coin,dest));
 // Independently verify every ECDSA input signature using Bitcore, including uncompressed keys.
 const tx=new bitcore.Transaction(signed.raw);
 tx.inputs.forEach((input,i)=>{const chunks=input.script.chunks;const sig=bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),pub=bitcore.PublicKey.fromBuffer(chunks[1].buf);assert.equal(bitcore.Transaction.sighash.verify(tx,sig,pub,i,new bitcore.Script(p.inputs[i].script)),true);});
 assert.ok(signed.raw.length/2<1000);
 assert.throws(()=>T.signSweep({...p,destination:E.accounts(ethers,recipe,0)[coin].address},key,recipe,199),/destination/);
 assert.throws(()=>T.signSweep(p,T.sweepKey(coin,wif(2,compressed)),recipe,199),/owned/);
 assert.throws(()=>T.signSweep(p,key,recipe,200),/Invalid sweep/);
 assert.throws(()=>T.sweepPlan({coin,destination:dest,utxos:[],tip:500}),/No confirmed/);
 assert.throws(()=>T.sweepPlan({coin,destination:dest,utxos:Array(6).fill(utxos[0]),tip:500,compressed}),/Duplicate/);
 assert.throws(()=>T.sweepPlan({coin,destination:dest,utxos:[{...utxos[0],height:0}],tip:500}),/confirmed/);
 const owned=E.accounts(ethers,recipe,199)[coin],fund2={...funding,outputs:[{value:100000000n,script:T.script(coin,owned.address)}]},raw2=U.hexlify(T.serialize(fund2)).slice(2);
 const p2=T.plan({coin,destination:E.accounts(ethers,recipe,0)[coin].address,changeAddress:E.accounts(ethers,recipe,0)[coin].address,amount:'1',feeIncluded:true,flatFee:true,tip:500,utxos:[{...owned,pos:0,height:1,raw:raw2,txid:T.parse(raw2).txid,value:100000000n}]});
 assert.equal(T.parse(T.sign(p2,recipe).raw).outputs[0].value,99000000n);
 // Full-source sweeps bypass the ordinary 5/8/40/100-output and 0.1-fee caps.
 for(const count of [6,7,121,...(coin==='pep'&&compressed?[253]:[])]){
  const fund={...funding,outputs:Array.from({length:count},()=>({value:100000000n,script:T.script(coin,key.address)}))};
  const rawMany=U.hexlify(T.serialize(fund)).slice(2),id=T.parse(rawMany).txid;
  const all=fund.outputs.map((o,pos)=>({index:0,address:key.address,txid:id,pos,height:1,value:o.value,raw:rawMany}));
  const review=T.sweepPlan({coin,destination:dest,utxos:all,tip:500,feeRate:1000000n,compressed});
  assert.equal(review.inputs.length,count);assert.equal(review.budget,BigInt(count)*100000000n);
  assert.equal(review.amount+review.fee,review.budget);assert.equal(review.change,0n);
  assert.equal(review.fee,BigInt(review.estimatedBytes)*1250n);
  if(count===6)assert.equal(review.fee,compressed?1172500n:1412500n);
  if(count===7)assert.equal(review.fee,compressed?1358750n:1638750n); // No whole-kB step or per-input compounding.
  if(count>100)assert.ok(review.fee>T.MAX_FEE);
  const signedMany=T.signSweep(review,key,recipe,199),decoded=T.parse(signedMany.raw);
  assert.equal(decoded.inputs.length,count);assert.equal(decoded.outputs.length,1);
  assert.equal(decoded.outputs[0].value,review.budget-review.fee);
  assert.ok(signedMany.raw.length/2<=review.estimatedBytes);
  const independent=new bitcore.Transaction(signedMany.raw);
  independent.inputs.forEach((input,i)=>{const chunks=input.script.chunks;assert.equal(bitcore.Transaction.sighash.verify(independent,bitcore.crypto.Signature.fromTxFormat(chunks[0].buf),bitcore.PublicKey.fromBuffer(chunks[1].buf),i,new bitcore.Script(review.inputs[i].script)),true);});
  assert.throws(()=>T.signSweep({...review,fee:review.fee+1n},key,recipe,199),/fee changed/);
  assert.throws(()=>T.signSweep({...review,estimatedBytes:review.estimatedBytes-1},key,recipe,199),/size or fee/);
  assert.throws(()=>T.signSweep({...review,inputs:review.inputs.slice(1)},key,recipe,199));
  assert.throws(()=>T.sign(review,recipe)); // Sweep allowance never loosens regular sends.
 }
 const max=compressed?670:552;
 assert.ok(T.sweepSize(max,compressed)<100000);
 assert.throws(()=>T.sweepSize(max+1,compressed),/multi-transaction sweep/);
 assert.throws(()=>T.sweepPlan({coin,destination:dest,utxos:Array(max+1).fill(utxos[0]),tip:500,compressed}),/multi-transaction sweep/);
 assert.throws(()=>T.sweepPlan({coin,destination:dest,utxos,tip:500,feeRate:10000001n,compressed}),/fee rate/);
 assert.throws(()=>T.signSweep({...p,compressed:!compressed},key,recipe,199),/Invalid sweep/);
 const tinyFund={...funding,outputs:[{value:1100000n,script:T.script(coin,key.address)}]},tinyRaw=U.hexlify(T.serialize(tinyFund)).slice(2);
 assert.throws(()=>T.sweepPlan({coin,destination:dest,utxos:[{...utxos[0],raw:tinyRaw,txid:T.parse(tinyRaw).txid,value:1100000n}],tip:500,compressed}),/balance must cover/);
 assert.throws(()=>T.sweepPlan({coin,destination:dest,utxos:[utxos[0],{...owned,pos:0,height:1,raw:raw2,txid:T.parse(raw2).txid,value:100000000n}],tip:500,compressed}),/one private key/);
}
console.log('PASS: PEP/WHT WIF checks, independently verified compressed/uncompressed sweeps through 253 inputs, 25% fee cushion, full-source/no-change conservation, size boundaries, owned destinations, tamper rejection and unchanged normal-send limits.');
