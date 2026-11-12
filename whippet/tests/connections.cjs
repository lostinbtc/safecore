const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const calls=[],sockets=[];let genesis,mode='ok';
class Socket {
 static OPEN=1;
 constructor(url){this.url=url;this.readyState=1;sockets.push(this);queueMicrotask(()=>this.onopen?.());}
 close(){this.readyState=3;queueMicrotask(()=>this.onclose?.());}
 send(raw){const q=JSON.parse(raw);calls.push({...q,url:this.url});if(mode==='hold')return;
  let result;if(q.method==='server.version')result=['fixture','1.4'];
  else if(q.method==='server.features')result={genesis_hash:mode==='wrong'?'0'.repeat(64):genesis};
  else if(q.method==='blockchain.headers.subscribe')result={height:mode==='height'?-1:500};
  else if(q.method==='blockchain.relayfee')result=mode==='fee'?-1:.001;
  queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:q.id,result})}));
 }
}
const ctx={WebSocket:Socket,URL,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('whippet/www/network.js','utf8'),ctx);const N=ctx.WalletNetwork;
(async()=>{try{
 genesis=N.CONFIG.pep.genesis;
 for(const value of ['ws://host','https://host','wss://user:pw@host','wss://host?token=x','wss://host#x','wss://ho st','wss://host\\x','wss://ho\nst',null])assert.throws(()=>N.validateEndpoint(value));
 assert.equal(N.validateEndpoint(' wss://Example.com:443 '),'wss://example.com/');
 for(const value of [null,[],{doge:'wss://host'},JSON.parse('{"__proto__":"wss://host"}')])assert.throws(()=>N.configure(value));
 const result=await N.testConnection('pep','wss://custom.example/');assert.equal(result.height,500);
 assert.equal(N.endpoint('pep'),N.CONFIG.pep.url,'Testing never changes active configuration');
 assert.deepEqual(calls.map(q=>q.method),['server.version','server.features','blockchain.headers.subscribe','blockchain.relayfee']);
 assert.ok(sockets.every(s=>s.readyState===3),'Probes close their sockets');
 for(mode of ['wrong','height','fee'])await assert.rejects(()=>N.testConnection('pep','wss://bad.example/'),/Wrong blockchain|invalid chain height|unsupported relay fee/);
 mode='hold';const abort=new AbortController(),probe=N.testConnection('pep','wss://slow.example/',{signal:abort.signal});abort.abort();await assert.rejects(()=>probe,/closed|changed/);
 mode='ok';const old=N.client('pep');await old.call('blockchain.headers.subscribe');
 assert.throws(()=>N.configure({pep:'ws://bad'}));assert.equal(N.client('pep'),old,'Invalid configuration is atomic');
 N.configure({pep:'wss://selected.example/'});assert.equal(N.endpoint('wht'),N.CONFIG.wht.url);
 const before=calls.length;await assert.rejects(()=>old.call('blockchain.transaction.broadcast',['forbidden']),/Connection changed/);assert.equal(calls.length,before);
 await N.client('pep').call('blockchain.headers.subscribe');assert.equal(calls.at(-1).url,'wss://selected.example/');
 N.configure({});assert.equal(N.endpoint('pep'),N.CONFIG.pep.url);
 for(const coin of ['wht','shic']){
  genesis=N.CONFIG[coin].genesis;mode='ok';assert.equal((await N.testConnection(coin,N.CONFIG[coin].url)).height,500);
  mode='wrong';await assert.rejects(()=>N.testConnection(coin,N.CONFIG[coin].url),/Wrong blockchain/);
 }
 mode='ok';N.configure({shic:'wss://custom-shic.example/'});assert.equal(N.endpoint('shic'),'wss://custom-shic.example/');assert.equal(N.endpoint('pep'),N.CONFIG.pep.url);N.configure({});
 console.log('PASS: WSS validation, isolated read-only probes, chain/height/fee checks, cancellation, atomic configuration, per-coin selection, retired-client rejection and defaults.');
}finally{N.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
