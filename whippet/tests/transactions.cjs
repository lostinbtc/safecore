const assert=require('node:assert/strict');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
for(const [value,display] of [[0n,'0'],[1n,'0.00000001'],[99999999999n,'999.99999999'],[100000000000n,'1,000'],[470900000000n,'4,709'],[193992200111100n,'1,939,922.001111'],[-193992200111100n,'-1,939,922.001111'],[900719925474099312345678n,'9,007,199,254,740,993.12345678']]){
  assert.equal(T.formatDisplay(value),display);
  assert.equal(T.format(value),display.replaceAll(',',''),'Machine amounts must remain ungrouped');
}
assert.equal(T.amount('1939922.001111'),193992200111100n);
assert.throws(()=>T.amount('1,939,922.001111'));
for(const coin of ['pep','wht']){
  const a=E.accounts(ethers,recipe,0)[coin],dest=E.accounts(ethers,recipe,1)[coin].address;
  const funding={version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:'',sequence:0xffffffff}],outputs:[{value:500000000n,script:T.script(coin,a.address)}],locktime:0};
  const raw=ethers.utils.hexlify(T.serialize(funding)).slice(2),prev=T.parse(raw);
  const u={...a,txid:prev.txid,pos:0,value:500000000n,height:1,raw};
  const args={coin,destination:dest,amount:'1',utxos:[u],changeAddress:a.address,tip:20};
  const p=T.plan(args),signed=T.sign(p,recipe),parsed=T.parse(signed.raw);
  const wrongNetwork=E.accounts(ethers,recipe,0)[coin==='pep'?'wht':'pep'].address;
  const corrupted=dest.slice(0,-1)+(dest.endsWith('1')?'2':'1');
  for(const destination of [wrongNetwork,corrupted,'not an address','https://example.com','']){
    assert.throws(()=>T.plan({...args,destination}));
    assert.throws(()=>T.sign({...p,destination},recipe));
  }
  assert.equal(parsed.txid,signed.txid);assert.equal(p.amount+p.fee+p.change,u.value);
  assert.equal(parsed.outputs[0].value,100000000n);assert.equal(parsed.outputs[1].value,p.change);
  const inclusive={...args,amount:'5',feeIncluded:true,flatFee:true};
  const full=T.plan(inclusive);
  assert.equal(full.amount,499000000n);assert.equal(full.fee,1000000n);assert.equal(full.change,0n);
  assert.equal(T.parse(T.sign(full,recipe).raw).outputs[0].value,499000000n);
  assert.throws(()=>T.plan({...inclusive,amount:'4.995'}),/Use Max/);
  assert.throws(()=>T.plan({...inclusive,amount:'0.01'}),/cover/);
  assert.throws(()=>T.plan({...inclusive,amount:'6'}),/Available/);
  assert.throws(()=>T.sign({...full,budget:600000000n},recipe),/total changed/);
  assert.throws(()=>T.plan({...inclusive,feeRate:'1002712'}),/relay requirement/);
  const fragmented={...funding,outputs:Array.from({length:7},()=>({value:50000000n,script:T.script(coin,a.address)}))};
  const fragmentedRaw=ethers.utils.hexlify(T.serialize(fragmented)).slice(2),fp=T.parse(fragmentedRaw);
  const many=fp.outputs.map((o,pos)=>({...u,pos,value:o.value,raw:fragmentedRaw,txid:fp.txid}));
  assert.throws(()=>T.plan({...inclusive,amount:'3.5',utxos:many}),/too large/);
  assert.throws(()=>T.plan({...args,amount:'0.00000001'}));assert.throws(()=>T.plan({...args,amount:'101'}));
  // Max is the spendable total, not the old 100-coin development cap.
  const largeFunding={...funding,outputs:[{value:950n*T.COIN,script:T.script(coin,a.address)}]};
  const largeRaw=ethers.utils.hexlify(T.serialize(largeFunding)).slice(2),largePrev=T.parse(largeRaw);
  const largeUTXO={...u,raw:largeRaw,txid:largePrev.txid,value:950n*T.COIN};
  const large=T.plan({...inclusive,amount:'950',utxos:[largeUTXO]});
  assert.equal(large.budget,950n*T.COIN);assert.equal(large.amount,T.amount('949.99'));assert.equal(large.change,0n);
  assert.equal(T.parse(T.sign(large,recipe).raw).outputs[0].value,T.amount('949.99'));
  assert.throws(()=>T.plan({...inclusive,amount:'950.01',utxos:[largeUTXO]}),/Available/);
  assert.throws(()=>T.plan({...args,utxos:[{...u,value:600000000n}]}));
  assert.throws(()=>T.plan({...args,utxos:[{...u,height:0}]}));
  assert.throws(()=>T.plan({...args,feeRate:'10000001'}));
  assert.throws(()=>T.sign({...p,changeAddress:dest},recipe));
  assert.throws(()=>T.sign(p,E.recipe(ethers,recipe.mnemonic,'wrong passphrase')));
  assert.throws(()=>T.script(coin,E.accounts(ethers,recipe,0)[coin==='pep'?'wht':'pep'].address));
  const coinbase={...funding,inputs:[{txid:'00'.repeat(32),pos:0xffffffff,script:'0101',sequence:0xffffffff}]};
  const cbraw=ethers.utils.hexlify(T.serialize(coinbase)).slice(2),cb=T.parse(cbraw);
  assert.throws(()=>T.plan({...args,utxos:[{...u,raw:cbraw,txid:cb.txid}]}));
}
for(const bad of ['1e2','-1','0.123456789','NaN',' 1','1,000'])assert.throws(()=>T.amount(bad));
assert.equal(T.format(T.amount('0.12345678')),'0.12345678');
assert.throws(()=>T.parse('0100000000'));
console.log('PASS: integer amounts, fee/dust limits, raw-prevout validation, ownership checks, wrong-chain rejection, maturity and signing structure.');
