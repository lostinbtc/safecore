// Public fixture seed, synthetic funding and mocked Electrum. Never broadcasts.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const accounts=E.accounts(ethers,recipe),destinations=E.accounts(ethers,recipe,1);
(async()=>{
 for(const coin of Object.keys(E.NETWORKS)){
  const account={...accounts[coin],index:0},value=2n*T.COIN,count=65;
  const raw=ethers.utils.hexlify(T.serialize({version:1,inputs:[{txid:'ab'.repeat(32),pos:0,script:''}],outputs:Array.from({length:count},()=>({value,script:T.script(coin,account.address)})),locktime:0})).slice(2),txid=T.parse(raw).txid;
  let bad=false,rawCalls=0,broadcasts=0;
  const history=[{tx_hash:txid,height:499}];
  let N;
  class Socket{
   static OPEN=1;
   constructor(){this.readyState=1;queueMicrotask(()=>this.onopen());}
   close(){this.readyState=3;}
   send(text){const q=JSON.parse(text);let result;
    if(q.method==='server.version')result=['fixture','1.4'];
    else if(q.method==='server.features')result={genesis_hash:N.CONFIG[coin].genesis};
    else if(q.method==='blockchain.block.header')result=coin==='lky'?'LKY_TEST_HEADER':require('./chain-checkpoints.cjs')[coin];
    else if(q.method==='blockchain.headers.subscribe')result={height:800000};
    else if(q.method==='blockchain.scripthash.subscribe')result=T.historyStatus(history);
    else if(q.method.endsWith('get_history'))result=history;
    else if(q.method.endsWith('get_balance'))result={confirmed:Number(value)*count,unconfirmed:0};
    else if(q.method.endsWith('listunspent'))result=Array.from({length:count},(_,pos)=>({tx_hash:txid,tx_pos:pos,height:499,value:Number(value)}));
    else if(q.method==='blockchain.transaction.get'){rawCalls++;result=bad?'00':raw;}
    else if(q.method==='blockchain.relayfee'||q.method==='blockchain.estimatefee')result=T.policy(coin).flatFee?.01:.00001;
    else if(q.method==='blockchain.transaction.broadcast'){broadcasts++;throw Error('Broadcast forbidden');}
    else throw Error('Unexpected fixture request: '+q.method);
    queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:q.id,result})}));
   }
  }
  const ctx={WebSocket:Socket,WalletTransactions:{...T,blockHeaderHash:raw=>raw==='LKY_TEST_HEADER'?N.CONFIG.lky.checkpoint.hash:T.blockHeaderHash(raw)},URL,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);N=ctx.WalletNetwork;
  // Exercise the user-selected BELLS WSS alternative; HTTPS has its own suite.
  if(coin==='bel')N.configure({bel:'wss://bells-fixture.invalid/'});
  if(['bonc','jkc','lky','cat','flop'].includes(coin))N.configure({[coin]:`wss://${coin}-fixture.invalid/`});
  try{
   const snapshot=await N.scan(coin,[account]),utxos=await N.spendable(snapshot);
   assert.equal(utxos.length,count);assert.equal(rawCalls,1,'Shared funding transaction fetched once');
   const base={coin,destination:destinations[coin].address,changeAddress:account.address,utxos,feeRate:snapshot.feeRate,tip:snapshot.tip,feeIncluded:true,flatFee:T.policy(coin).flatFee};
   const small=T.plan({...base,amount:coin==='dingo'?'2':'1'});assert.equal(small.inputs.length,1);
   const signed=T.parse(T.sign(small,recipe).raw);assert.equal(signed.inputs.length,1);
   assert.equal(signed.outputs.reduce((n,o)=>n+o.value,0n)+small.fee,value);
   assert.throws(()=>T.plan({...base,amount:'130'}),/up to 8 inputs/,'No accidental whole-wallet transaction');
   if(T.supportsOneCoinFee(coin)){
    const larger=T.plan({...base,flatFee:false,oneCoinFee:true,amount:'80'});
    assert.equal(larger.inputs.length,40);assert.equal(larger.fee,T.COIN);
    assert.equal(T.parse(T.sign(larger,recipe).raw).inputs.length,40);
    assert.throws(()=>T.plan({...base,flatFee:false,oneCoinFee:true,amount:'82'}),/up to 40 inputs/);
   }
   await assert.rejects(()=>N.spendable(N.decode(N.encode(snapshot),coin,[account])),/Refresh wallet data/,'Disk cache cannot authorize a send');
   bad=true;await assert.rejects(()=>N.spendable(snapshot),undefined,'Funding transactions still verified');
   assert.equal(broadcasts,0);
  }finally{N.close();}
 }
 console.log('PASS: all eighteen assets with 65 outputs can verify and sign small payments; 8/40-input limits, fee conservation, cache rejection and funding verification remain enforced. No broadcasts.');
})().catch(e=>{console.error(e);process.exitCode=1;});
