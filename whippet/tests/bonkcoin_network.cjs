// Fake Electrum only: chain gates, fees and one-attempt broadcast behavior.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
function fixture(mode='ok'){
 const calls=[],urls=[];let N;
 class Socket{
  static OPEN=1;
  constructor(url){this.url=url;this.readyState=1;urls.push(url);queueMicrotask(()=>this.onopen?.());}
  close(){this.readyState=3;}
  send(raw){const q=JSON.parse(raw);calls.push(q);let result;
   switch(q.method){
    case 'server.version':result=['fixture','1.4'];break;
    case 'server.features':result={genesis_hash:mode==='wrong'?N.CONFIG.bel.genesis:N.CONFIG.bonc.genesis};break;
    case 'blockchain.headers.subscribe':result={height:500};break;
    case 'blockchain.relayfee':result=mode==='relay-high'?1:.001;break;
    case 'blockchain.estimatefee':result=mode==='estimate'?.02:mode==='estimate-high'?1:mode==='estimate-bad'?'0.01':-1;break;
    case 'blockchain.scripthash.subscribe':result=null;break;
    case 'blockchain.scripthash.get_balance':result={confirmed:0,unconfirmed:0};break;
    case 'blockchain.scripthash.get_history':case 'blockchain.scripthash.listunspent':result=[];break;
    case 'blockchain.transaction.broadcast':if(mode==='lost-send'){queueMicrotask(()=>this.onclose?.());return;}result='a'.repeat(64);break;
    default:throw Error('Unexpected fixture method '+q.method);
   }
   const reply=mode==='rpc-error'&&q.method==='blockchain.estimatefee'?{id:q.id,error:{message:'unavailable'}}:{id:q.id,result};
   queueMicrotask(()=>this.onmessage?.({data:JSON.stringify(reply)}));
  }
 }
 const ctx={WebSocket:Socket,WalletTransactions:T,URL,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);N=ctx.WalletNetwork;
 return {N,calls,urls};
}
(async()=>{
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),accounts=E.receivePool(ethers,recipe,2).bonc;
 for(const mode of ['ok','wrong','estimate','estimate-high','estimate-bad','rpc-error','relay-high','lost-send']){
  const f=fixture(mode);try{
   assert.equal(f.N.CONFIG.bonc.url,null);assert.throws(()=>f.N.client('bonc'),/custom Electrum/);assert.equal(f.urls.length,0);
   assert.throws(()=>f.N.configure({bonc:'ws://unsafe.fixture/'}),/wss/);
   f.N.configure({bonc:'wss://bonc.fixture/'});
   if(mode==='wrong'){
    await assert.rejects(()=>f.N.scan('bonc',accounts),/genesis/);
    assert.ok(f.calls.every(q=>q.method.startsWith('server.')),'No address requests before chain verification');continue;
   }
   if(mode==='relay-high'){await assert.rejects(()=>f.N.scan('bonc',accounts),/safety/);continue;}
   if(mode==='lost-send'){
    await assert.rejects(()=>f.N.client('bonc').call('blockchain.transaction.broadcast',['00']),/closed|disconnected/);
    assert.equal(f.calls.filter(q=>q.method==='blockchain.transaction.broadcast').length,1);continue;
   }
   const s=await f.N.scan('bonc',accounts);
   if(['estimate-high','estimate-bad','rpc-error'].includes(mode)){
    assert.equal(s.feeRate,null);await assert.rejects(()=>f.N.spendable(s),/fee estimate/);
   }else{
    assert.equal(s.feeRate,mode==='estimate'?2000000n:1000000n);
    assert.equal(s.feeSource,mode==='estimate'?'estimate':'core-minimum');
    assert.equal(f.N.decode(f.N.encode(s),'bel',E.receivePool(ethers,recipe,2).bel),null);
    await f.N.testConnection('bonc','wss://bonc.fixture/');
   }
   assert.ok(f.urls.every(url=>url==='wss://bonc.fixture/'),'No fallback or address leakage');
  }finally{f.N.close();}
 }
 console.log('PASS: BONC requires custom WSS, exact genesis before queries, no fallback, validated fee minimum/estimate, malformed fees block spending, separate caches and one broadcast attempt.');
})().catch(e=>{console.error(e);process.exitCode=1;});
