// Exact boundary tests; public synthetic prices, no sockets or keys.
const assert=require('node:assert/strict'),R=require('../www/reporting.js');
const now=1700000000000,quote=(value=100000)=>({value,at:now,updated:now});
for(const coin of Object.keys(require('../www/engine.js').NETWORKS)){
 const check=fee=>R.feeUsd(coin,fee,quote(),now);
 assert.equal(check(5000n).warning,false); // Exactly $5 is not above $5.
 assert.equal(check(5001n).warning,true);
 assert.equal(check(100000n).blocked,false); // Exactly $100 is allowed, with warning.
 assert.equal(check(100001n).blocked,true);
 assert.equal(check(1n).display,'<$0.01 USD'); // Do not imply a sub-cent fee is zero.
 assert.equal(check(100001n).display,'$100.01 USD');
 assert.equal(R.feeUsd(coin,100000000n,quote(5.000000001),now).warning,true);
 assert.equal(R.feeUsd(coin,100000000n,quote(100.000000001),now).blocked,true);
 assert.equal(R.feeUsd(coin,100000000n,quote(1e-7),now).display,'<$0.01 USD');
 assert.equal(R.feeUsd(coin,1n,quote(1e21),now).blocked,true);
 for(const invalid of [null,quote(0),quote(-1),quote(NaN),quote(Infinity),quote('100000'),
  {...quote(),at:now-300000},{...quote(),updated:now-600001},
  {...quote(),updated:now+30001},{...quote(),at:now+1}]){
  assert.throws(()=>R.feeUsd(coin,1000n,invalid,now),/fresh USD price/);
 }
 assert.throws(()=>R.feeUsd(coin,-1n,quote(),now),/Invalid/);
}
assert.throws(()=>R.feeUsd('unknown',1n,quote(),now),/Unsupported/);
console.log('PASS: Every asset: exact USD fee boundaries, decimal/scientific prices, stale/invalid quotes require explicit review handling.');

// Public synthetic BTC only: independent integer formula across input counts,
// fractional sat/byte rates, Max and dust boundaries. No mainnet broadcasting.
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const owner=E.accounts(ethers,recipe).btc,destination=E.accounts(ethers,recipe,1).btc.address;
for(let count=1;count<=8;count++)for(const rate of [1000n,1001n,2500n,10000n,100000n]){
 const utxos=Array.from({length:count},(_,i)=>{
  const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:(i+1).toString(16).padStart(64,'0'),pos:0,script:''}],outputs:[{value:100000n,script:T.script('btc',owner.address)}],locktime:0})).slice(2);
  return {...owner,raw,txid:T.parse(raw).txid,pos:0,height:499,value:100000n};
 });
 const budget=BigInt(count)*100000n,expected=(BigInt(78+149*count)*rate+999n)/1000n;
 for(const leftover of [0n,1n,545n,546n,547n]){
  const args={coin:'btc',destination,changeAddress:owner.address,amount:T.format(budget-leftover),utxos,tip:500,feeRate:rate,feeIncluded:true};
  if(leftover>0n&&leftover<546n||expected>100000n){assert.throws(()=>T.plan(args));continue;}
  const p=T.plan(args);assert.equal(p.fee,expected);assert.equal(p.amount+p.fee,budget-leftover);assert.equal(p.change,leftover);
  assert.equal(budget-p.outputs.reduce((n,o)=>n+o.value,0n),expected);
  if(rate===1001n&&leftover===0n){
   const signed=T.sign(p,recipe),outputs=T.parse(signed.raw).outputs.reduce((n,o)=>n+o.value,0n);
   assert.equal(budget-outputs,expected);assert.ok(p.fee*1000n>=BigInt(signed.raw.length/2)*rate);
  }
 }
}
console.log('PASS: 200 BTC fee/dust/input-count cases and signed-fee conservation for 1–8 inputs at a fractional sat/byte rate.');
