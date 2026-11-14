// Synthetic endpoints and public addresses only. No live network or real sends.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),T=require('../www/transactions.js'),E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
function fixture(mode='ok',coin='pep'){
 let now=100000,failOnce=true;const sockets=[],calls=[];
 const backup=url=>url.includes('pepeblocks')||url.includes('electrum2');
 class Socket{
  static OPEN=1;
  constructor(url){this.url=url;this.readyState=1;sockets.push(this);if(mode==='staggered-down'&&backup(url))now+=1000;queueMicrotask(()=>{if(mode==='all-down'||mode==='staggered-down'||mode==='connect'&&!backup(url))this.onerror?.();else if(mode!=='hold')this.onopen?.();});}
  close(){this.readyState=3;queueMicrotask(()=>this.onclose?.());}
  send(raw){
   const q=JSON.parse(raw);calls.push({...q,url:this.url});let result,error;
   const second=backup(this.url),txid=(second?'bb':'aa').repeat(32),history=[{tx_hash:txid,height:499}],value=second?200:100;
   if(mode==='send-throws'&&!second)throw Error('Fixture socket race');
   if(mode==='broadcast-timeout'&&q.method==='blockchain.transaction.broadcast')return;
   if((mode==='read-failure'&&q.method==='blockchain.scripthash.get_balance'||mode==='scan-failure'&&q.method==='blockchain.scripthash.get_history')&&!second&&failOnce){failOnce=false;this.close();return;}
   switch(q.method){
    case 'server.version':result=['fixture','1.4'];break;
    case 'server.features':result=mode==='null-chain'&&!second?null:{genesis_hash:mode==='wrong-chain'&&!second?'0'.repeat(64):N.CONFIG[coin].genesis};break;
    case 'blockchain.headers.subscribe':result={height:mode==='stale'&&second?400:500};break;
    case 'blockchain.scripthash.subscribe':result=T.historyStatus(history);break;
    case 'blockchain.scripthash.get_balance':result={confirmed:value,unconfirmed:0};break;
    case 'blockchain.scripthash.get_history':result=history;break;
    case 'blockchain.scripthash.listunspent':result=[{tx_hash:txid,tx_pos:0,value,height:499}];break;
    case 'blockchain.relayfee':result=.01;break;
    default:error={message:'Unsupported method'};
   }
   queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:q.id,result,error})}));
  }
 }
 const FakeDate=class extends Date{static now(){return now;}};
 const ctx={WebSocket:Socket,WalletTransactions:T,URL,Date:FakeDate,setTimeout:(fn,ms)=>setTimeout(fn,ms===20000?50:ms),clearTimeout};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);const N=ctx.WalletNetwork;
 return {N,sockets,calls,mode:v=>mode=v,advance:ms=>now+=ms};
}
(async()=>{
 for(const mode of ['connect','wrong-chain','null-chain','read-failure','send-throws']){
  const f=fixture(mode);try{
   const result=await Promise.all(Array.from({length:20},()=>f.N.client('pep').call('blockchain.scripthash.get_balance',['0'.repeat(64)])));
   assert.ok(result.every(r=>r.confirmed===200));
   assert.equal(f.sockets.length,2,'Concurrent failures must share one fallback connection');
   assert.equal(f.N.endpoint('pep'),f.N.CONFIG.pep.url,'Failover never rewrites user preferences');
   if(mode==='wrong-chain')assert.ok(f.calls.filter(q=>q.url===f.N.CONFIG.pep.url).every(q=>q.method.startsWith('server.')));
  }finally{f.N.close();}
 }
 {
  const f=fixture('all-down','wht');try{
   const c=f.N.client('wht');await assert.rejects(()=>c.call('blockchain.headers.subscribe'));const count=f.sockets.length;
   for(let i=0;i<10;i++)await assert.rejects(()=>c.call('blockchain.headers.subscribe'));
   assert.equal(f.sockets.length,count,'Cooldown prevents reconnect storms');
   f.advance(2100);f.mode('ok');assert.equal((await c.call('blockchain.headers.subscribe')).height,500);assert.equal(f.sockets.length,count+1);
  }finally{f.N.close();}
 }
 {
  const f=fixture('staggered-down');try{
   const c=f.N.client('pep');await assert.rejects(()=>c.call('blockchain.headers.subscribe'));
   f.advance(1100);f.mode('ok');await c.call('blockchain.headers.subscribe');
   assert.equal(f.sockets.at(-1).url,f.N.CONFIG.pep.url,'Retry the eligible primary, not the backup still cooling down');
  }finally{f.N.close();}
 }
 {
  const f=fixture('connect');try{f.N.configure({pep:'wss://private.example/'});await assert.rejects(()=>f.N.client('pep').call('blockchain.headers.subscribe'));assert.ok(f.sockets.every(s=>s.url==='wss://private.example/'));}finally{f.N.close();}
 }
 {
  const f=fixture('broadcast-timeout');try{
   await assert.rejects(()=>f.N.client('pep').call('blockchain.transaction.broadcast',['public-fake-transaction']),/timed out/);
   await f.N.client('pep').call('blockchain.headers.subscribe');
   assert.equal(f.calls.filter(q=>q.method==='blockchain.transaction.broadcast').length,1);
   assert.ok(f.calls.filter(q=>q.url.includes('pepeblocks')).every(q=>q.method!=='blockchain.transaction.broadcast'));
  }finally{f.N.close();}
 }
 {
  const f=fixture('hold');const pending=f.N.client('pep').call('blockchain.headers.subscribe');f.N.close();await assert.rejects(()=>pending,/Connection changed/);assert.equal(f.sockets.length,1);f.N.close();
 }
 {
  const f=fixture('scan-failure');try{
   const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),accounts=E.receivePool(ethers,recipe,2).pep;
   const s=await f.N.scan('pep',accounts,null,{full:true});
   assert.equal(s.confirmed,400n);assert.ok(s.rows.every(r=>r.history[0].tx_hash==='bb'.repeat(32)));assert.ok(f.N.isCurrent(s));
   f.sockets.at(-1).close();await new Promise(resolve=>setImmediate(resolve));
   assert.equal(f.N.isCurrent(s),false,'An idle socket close immediately invalidates spend authority');
   await assert.rejects(()=>f.N.spendable(s),/Connection changed/);
   const refreshed=await f.N.scan('pep',accounts,s);assert.ok(f.N.isCurrent(refreshed));assert.equal(refreshed.queried,2);
   f.N.close();assert.equal(f.N.isCurrent(refreshed),false);
  }finally{f.N.close();}
 }
 {
  const f=fixture();try{
   const c=f.N.client('pep');await c.call('blockchain.headers.subscribe');f.mode('read-failure');await c.call('blockchain.scripthash.get_balance',['0'.repeat(64)]);
   f.mode('stale');await assert.rejects(()=>c.call('blockchain.headers.subscribe'),/behind/);
  }finally{f.N.close();}
 }
 console.log('PASS: shared failover, wrong-chain isolation, coherent scans, cooldown/reconnect, stale-node rejection, manual privacy, cancellation and no broadcast retries.');
})().catch(e=>{console.error(e);process.exitCode=1;});
