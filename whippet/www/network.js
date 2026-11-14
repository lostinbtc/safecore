/* Public Electrum WSS only. Never send recovery words, passwords, or keys. */
(function(root){
  const CONFIG={
    pep:{url:'wss://electrum.pepecoinservice.org:50004/',fallbacks:['wss://electrum.pepeblocks.com:50004/'],genesis:'37981c0c48b8d48965376c8a42ece9a0838daadb93ff975cb091f57f8c2a5faa'},
    wht:{url:'wss://electrum.pepecoinservice.org:50005/whippet',genesis:'863714e1c1a15526a0081a35097c56e28dbd43ef97f76fec0ccd5a7510326292'},
    shic:{url:'wss://electrum.shibacoinshic.org:50002/',genesis:'ff271edcc83f7d71e7a4e4b0a43b386a188e1470a28671cdbdc47e900118ac7f'},
    doge:{url:'wss://doge.electrum1.cipig.net:30060/',fallbacks:['wss://doge.electrum2.cipig.net:30060/'],genesis:'1a91e3dace36e2be3bf030a65679fe821aa1d6ef92e7c9902eb318182c355691'},
    btc:{url:'wss://btc.electrum1.cipig.net:30000/',fallbacks:['wss://btc.electrum2.cipig.net:30000/'],genesis:'000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'},
    ltc:{url:'wss://ltc.electrum1.cipig.net:30063/',fallbacks:['wss://ltc.electrum2.cipig.net:30063/'],genesis:'12a765e31ffd4059bada1e25190f6e98c99d9714d334efa41a195a7e7e04bfe2'}
  };
  for(const config of Object.values(CONFIG)){config.fallbacks=Object.freeze(config.fallbacks||[]);Object.freeze(config);}Object.freeze(CONFIG);
  let endpoints={};
  function validateEndpoint(value){
    if(typeof value!=='string'||value.length>2048)throw Error('Enter a secure WebSocket address (wss://).');
    const raw=value.trim();let url;
    try{url=new URL(raw);}catch(_){throw Error('Enter a valid wss:// server address.');}
    if(url.protocol!=='wss:'||!url.hostname||url.username||url.password||raw.includes('?')||raw.includes('#')||/[\s\\\u0000-\u001f\u007f]/.test(raw))throw Error('Use wss:// without a password, query or fragment.');
    return url.href;
  }
  function validateEndpoints(values){
    if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(coin=>!Object.hasOwn(CONFIG,coin)))throw Error('Saved connections are invalid. Restore defaults in Settings.');
    const result={};
    for(const coin of Object.keys(values)){const url=validateEndpoint(values[coin]);if(url!==CONFIG[coin].url)result[coin]=url;}
    return result;
  }
  const endpoint=coin=>{if(!Object.hasOwn(CONFIG,coin))throw Error('Unsupported live coin.');return endpoints[coin]||CONFIG[coin].url;};
  function configure(values){
    const next=validateEndpoints(values);
    for(const [coin,c] of Object.entries(clients)){c.retired=true;c.close();delete clients[coin];}
    endpoints=next;
  }
  class RPCError extends Error{}
  class ConnectionError extends Error{}
  class ServerChangedError extends Error{}
  const sources=new WeakMap();
  const READ_METHODS=new Set(['server.version','server.features','blockchain.headers.subscribe','blockchain.scripthash.subscribe','blockchain.scripthash.get_balance','blockchain.scripthash.get_history','blockchain.scripthash.listunspent','blockchain.transaction.get','blockchain.relayfee','blockchain.estimatefee']);
  // Preserve large JSON integer tokens BEFORE JSON.parse can round them. Leave
  // quoted strings and ordinary protocol integers untouched. Money is converted
  // to BigInt only at the validated amount boundary below; never via Number.
  function parseResponse(text){
    return JSON.parse(text.replace(/"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,token=>{
      if(token[0]==='"')return token;
      const number=Number(token);
      // A decimal such as 1.0000000000000000001 must not round into an accepted
      // integer amount either. Fractional relay-fee values remain ordinary numbers.
      return !Number.isFinite(number)||Number.isInteger(number)&&(!Number.isSafeInteger(number)||! /^-?\d+$/.test(token))?JSON.stringify(token):token;
    }));
  }
  const listeners=new Set();
  const notify=coin=>{for(const listener of listeners)listener(coin);};
  class Client {
    constructor(coin,url=endpoint(coin)){if(!Object.hasOwn(CONFIG,coin))throw Error('Unsupported live coin.');this.coin=coin;this.url=url;this.retired=false;this.pending=new Map();this.dirty=new Map();this.statuses=new Map();this.subscribed=new Set();this.id=0;this.socket=null;this.ready=null;}
    close(){this.retired=true;const socket=this.socket;this.socket=null;this.ready=null;this.statuses.clear();this.subscribed.clear();this.dirty.clear();if(socket)socket.close();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new ConnectionError('Connection closed.'));}this.pending.clear();}
    async connect(){
      if(this.retired)throw Error('Connection changed. Retry with the selected server.');
      if(this.ready)return this.ready;
      this.ready=(async()=>{
        await new Promise((resolve,reject)=>{
          let socket;try{socket=new WebSocket(this.url);}catch(_){reject(new ConnectionError('Electrum WSS connection failed.'));return;}this.socket=socket;
          const timer=setTimeout(()=>{socket.close();reject(new ConnectionError('Electrum connection timed out.'));},12000);
          socket.onopen=()=>{clearTimeout(timer);resolve();};
          socket.onerror=()=>{clearTimeout(timer);reject(new ConnectionError('Electrum WSS connection failed.'));};
          socket.onclose=()=>{clearTimeout(timer);if(this.socket===socket)this.close();reject(new ConnectionError('Electrum connection closed.'));};
          socket.onmessage=event=>{
            if(this.socket!==socket||this.retired)return;
            try {
              if(typeof event.data!=='string'||event.data.length>2000000)throw Error('Invalid Electrum response.');
              for(const line of event.data.trim().split('\n')){
                const messages=parseResponse(line);for(const m of Array.isArray(messages)?messages:[messages]){
                  if(m.method==='blockchain.scripthash.subscribe'&&Array.isArray(m.params)&&this.subscribed.has(m.params[0])&&validHash(m.params[0])&&validStatus(m.params[1])){this.statuses.set(m.params[0],{status:m.params[1],at:Date.now()});this.dirty.set(m.params[0],(this.dirty.get(m.params[0])||0)+1);notify(this.coin);continue;}
                  const p=this.pending.get(m.id);if(!p)continue;this.pending.delete(m.id);clearTimeout(p.timer);
                  if(m.error)p.reject(new RPCError(typeof m.error.message==='string'?m.error.message.slice(0,250):'Electrum rejected the request.'));else p.resolve(m.result);
                }
              }
            }catch(_){this.close();}
          };
        });
        await this.request('server.version',['SafeCore development','1.4']);
        const f=await this.request('server.features',[]);
        if(f?.genesis_hash!==CONFIG[this.coin].genesis){this.close();throw new ConnectionError('Wrong blockchain: genesis does not match.');}
      })();
      try{await this.ready;}catch(e){this.close();throw e;}
    }
    request(method,params){
      if(this.retired)return Promise.reject(Error('Connection changed. Retry with the selected server.'));
      if(!this.socket||this.socket.readyState!==WebSocket.OPEN)return Promise.reject(new ConnectionError('Electrum is disconnected.'));
      if(method==='blockchain.scripthash.subscribe')this.subscribed.add(params[0]);
      const id=++this.id;
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new ConnectionError('Electrum response timed out.'));},20000);this.pending.set(id,{resolve,reject,timer});try{this.socket.send(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');}catch(_){clearTimeout(timer);this.pending.delete(id);reject(new ConnectionError('Electrum request could not be sent.'));}});
    }
    async call(method,params=[]){await this.connect();return this.request(method,params);}
  }
  // Read-only requests may retry. A broadcast is attempted once, even if its
  // response is lost: the application retains its uncertain-send protection.
  class ManagedClient {
    constructor(coin){
      this.coin=coin;this.urls=endpoints[coin]?[endpoints[coin]]:[CONFIG[coin].url,...CONFIG[coin].fallbacks];
      this.index=0;this.active=new Client(coin,this.urls[0]);this.retired=false;this.session=0;this.retryAt=0;this.failures=new Map();this.highestTip=0;
    }
    get url(){return this.active.url;}
    get dirty(){return this.active.dirty;}
    get statuses(){return this.active.statuses;}
    close(){this.session++;this.active.retired=true;this.active.close();this.active=new Client(this.coin,this.urls[this.index]);}
    available(){
      if(this.retired)throw Error('Connection changed. Retry with the selected server.');
      if(Date.now()<this.retryAt)throw new ConnectionError('Connection unavailable. Retrying automatically.');
      if(this.active.retired){
        if((this.failures.get(this.urls[this.index])?.until||0)>Date.now()){
          const next=this.urls.findIndex(url=>(this.failures.get(url)?.until||0)<=Date.now());
          if(next<0)throw new ConnectionError('Connection unavailable. Retrying automatically.');
          this.index=next;
        }
        this.active=new Client(this.coin,this.urls[this.index]);
      }
      return this.active;
    }
    failed(raw){
      if(raw!==this.active)return;
      const now=Date.now(),old=this.failures.get(raw.url),count=Math.min(5,(old?.count||0)+1);
      this.failures.set(raw.url,{count,until:now+Math.min(30000,1000*2**count)});
      raw.retired=true;raw.close();
      for(let step=1;step<this.urls.length;step++){
        const next=(this.index+step)%this.urls.length;
        if((this.failures.get(this.urls[next])?.until||0)<=now){this.index=next;this.active=new Client(this.coin,this.urls[next]);this.retryAt=0;notify(this.coin);return;}
      }
      this.retryAt=Math.min(...this.urls.map(url=>this.failures.get(url)?.until||now));
      notify(this.coin);
    }
    async call(method,params=[]){
      const session=this.session,retry=READ_METHODS.has(method),limit=retry?this.urls.length+1:1;
      for(let attempt=0;attempt<limit;attempt++){
        const raw=this.available();
        try{
          const result=await raw.call(method,params);
          if(this.retired||session!==this.session)throw Error('Connection changed. Retry with the selected server.');
          if(raw!==this.active)throw new ServerChangedError('Server changed during request.');
          if(method==='blockchain.headers.subscribe'){
            if(!Number.isSafeInteger(result?.height)||result.height<0||result.height<this.highestTip-12)throw new ConnectionError('Server chain height is unavailable or behind.');
            this.highestTip=Math.max(this.highestTip,result.height);
          }
          this.failures.delete(raw.url);return result;
        }catch(e){
          if(this.retired||session!==this.session)throw Error('Connection changed. Retry with the selected server.');
          if(!retry){if(e instanceof ConnectionError)this.failed(raw);throw e;}
          if(e instanceof RPCError&&method==='blockchain.estimatefee')throw e;
          if(raw!==this.active)continue;
          if(!(e instanceof ConnectionError)&&!(e instanceof RPCError))throw e;
          this.failed(raw);
          if(this.active===raw||attempt+1===limit)throw e;
        }
      }
      throw new ConnectionError('Connection unavailable. Retrying automatically.');
    }
  }
  const clients={};const client=coin=>clients[coin]||(clients[coin]=new ManagedClient(coin));
  const isCurrent=snapshot=>!sources.has(snapshot)||sources.get(snapshot)===client(snapshot.coin).active&&!client(snapshot.coin).active.retired;
  async function testConnection(coin,value,{signal}={}){
    const url=validateEndpoint(value),c=new Client(coin,url);
    const abort=()=>{c.retired=true;c.close();};
    if(signal?.aborted)throw Error('Connection test cancelled.');
    signal?.addEventListener('abort',abort,{once:true});
    const deadline=setTimeout(abort,45000);
    try{
      const tip=await c.call('blockchain.headers.subscribe');
      if(!Number.isSafeInteger(tip?.height)||tip.height<0)throw Error('Server returned an invalid chain height.');
      const relay=await c.call('blockchain.relayfee');
      if(!Number.isFinite(relay)||relay<0||relay>Number(root.WalletTransactions.policy(coin).maxRate)/1e8)throw Error('Server returned an unsupported relay fee.');
      return {url,height:tip.height};
    }finally{clearTimeout(deadline);signal?.removeEventListener('abort',abort);abort();}
  }
  const validHash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/i.test(x);
  // Electrum status is null for no history, else a 64-char hex fingerprint of it.
  const validStatus=x=>x===null||validHash(x);
  // Row object -> the status it was fetched under. Keyed by row identity, so a
  // stale row can never be paired with a newer status (e.g. an older snapshot).
  const statusOf=new WeakMap();
  const emptyRow=account=>({account,confirmed:0n,unconfirmed:0n,history:[],utxos:[],checked:false});
  async function batches(items,fn,afterBatch){for(let i=0;i<items.length;i+=10){await Promise.all(items.slice(i,i+10).map(fn));if(afterBatch)afterBatch();}}
  function safeInteger(value){
    if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Invalid or imprecise amount.');
    if(typeof value!=='number'&&(typeof value!=='string'||! /^-?(0|[1-9]\d{0,18})$/.test(value)))throw Error('Invalid amount.');
    const amount=BigInt(value),limit=0x7fffffffffffffffn;
    if(amount>limit||amount< -limit)throw Error('Amount exceeds the transaction integer range.');
    return amount;
  }
  // Cache is public display/discovery metadata, never authority to spend.
  function encode(snapshot){
    if(snapshot.complete===false)throw Error('Cannot cache an incomplete discovery.');
    return JSON.stringify({...snapshot,version:1,cached:true,rows:snapshot.rows.map(r=>({...r,utxos:[]}))},(_,v)=>typeof v==='bigint'?v.toString():v);
  }
  function decode(raw,coin,accounts){
    try{
      const s=JSON.parse(raw),integer=v=>{if(typeof v!=='string')throw Error('Invalid cached amount');return safeInteger(v);};
      if(s.complete===false||s.version!==1||s.coin!==coin||!Number.isSafeInteger(s.at)||s.at<0||s.at>Date.now()+60000||!Number.isSafeInteger(s.tip)||s.tip<0||!Array.isArray(s.rows)||!s.rows.length||s.rows.length>accounts.length||!Array.isArray(s.everUsed))return null;
      if(s.everUsed.some(i=>!Number.isInteger(i)||i<0||i>=accounts.length))return null;
      s.rows=s.rows.map((r,i)=>{
        if(r.account.address!==accounts[i].address||r.account.index!==i||!Array.isArray(r.history)||r.history.length>1000||r.history.some(h=>!validHash(h.tx_hash)||!Number.isInteger(h.height)||h.height< -1))throw Error('Invalid cached address');
        const confirmed=integer(r.confirmed),unconfirmed=integer(r.unconfirmed);if(confirmed<0n)throw Error('Invalid balance');
        return {account:accounts[i],confirmed,unconfirmed,history:r.history,utxos:[],checked:r.checked!==false};
      });
      while(s.rows.length<accounts.length)s.rows.push(emptyRow(accounts[s.rows.length]));
      s.confirmed=s.rows.reduce((n,r)=>n+r.confirmed,0n);s.unconfirmed=s.rows.reduce((n,r)=>n+r.unconfirmed,0n);
      s.feeRate=root.WalletTransactions.policy(coin).minRate;s.cached=true;
      s.everUsed=[...new Set([...s.everUsed,...s.rows.filter(r=>r.history.length||r.confirmed||r.unconfirmed).map(r=>r.account.index)])];
      return s;
    }catch(_){return null;}
  }
  async function scan(coin,accounts,previous=null,options={}){
    const c=client(coin),session=c.session;
    for(let attempt=0;attempt<c.urls.length+1;attempt++){
      if(session!==c.session||c.retired)throw Error('Wallet scan cancelled.');
      try{return await scanOnce(coin,accounts,previous,options);}
      catch(e){if(!(e instanceof ServerChangedError)||attempt===c.urls.length)throw e;
        previous=null;options={...options,full:true,indices:undefined};}
    }
  }
  async function scanOnce(coin,accounts,previous=null,options={}){
    const c=client(coin),T=root.WalletTransactions,origin=c.available();
    const checkActive=()=>{if(options.isActive&&!options.isActive()||c.retired)throw Error('Wallet scan cancelled.');if(c.active!==origin||origin.retired)throw new ServerChangedError('Server changed during scan.');};
    checkActive();
    if(!Array.isArray(accounts)||!accounts.length||accounts.length>200||accounts.some((a,i)=>a.index!==i))throw Error('Expected an ordered address pool of up to 200 addresses.');
    const tip=await c.call('blockchain.headers.subscribe');checkActive();if(!Number.isSafeInteger(tip.height)||tip.height<0)throw Error('Invalid chain height.');
    const query=async account=>{
      const sh=T.scriptHash(coin,account.address);
      const [balance,history,utxos]=await Promise.all([c.call('blockchain.scripthash.get_balance',[sh]),c.call('blockchain.scripthash.get_history',[sh]),c.call('blockchain.scripthash.listunspent',[sh])]);
      checkActive();
      if(!Array.isArray(history)||(!options.sweep&&history.length>1000)||history.some(h=>!validHash(h.tx_hash)||!Number.isInteger(h.height)||h.height< -1)||!Array.isArray(utxos)||(!options.sweep&&utxos.length>100))throw Error('Unexpected address history size or format.');
      const confirmed=safeInteger(balance.confirmed),unconfirmed=safeInteger(balance.unconfirmed);if(confirmed<0n)throw Error('Invalid confirmed balance.');
      // Confirmed DB and mempool can briefly overlap at block arrival. Reject
      // inconsistent snapshots; never cache or enable sending from double counts.
      const txids=new Set(),outpoints=new Set();let outputTotal=0n;
      for(const h of history){if(txids.has(h.tx_hash))throw Error('Inconsistent transaction history.');txids.add(h.tx_hash);}
      for(const u of utxos){const key=u.tx_hash+':'+u.tx_pos;if(outpoints.has(key))throw Error('Inconsistent unspent outputs.');outpoints.add(key);outputTotal+=safeInteger(u.value);}
      if(confirmed+unconfirmed!==outputTotal)throw Error('Balance and unspent outputs do not agree.');
      return {account,confirmed,unconfirmed,history,utxos:utxos.map(u=>{if(!validHash(u.tx_hash)||!Number.isSafeInteger(u.tx_pos)||u.tx_pos<0||!Number.isSafeInteger(u.height)||u.height<0)throw Error('Invalid unspent output.');const value=safeInteger(u.value);if(value<0n)throw Error('Invalid output amount.');return {txid:u.tx_hash,pos:u.tx_pos,height:u.height,value,address:account.address,index:account.index};})};
    };
    const reusable=previous?.coin===coin&&previous.rows?.length===accounts.length&&previous.rows.every((r,i)=>r.account.address===accounts[i].address);
    if(previous&&sources.has(previous)&&sources.get(previous)!==origin)options={...options,full:true,indices:undefined};
    const targeted=options.indices!==undefined;
    if(targeted&&(!Array.isArray(options.indices)||!options.indices.length||options.indices.some(i=>!Number.isInteger(i)||i<0||i>=accounts.length)||options.full))throw Error('Invalid focused refresh indices.');
    // Partial refreshes can retain only rows validated live in this session.
    // A restored disk cache must complete discovery first.
    if(targeted&&(!reusable||previous.rows.some(r=>r.checked===false||!statusOf.has(r))))throw Error('Complete live discovery before a focused refresh.');
    const used=new Set(reusable?previous.everUsed||[]:[]);
    if(reusable)for(const r of previous.rows)if(r.history.length||r.confirmed||r.unconfirmed||r.utxos.length)used.add(r.account.index);
    let frontier=0;while(used.has(frontier))frontier++;
    // Keep a 10–20 address lookahead, expanding in tens, never beyond 200.
    const end=()=>Math.min(accounts.length,Math.max(20,Math.ceil((Math.max(-1,...used)+1)/10)*10+10));
    let windowEnd=end();
    const probeDue=reusable&&Date.now()-(previous.probedAt||previous.at)>=30000;
    let probeCursor=reusable&&Number.isInteger(previous.probeCursor)?previous.probeCursor:20;
    if(probeCursor>=accounts.length)probeCursor=20;
    const probe=probeDue?accounts.slice(probeCursor,probeCursor+10).map(a=>a.index):[];
    const changed=accounts.filter(a=>c.dirty.has(T.scriptHash(coin,a.address))).map(a=>a.index);
    const wanted=targeted?[...new Set(options.indices)]:options.full?accounts.map(a=>a.index):[...new Set([...accounts.slice(0,windowEnd).map(a=>a.index),...used,...probe,...changed])];
    const rows=reusable?previous.rows.slice():accounts.map(emptyRow);
    const queried=new Set(),checked=new Set(),revisions=new Map();
    // Display-only checkpoints: never cache or spend from an unfinished scan.
    // Preserve older balances in unvisited rows, but mark their history unchecked.
    const publishBatch=()=>{
      checkActive();
      if(!options.full||!options.onBatch||checked.size%20!==0&&checked.size!==wanted.length)return;
      const batch={coin,tip:tip.height,complete:false,cached:false,at:Date.now(),
        rows:rows.map((row,index)=>checked.has(index)?row:{...row,checked:false}),
        everUsed:[...used].sort((a,b)=>a-b),queried:queried.size,
        confirmed:rows.reduce((n,r)=>n+r.confirmed,0n),unconfirmed:rows.reduce((n,r)=>n+r.unconfirmed,0n)};
      sources.set(batch,origin);options.onBatch(batch);
    };
    // Push notifications update live statuses. Reconcile at least every 30s and
    // after reconnect/cache restore; explicit Rescan always requests fresh status.
    async function refresh(index){
      checkActive();
      const account=accounts[index],sh=T.scriptHash(coin,account.address),revision=c.dirty.get(sh),known=c.statuses.get(sh);
      const status=known&&reusable&&!previous.cached&&!options.full&&!options.verify&&!targeted&&Date.now()-known.at<30000?known.status:await c.call('blockchain.scripthash.subscribe',[sh]);
      if(!validStatus(status))throw Error('Unexpected address status format.');
      // Do not overwrite a newer notification that arrived during this request.
      if(c.dirty.get(sh)===revision&&(!known||known.status!==status||options.full||Date.now()-known.at>=30000))c.statuses.set(sh,{status,at:Date.now()});
      const prior=reusable&&!previous.cached&&sources.get(previous)===origin?previous.rows[index]:null;
      let row;
      if(prior&&!options.full&&!targeted&&statusOf.get(prior)===status)row=prior;
      else{row=await query(account);if(T.historyStatus(row.history)!==status)throw Error('Address history changed during refresh. Please retry.');row.checked=true;statusOf.set(row,status);queried.add(index);}
      rows[index]=row;checked.add(index);
      revisions.set(sh,revision);
      if(row.history.length||row.confirmed||row.unconfirmed||row.utxos.length)used.add(index);
    }
    await batches(wanted,refresh,publishBatch);
    while(!targeted&&end()>windowEnd){const next=end();await batches(accounts.slice(windowEnd,next).filter(a=>!checked.has(a.index)).map(a=>a.index),refresh);windowEnd=next;}
    // A deposit can unlock another address during this scan. Check it now,
    // rather than displaying an address whose history has not been refreshed.
    frontier=0;while(used.has(frontier))frontier++;
    while(!targeted&&frontier<accounts.length&&!checked.has(frontier)){await refresh(frontier);if(!used.has(frontier))break;while(used.has(frontier))frontier++;}
    checkActive();
    const relay=await c.call('blockchain.relayfee');
    checkActive();
    if(!Number.isFinite(relay)||relay<0)throw Error('Could not verify the network relay fee.');
    // BTC uses a six-block estimate, not just the relay minimum. A failed
    // estimate must not hide balances or silently authorize a floor-fee spend.
    const rules=root.WalletTransactions.policy(coin),rate=Math.max(Number(rules.minRate)/1e8,relay);
    if(!Number.isFinite(rate)||rate>Number(rules.maxRate)/1e8)throw Error('Fee estimate exceeds development safety limit.');
    let feeRate=BigInt(Math.ceil(rate*1e8));
    if(coin==='btc'){
      try{
        const estimate=await c.call('blockchain.estimatefee',[6]);
        if(!Number.isFinite(estimate)||estimate<=0||estimate>Number(rules.maxRate)/1e8)throw Error('Fee estimate unavailable or above limit.');
        feeRate=BigInt(Math.max(Number(rules.minRate),Math.ceil(relay*1e8),Math.ceil(estimate*1e8)));
      }catch(_){feeRate=null;}
      checkActive();
    }
    // A failed scan must not consume notifications for rows it never published.
    for(const [sh,revision] of revisions)if(c.dirty.get(sh)===revision)c.dirty.delete(sh);
    const snapshot={coin,tip:tip.height,rows,complete:true,everUsed:[...used].sort((a,b)=>a-b),queried:queried.size,cached:false,confirmed:rows.reduce((n,r)=>n+r.confirmed,0n),unconfirmed:rows.reduce((n,r)=>n+r.unconfirmed,0n),feeRate,at:Date.now(),probedAt:targeted?previous.probedAt||previous.at:probeDue||options.full||!reusable?Date.now():previous.probedAt||previous.at,probeCursor:!targeted&&probeDue?probeCursor+10:probeCursor};
    sources.set(snapshot,origin);return snapshot;
  }
  async function spendable(snapshot,{sweep=false,compressed=true}={}){
    if(snapshot.complete===false)throw Error('Complete wallet discovery before spending.');
    if(snapshot.cached||!isCurrent(snapshot))throw Error('Connection changed. Refresh wallet data before spending.');
    if(snapshot.coin==='btc'&&(snapshot.cached||typeof snapshot.feeRate!=='bigint'||snapshot.feeRate<=0n))throw Error('Bitcoin fee estimate unavailable. Refresh or choose another connection before spending.');
    const c=client(snapshot.coin),T=root.WalletTransactions;
    const candidates=snapshot.rows.flatMap(r=>r.utxos).filter(u=>u.height>0);
    if(sweep){if(candidates.length)T.sweepSize(candidates.length,compressed);}
    else if(candidates.length>40)throw Error('Too many outputs for this small-value development test.');
    const txids=[...new Set(candidates.map(u=>u.txid))],raws=new Map();
    await batches(txids,async txid=>raws.set(txid,await c.call('blockchain.transaction.get',[txid,false])));
    if(!isCurrent(snapshot))throw Error('Connection changed. Refresh wallet data before spending.');
    return candidates.flatMap(u=>{const raw=raws.get(u.txid),parsed=T.parse(raw,snapshot.coin);if(parsed.coinbase&&snapshot.tip-u.height+1<T.policy(snapshot.coin).maturity||parsed.hogex&&snapshot.tip-u.height+1<6)return [];return [T.verifyUTXO(snapshot.coin,{...u,raw},snapshot.tip)];});
  }
  async function checkInputs(coin,inputs){
    const c=client(coin),T=root.WalletTransactions,origin=c.available();
    for(const address of new Set(inputs.map(i=>i.address))){
      const remaining=await c.call('blockchain.scripthash.listunspent',[T.scriptHash(coin,address)]);
      if(c.active!==origin||origin.retired)throw Error('Connection changed. Build a fresh review.');
      for(const i of inputs.filter(i=>i.address===address))if(!remaining.some(u=>u.tx_hash===i.txid&&u.tx_pos===i.pos&&safeInteger(u.value)===i.value&&u.height>0))throw Error('An input changed or was spent. Build a fresh review.');
    }
  }
  // Public, read-only confirmation checks. Never resubmit a transaction here.
  async function confirmation(coin,txid,address){
    if(!validHash(txid))throw Error('Invalid transaction ID.');
    const sh=root.WalletTransactions.scriptHash(coin,address),c=client(coin),origin=c.available();
    const [history,tip]=await Promise.all([c.call('blockchain.scripthash.get_history',[sh]),c.call('blockchain.headers.subscribe')]);
    if(c.active!==origin||origin.retired)throw new ServerChangedError('Server changed during confirmation check.');
    if(!Number.isSafeInteger(tip?.height)||tip.height<0||!Array.isArray(history)||history.some(h=>!validHash(h.tx_hash)||!Number.isSafeInteger(h.height)||h.height< -1))throw Error('Could not verify transaction confirmation.');
    const matches=history.filter(h=>h.tx_hash===txid);
    if(matches.length>1||matches[0]?.height>tip.height)throw Error('Inconsistent transaction confirmation.');
    const height=matches[0]?.height;
    return {seen:matches.length===1,confirmations:height>0?tip.height-height+1:0};
  }
  // Sweeps query one external public address; private keys never cross this boundary.
  async function sweepSource(coin,address,{compressed=true}={}){
    const snapshot=await scan(coin,[{index:0,address}],null,{full:true,sweep:true});
    if(snapshot.rows[0].history.some(h=>h.height<=0)||snapshot.rows[0].utxos.some(u=>u.height<=0)||snapshot.unconfirmed!==0n)throw Error('Wait for all source transactions to confirm before sweeping.');
    const utxos=await spendable(snapshot,{sweep:true,compressed});
    if(utxos.length!==snapshot.rows[0].utxos.length)throw Error('Wait for mining rewards to mature before sweeping.');
    return {snapshot,utxos};
  }
  root.WalletNetwork={CONFIG,validateEndpoint,validateEndpoints,endpoint,configure,testConnection,RPCError,client,isCurrent,scan,encode,decode,spendable,checkInputs,sweepSource,confirmation,onChange:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},close:()=>{for(const c of Object.values(clients))c.close();}};
})(typeof globalThis==='object'?globalThis:this);
