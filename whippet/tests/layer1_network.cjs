// Synthetic endpoints only. LKY's header fixture is a test double: no public
// server/header was obtained. BCH uses a real public header pinned in Core.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js');
const headers=require('./chain-checkpoints.cjs'),coins=['bch','dash','dgb','jkc','lky','rvn','cat','trmp','flop'];
function fixture(coin,mode){
 let N;const calls=[],urls=[],rules=T.policy(coin);
 const transactions={...T,blockHeaderHash:raw=>raw==='LKY_TEST_HEADER'?N.CONFIG.lky.checkpoint.hash:T.blockHeaderHash(raw)};
 class Socket{
  static OPEN=1;
  constructor(url){this.url=url;this.readyState=1;urls.push(url);queueMicrotask(()=>this.onopen?.());}
  close(){this.readyState=3;}
  send(raw){const q=JSON.parse(raw);calls.push({...q,url:this.url});let result;
   const wrong=mode==='wrong'||mode==='failover'&&this.url===N.CONFIG[coin].url;
   switch(q.method){
    case 'server.version':result=['fixture','1.4'];break;
    case 'server.features':result={genesis_hash:wrong?'00'.repeat(32):N.CONFIG[coin].genesis};break;
    case 'blockchain.block.header':result=mode==='checkpoint'?'00':coin==='lky'?'LKY_TEST_HEADER':headers[coin];break;
    case 'blockchain.headers.subscribe':result={height:mode==='old-chain'?200000:800000};break;
    case 'blockchain.relayfee':result=Number(rules.minRate)/1e8;break;
    case 'blockchain.estimatefee':result=mode==='floor'?-1:mode==='bad-fee'?'0.01':mode==='high-fee'?Number(rules.maxRate+1n)/1e8:Number(rules.minRate)/1e8;break;
    case 'blockchain.scripthash.subscribe':result=null;break;
    case 'blockchain.scripthash.get_balance':result={confirmed:0,unconfirmed:0};break;
    case 'blockchain.scripthash.get_history':case 'blockchain.scripthash.listunspent':result=[];break;
    case 'blockchain.transaction.broadcast':queueMicrotask(()=>this.onclose?.());return;
    default:throw Error('Unexpected fixture method '+q.method);
   }
   const reply=mode==='rpc-error'&&q.method==='blockchain.estimatefee'?{id:q.id,error:{message:'unavailable'}}:{id:q.id,result};
   queueMicrotask(()=>this.onmessage?.({data:JSON.stringify(reply)}));
  }
 }
 const ctx={WebSocket:Socket,WalletTransactions:transactions,URL,setTimeout,clearTimeout};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);N=ctx.WalletNetwork;
 return {N,calls,urls};
}
(async()=>{
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),pool=E.receivePool(ethers,recipe,2);
 for(const coin of coins)for(const mode of ['ok','wrong','floor','bad-fee','high-fee','rpc-error','lost-send',...(['bch','lky'].includes(coin)?['checkpoint']:[]),...(coin==='lky'?['old-chain']:[]),...(['bch','dash','dgb','rvn'].includes(coin)?['failover']:[])]){
  const f=fixture(coin,mode),N=f.N;try{
   if(['jkc','lky','cat','flop'].includes(coin)){assert.equal(N.endpoint(coin),null);assert.throws(()=>N.client(coin),/custom Electrum/);assert.equal(f.urls.length,0);}
   if(mode!=='failover')N.configure({[coin]:`wss://${coin}.fixture/`});
   if(['wrong','checkpoint','old-chain'].includes(mode)){
    await assert.rejects(()=>N.scan(coin,pool[coin]),/genesis|checkpoint|revival/);
    assert.ok(f.calls.every(q=>!q.method.includes('scripthash')),'Identity checked before disclosing addresses');continue;
   }
   if(mode==='lost-send'){
    await assert.rejects(()=>N.client(coin).call('blockchain.transaction.broadcast',['00']));
    assert.equal(f.calls.filter(q=>q.method==='blockchain.transaction.broadcast').length,1);continue;
   }
   const s=await N.scan(coin,pool[coin]);
   if(['bad-fee','high-fee','rpc-error'].includes(mode)){assert.equal(s.feeRate,null);await assert.rejects(()=>N.spendable(s),/fee estimate/);}
   else assert.equal(s.feeRate,T.policy(coin).minRate);
   if(mode==='failover'){
    assert.equal(f.urls.length,2);
    assert.ok(f.calls.filter(q=>q.url===N.CONFIG[coin].url).every(q=>q.method.startsWith('server.')));
   }else assert.ok(f.urls.every(url=>url===`wss://${coin}.fixture/`),'Custom endpoint never falls back');
   assert.equal(N.decode(N.encode(s),'pep',pool.pep),null,'No cross-coin balance cache');
  }finally{N.close();}
 }
 assert.equal(T.blockHeaderHash(headers.bch),'0000000000000000030192242425926218184a609a63efee615b7586d7f3972b');
 console.log('PASS: nine-chain connection isolation, genesis/checkpoint gates, legacy opt-in transport, failover, fee rejection and no broadcast retries.');
})().catch(e=>{console.error(e);process.exitCode=1;});
