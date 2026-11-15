// Synthetic Electrum endpoints; never connects or broadcasts to a real server.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('../www/engine.js'),T=require('../www/transactions.js'),ethers=require('../www/assets/ethers.umd.min.js'),headers=require('./chain-checkpoints.cjs');
function fixture(coin='dingo',mode='ok'){
 const calls=[],sockets=[];let N;
 class Socket{
  static OPEN=1;
  constructor(url){this.url=url;this.readyState=1;sockets.push(this);queueMicrotask(()=>this.onopen());}
  close(){this.readyState=3;}
  send(raw){const q=JSON.parse(raw);calls.push({...q,url:this.url});let result;
   const bad=mode==='wrong'||mode==='failover'&&this.url===N.CONFIG.dingo.url;
   switch(q.method){
    case 'server.version':result=['fixture','1.4'];break;
    case 'server.features':result={genesis_hash:N.CONFIG[coin].genesis};break;
    case 'blockchain.block.header':result=mode==='malformed'?'00':headers[bad?(coin==='doge'?'dingo':'doge'):coin];break;
    case 'blockchain.headers.subscribe':result={height:200000};break;
    case 'blockchain.relayfee':result=mode==='relay-high'?11:1;break;
    case 'blockchain.estimatefee':result=mode==='estimate'?2:mode==='estimate-high'?11:mode==='estimate-bad'?0:-1;break;
    case 'blockchain.scripthash.subscribe':result=null;break;
    case 'blockchain.scripthash.get_balance':result={confirmed:0,unconfirmed:0};break;
    case 'blockchain.scripthash.get_history':case 'blockchain.scripthash.listunspent':result=[];break;
    case 'blockchain.transaction.broadcast':if(mode==='lost-send'){queueMicrotask(()=>this.onclose?.());return;}result='a'.repeat(64);break;
    default:throw Error('Unexpected fixture method '+q.method);
   }
   if(mode==='fee-rpc-error'&&q.method==='blockchain.estimatefee'){queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:q.id,error:{message:'unavailable'}})}));return;}
   let reply=JSON.stringify({id:q.id,result});
   if(q.method==='blockchain.relayfee'&&result===1)reply=reply.replace('"result":1','"result":1.0');
   queueMicrotask(()=>this.onmessage?.({data:reply}));
  }
 }
 const ctx={WebSocket:Socket,WalletTransactions:T,URL,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);N=ctx.WalletNetwork;
 return {N,calls,sockets};
}
(async()=>{
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),accounts=E.receivePool(ethers,recipe,2).dingo;
 for(const coin of ['dingo','doge'])for(const mode of ['wrong','malformed']){
  const f=fixture(coin,mode);try{
   f.N.configure({[coin]:'wss://wrong.fixture/'});
   await assert.rejects(()=>f.N.client(coin).call('blockchain.scripthash.get_balance',['0'.repeat(64)]),/checkpoint/);
   assert.ok(f.calls.every(q=>q.method.startsWith('server.')||q.method==='blockchain.block.header'),'No address or broadcast before chain verification');
   assert.equal(f.sockets.length,1,'Custom connection never leaks to defaults');
  }finally{f.N.close();}
 }
 for(const mode of ['ok','estimate','failover','estimate-high','estimate-bad','fee-rpc-error','relay-high']){
  const f=fixture('dingo',mode);try{
   if(mode==='relay-high'){await assert.rejects(()=>f.N.scan('dingo',accounts),/safety/);continue;}
   const s=await f.N.scan('dingo',accounts);
   if(['estimate-high','estimate-bad','fee-rpc-error'].includes(mode)){assert.equal(s.feeRate,null);await assert.rejects(()=>f.N.spendable(s),/fee estimate/);continue;}
   assert.equal(s.feeRate,mode==='estimate'?2n*T.COIN:T.COIN);
   assert.equal(s.feeSource,mode==='estimate'?'estimate':'relay-minimum');
   assert.equal(f.N.decode(f.N.encode(s),'doge',E.receivePool(ethers,recipe,2).doge),null,'A DOGE address match cannot authorize a DINGO cache');
   if(mode==='failover'){assert.equal(f.sockets.length,2);assert.ok(f.calls.filter(q=>q.url===f.N.CONFIG.dingo.url).every(q=>q.method.startsWith('server.')||q.method==='blockchain.block.header'));}
  }finally{f.N.close();}
 }
 const f=fixture('dingo','lost-send');try{
  await assert.rejects(()=>f.N.client('dingo').call('blockchain.transaction.broadcast',['fake-signed-transaction']));
  assert.equal(f.calls.filter(q=>q.method==='blockchain.transaction.broadcast').length,1);
 }finally{f.N.close();}
 console.log('PASS: DOGE/DINGO checkpoint rejection before public queries, distinct cache identity, DINGO failover, decimal relay rates, explicit no-estimate fallback, fee failure gates and one-shot broadcast.');
})().catch(e=>{console.error(e);process.exitCode=1;});
