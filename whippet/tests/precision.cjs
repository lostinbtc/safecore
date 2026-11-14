// Exact integer boundaries for every currently supported asset. Public fake coins.
const assert=require('node:assert/strict'),E=require('../www/engine.js'),T=require('../www/transactions.js'),R=require('../www/reporting.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),owners=E.accounts(ethers,recipe),recipients=E.accounts(ethers,recipe,1);
const max=0x7fffffffffffffffn;
for(const value of [0n,1n,99999999n,100000000n,9007199254740993n,1000000000000000000n,max])assert.equal(T.amount(T.format(value)),value);
for(const bad of ['92233720368.54775808','100000000000','0.000000001','1e-8','1,000','-0.01'])assert.throws(()=>T.amount(bad));
for(const [coin,network] of Object.entries(E.NETWORKS)){
 assert.equal(network.decimals,8);assert.equal(10n**BigInt(network.decimals),T.COIN);
 const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:[{value:max,script:T.script(coin,owners[coin].address)}],locktime:0})).slice(2);
 const utxo={...owners[coin],raw,txid:T.parse(raw).txid,pos:0,height:499,value:max};
 const p=T.plan({coin,destination:recipients[coin].address,changeAddress:owners[coin].address,amount:T.format(max),utxos:[utxo],tip:500,feeRate:T.policy(coin).minRate,feeIncluded:true,flatFee:T.policy(coin).flatFee});
 assert.equal(p.amount+p.fee,max);assert.equal(p.change,0n);
 assert.equal(T.parse(T.sign(p,recipe).raw).outputs[0].value,max-p.fee);
}
for(const value of [Number.MIN_VALUE,1e-20,1e-12,1e-8,.000002931,.5,100000,1e20]){
 const price=R.formatUnitPrice(value);assert.notEqual(price,'0');assert.notEqual(price,'*');
}
assert.equal(R.formatUnitPrice(1e-12),'1E-12');assert.equal(R.formatUnitPrice(.000002931),'0.000002931');
assert.equal(R.formatWorth(1e-20),'<0.01');assert.equal(R.formatWorth(0),'0.00');
assert.equal(R.formatWorth(R.valueInUsdt('pep',1n,Number.MIN_VALUE,1)),'<0.01');
for(const value of [null,NaN,Infinity,-1,0])assert.equal(R.formatUnitPrice(value),'*');
console.log('PASS: all six assets preserve exact base units through Max/planning/signing up to supported integer limits; tiny fiat values never become false zeroes.');
