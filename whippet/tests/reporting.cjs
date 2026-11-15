const assert=require('node:assert/strict'),R=require('../www/reporting.js');
let now=0;
const snap=(c,u=0)=>({confirmed:BigInt(c)*100000000n,unconfirmed:BigInt(u)*100000000n,at:now});
const g=R.create(null,()=>now);
assert.equal(R.POLL_MS,4000);
assert.equal(R.WAIT_MS,4000);
assert.equal(g.observe(snap(0,1000)).published,true);assert.equal(g.value.unconfirmed,100000000000n);
assert.equal(g.pending,false);
assert.equal(R.create().observe(snap(0)).published,true);
now=46000;g.observe(snap(1000,1000));assert.equal(g.value.confirmed+g.value.unconfirmed,100000000000n);
now=50000;g.observe(snap(1000));
now=53999;assert.equal(g.observe(snap(1000)).published,false);
now=54000;assert.equal(g.observe(snap(1000)).published,true);
assert.equal(g.value.confirmed,100000000000n);assert.equal(g.value.unconfirmed,0n);
// Failed refresh resets candidate stability; time passing alone cannot publish.
now=96000;g.observe(snap(2000));g.invalidate();now=200000;
assert.equal(g.value.confirmed,100000000000n);
assert.equal(g.observe(snap(2000)).published,false);
const cached=R.create(snap(1000),()=>now);assert.equal(cached.observe(snap(1000)).published,true);
assert.deepEqual(R.worth({pep:snap(1000),wht:snap(0)},.001,1),{value:1,incomplete:false});
assert.deepEqual(R.worth({pep:snap(1000),wht:snap(1000)},.001,1),{value:1,incomplete:true});
assert.deepEqual(R.worth({pep:snap(0),wht:snap(1000)},.001,1),{value:null,incomplete:true});
assert.deepEqual(R.worth({pep:snap(0),wht:snap(0)},null,null),{value:0,incomplete:false});
assert.deepEqual(R.worth({pep:snap(1000),wht:snap(0)},.001,.5),{value:2,incomplete:false});
// The screenshot's boundary: USD rounds to 0.37, while USDT rounds to 0.38.
const boundary={confirmed:470928561204n,unconfirmed:0n};
const total=R.worth({pep:boundary,wht:snap(1000)},.0000796,.9995);
assert.equal(R.formatWorth(total.value),'0.38');
assert.equal(R.formatWorth(R.valueInUsdt('pep',boundary.confirmed,.0000796,.9995)),'0.38');
assert.equal(R.valueInUsdt('pep',100000000n,.01,.5),.02);
assert.equal(R.valueInUsdt('wht',100000000n,.01,.5),null);
assert.equal(R.valueInUsdt('shic',100000000n,.01,.5),null);
assert.equal(R.valueInUsdt('shic',100000000000000n,.01,.5,.000003),6);
assert.deepEqual(R.worth({pep:snap(5),wht:snap(0),shic:snap(1000000)},.01,.5,.000003),{value:6.1,incomplete:false});
{const now=1800000000000,q=R.shicQuote({shibacoin:{usd:.000003,last_updated_at:now/1000}},now);
assert.equal(R.freshShic(q,now+299999),true);assert.equal(R.freshShic(q,now+300000),false);
for(const bad of [{},{shiba_inu:{usd:1,last_updated_at:now/1000}},...[-1,0,NaN,Infinity,'0.01'].map(usd=>({shibacoin:{usd,last_updated_at:now/1000}})),...[now/1000-601,now/1000+31,null,'1800000000'].map(last_updated_at=>({shibacoin:{usd:1,last_updated_at}}))])assert.throws(()=>R.shicQuote(bad,now));}
assert.deepEqual(R.worth({pep:snap(1000),wht:snap(0),shic:snap(1)},.001,1),{value:1,incomplete:true});
for(const rate of [null,0,-1,NaN,Infinity])assert.equal(R.valueInUsdt('pep',100000000n,.01,rate),null);
assert.equal(R.formatWorth(0),'0.00');assert.equal(R.formatWorth(.009),'<0.01');assert.equal(R.formatWorth(null),'*');
for(const [coin,id] of Object.entries({bch:'bitcoin-cash',dash:'dash',dgb:'digibyte',jkc:'junkcoin',lky:'luckycoin',rvn:'ravencoin'})){
 const at=1800000000000,q=R.marketQuote({[id]:{usd:2,last_updated_at:at/1000}},id,at);
 assert.equal(R.freshShic(q,at+299999),true);assert.equal(R.freshShic(q,at+300000),false);
 assert.equal(R.valueInUsdt(coin,300000000n,null,.5,null,null,null,null,null,null,{[coin]:q.value}),12);
 assert.equal(R.valueInUsdt(coin,300000000n,null,.5),null);
 for(const usd of [0,-1,NaN,Infinity,'2'])assert.throws(()=>R.marketQuote({[id]:{usd,last_updated_at:at/1000}},id,at));
 assert.throws(()=>R.marketQuote({[id]:{usd:2,last_updated_at:at/1000-601}},id,at));
}
{
 const now=1800000000000,q={value:2,at:now,updated:now};
 assert.deepEqual(R.displayQuote(q,now+299999),{value:2,stale:false});
 assert.deepEqual(R.displayQuote(q,now+300000),{value:2,stale:true});
 assert.deepEqual(R.displayQuote(q,now+899999),{value:2,stale:true});
 assert.deepEqual(R.displayQuote(q,now+900000),{value:2,stale:true});
 assert.throws(()=>R.feeUsd('btc',1000n,q,now+300000),e=>e.code==='USD_PRICE_UNAVAILABLE','Display grace must not extend fee-price validity');
 assert.deepEqual(R.displayQuote({...q,updated:now-600001},now),{value:2,stale:true});
 assert.deepEqual(R.displayQuote({...q,updated:now-900000},now),{value:2,stale:true});
 for(const [age,label]of [[300000,'5 minutes ago'],[3600000,'1 hour ago'],[259200000,'3 days ago'],[2592000000,'1 month ago'],[63072000000,'2 years ago']]){
  assert.deepEqual(R.displayQuote(q,now+age),{value:2,stale:true});
  assert.equal(R.formatPriceAge(q,now+age),label);
 }
 assert.equal(R.formatPriceAge({...q,updated:now-3600000},now),'1 hour ago','Use the original provider timestamp, not just the fetch time');
 const publicCache=JSON.stringify({version:1,quotes:{btc:{...q,privateField:'discard'},usdt:{...q,value:.99},unexpected:q}});
 assert.deepEqual(R.readDisplayPrices(publicCache,now+2592000000),{btc:q,usdt:{...q,value:.99}});
 for(const raw of [null,'{','x'.repeat(16385),'null','{"version":2,"quotes":{}}','{"version":1,"quotes":[]}'])assert.deepEqual(R.readDisplayPrices(raw,now),{});
 for(const bad of [null,{},...[-1,0,NaN,Infinity,'2'].map(value=>({...q,value})),{...q,at:now+1},{...q,updated:now+30001},{...q,updated:null}])
  assert.deepEqual(R.displayQuote(bad,now),{value:null,stale:false});
}
console.log('PASS: fresh-match balances, exact USDT conversion, persistent age-labeled display quotes, sanitized public cache and unchanged strict fee freshness.');
