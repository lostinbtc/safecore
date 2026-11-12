// Isolated, public-fixture wallet. Price and chain traffic are mocked; no broadcasts.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),{chromium}=require('./browser-helper.cjs');
const E=require('../www/engine.js'),ethers=require('../www/assets/ethers.umd.min.js');
(async()=>{
 const b=await chromium.launch();
 try{
  const c=await b.newContext({viewport:{width:390,height:844}});
  await require('./funded_network.cjs')(c);
  const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  delete recipe.paths.shic; // Upgrade an actual old-format plaintext recipe.
  await c.addInitScript(v=>{
   localStorage.setItem('whippet.dev.encrypted.v1',JSON.stringify(v));
   __balances={pep:5,wht:0,shic:1000000};window.__priceRequests=[];window.__priceMode='ok';
   window.fetch=async(url,options)=>{
    __priceRequests.push({url,credentials:options.credentials,referrerPolicy:options.referrerPolicy});
    if(url==='https://api.kraken.com/0/public/Ticker?pair=PEPUSD,USDTUSD')return new Response(JSON.stringify({error:[],result:{PEPUSD:{c:['.01']},USDTZUSD:{c:['.5']}}}));
    if(url!=='https://api.coingecko.com/api/v3/simple/price?ids=shibacoin&vs_currencies=usd&include_last_updated_at=true')throw Error('Unexpected external request');
    if(__priceMode==='rate-limit')return new Response('{}',{status:429});
    return new Response(JSON.stringify({shibacoin:{usd:.000003,last_updated_at:Math.floor(Date.now()/1000)-(__priceMode==='stale'?601:0)}}));
   };
  },E.unprotected(webcrypto,recipe));
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install();await p.clock.pauseAt(new Date(Date.now()+100));await p.goto('http://localhost:8787/');
  const saved=await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1'));
  const row=p.locator('[data-overview-coin=shic]');
  await p.waitForFunction(()=>document.querySelector('[data-overview-coin=shic] .holding-values > small')?.textContent==='6.00 USDT');
  assert.equal(await p.locator('#wallet-worth').innerText(),'≈ 6.10 USDT');
  assert.deepEqual(await p.locator('[data-overview-coin]').evaluateAll(rows=>rows.map(row=>row.dataset.overviewCoin)),['pep','shic','wht']);
  assert.equal(await row.locator('.holding-name > small').first().innerText(),'0.000006 USDT');
  assert.equal(await row.locator('.holding-balance').innerText(),'1,000,000 SHIC');
  assert.equal(await row.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  await p.screenshot({path:'/tmp/safecore-shic-wallet.png',fullPage:true});
  await row.click();await p.locator('#address').waitFor();
  assert.equal(await p.locator('#address').innerText(),E.accounts(ethers,recipe,1).shic.address,'Funded first address advances to the next receiving address');
  await p.locator('[data-nav=wallet]').click();
  await p.evaluate(()=>__priceMode='rate-limit');await p.clock.runFor(305000);
  assert.equal(await row.locator('.holding-values > small').innerText(),'*');
  assert.equal(await row.locator('.holding-balance').innerText(),'1,000,000 SHIC');
  await p.evaluate(()=>__priceMode='stale');await p.clock.runFor(305000);
  assert.equal(await row.locator('.holding-values > small').innerText(),'*');
  await p.evaluate(()=>__priceMode='ok');await p.clock.runFor(305000);
  await p.waitForFunction(()=>document.querySelector('[data-overview-coin=shic] .holding-values > small')?.textContent==='6.00 USDT');
  const requests=await p.evaluate(()=>__priceRequests);
  assert.ok(requests.every(r=>r.credentials==='omit'&&r.referrerPolicy==='no-referrer'));
  assert.equal(requests.filter(r=>r.url.includes('coingecko')).length,4,'One public SHIC quote per five-minute interval, not every balance poll');
  await p.locator('[data-nav=security]').click();await p.locator('#custom-connections > summary').click();
  assert.deepEqual(await p.locator('[data-connection]').evaluateAll(rows=>rows.map(row=>row.dataset.connection)),['pep','shic','wht']);
  assert.equal(await p.locator('#endpoint-shic').inputValue(),'');
  assert.equal(await p.locator('#endpoint-current-shic').innerText(),'Using default server');
  assert.doesNotMatch(await p.locator('#custom-connections').innerText(),/shibacoinshic\.org/);
  await p.locator('[data-nav=activity]').click();
  await p.locator('[data-activity-coin=pep]').waitFor();
  assert.deepEqual(await p.locator('[data-activity-coin]').evaluateAll(rows=>rows.map(row=>row.dataset.activityCoin)),['pep','shic','wht']);
  await p.locator('[data-nav=receive]').click();
  await p.locator('[data-coin=pep]').waitFor();
  assert.deepEqual(await p.locator('[data-coin]').evaluateAll(rows=>rows.map(row=>row.dataset.coin)),['pep','shic','wht']);
  await p.locator('[data-nav=send]').click();
  await p.locator('[data-send-coin=pep]').waitFor();
  assert.deepEqual(await p.locator('[data-send-coin]').evaluateAll(rows=>rows.map(row=>row.dataset.sendCoin)),['pep','shic']);
  await p.locator('[data-nav=wallet]').click();await p.locator('#header-add-coins').click();
  await p.locator('[data-select-coin=pep]').waitFor();
  assert.deepEqual(await p.locator('[data-select-coin]').evaluateAll(rows=>rows.map(row=>row.dataset.selectCoin)),['pep','shic','wht','doge']);
  assert.equal(await p.evaluate(()=>localStorage.getItem('whippet.dev.encrypted.v1')),saved);
  assert.deepEqual(errors,[]);
  console.log('PASS: SHIC old-backup UI, receive address/logo, USDT totals, rate-limit/stale quote handling, throttling, private default endpoint and unchanged wallet.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
