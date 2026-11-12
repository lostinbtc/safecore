// Read-only public endpoint probe. Never derives keys or broadcasts.
const assert=require('node:assert/strict');
const {chromium}=require('./browser-helper.cjs');
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
  try{
    const page=await browser.newPage();await page.goto('http://localhost:8787/');
    for(const coin of process.argv.slice(2).length?process.argv.slice(2):['pep','wht','shic']){
      const result=await page.evaluate(async coin=>{
        const c=WalletNetwork.client(coin);
        const features=await c.call('server.features'),tip=await c.call('blockchain.headers.subscribe');
        const balance=await c.call('blockchain.scripthash.get_balance',['0'.repeat(64)]);
        const history=await c.call('blockchain.scripthash.get_history',['0'.repeat(64)]);
        const unspent=await c.call('blockchain.scripthash.listunspent',['0'.repeat(64)]);
        const relay=await c.call('blockchain.relayfee');
        // Public BIP39 fixture, read-only. Never enable its sending UI.
        const recipe=WalletEngine.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
        const snapshot=await WalletNetwork.scan(coin,WalletEngine.receivePool(ethers,recipe)[coin]);
        if(snapshot.rows.length!==20||snapshot.rows.reduce((n,r)=>n+r.confirmed,0n)!==snapshot.confirmed)throw Error('Account aggregation mismatch.');
        const cached=WalletNetwork.decode(WalletNetwork.encode(snapshot),coin,WalletEngine.receivePool(ethers,recipe)[coin]);
        const restored=await WalletNetwork.scan(coin,WalletEngine.receivePool(ethers,recipe)[coin],cached);
        if(restored.cached||restored.queried!==20)throw Error('Disk cache was not revalidated against live history.');
        const incremental=await WalletNetwork.scan(coin,WalletEngine.receivePool(ethers,recipe)[coin],restored);
        if(incremental.queried>Math.min(20,incremental.everUsed.length+1)||incremental.cached)throw Error('Incremental scan mismatch.');
        WalletNetwork.close();return {coin,genesis:features.genesis_hash,expected:WalletNetwork.CONFIG[coin].genesis,height:tip.height,balance,history,unspent,relay,scanned:snapshot.rows.length,incremental:incremental.queried};
      },coin);
      assert.equal(result.genesis,result.expected);assert.ok(result.height>0);assert.deepEqual(result.balance,{confirmed:0,unconfirmed:0});assert.deepEqual(result.history,[]);assert.deepEqual(result.unspent,[]);assert.ok(result.relay>=0);
      console.log(`PASS ${coin}: public browser WSS, certificate validation, chain identity, height ${result.height}, initial ${result.scanned}-address discovery, then ${result.incremental}-address incremental refresh.`);
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
