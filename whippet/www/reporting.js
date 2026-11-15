/* Publish changed balances only after a fresh matching observation 4s later.
   No delayed payload is published on its own; receiving discovery stays live. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WalletReporting=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  const POLL_MS=4000,WAIT_MS=4000;
  const key=s=>`${s.confirmed}:${s.unconfirmed}`;
  function create(initial=null,now=()=>performance.now()){
    let current=initial,candidate=null;
    return {
      get value(){return current;},
      get pending(){return candidate!==null;},
      observe(snapshot){
        const time=now(),next=key(snapshot);
        // Initial discovery (including seed/backup restore) has no prior balance
        // to settle. Publish the first validated scan; delay subsequent changes.
        if(!current||key(current)===next){current=snapshot;candidate=null;return {published:true,remaining:0};}
        if(!candidate||candidate.key!==next)candidate={key:next,since:time};
        const remaining=Math.max(0,WAIT_MS-(time-candidate.since));
        if(remaining)return {published:false,remaining};
        current=snapshot;candidate=null;return {published:true,remaining:0};
      },
      invalidate(){candidate=null;}
    };
  }
  // Display estimates only; never used for coin amounts or transaction signing.
  // Keep the total, each holding and unit price on the same USDT conversion.
  function valueInUsdt(coin,amount,pepUsd,usdtUsd,shicUsd=null,ltcUsd=null,dogeUsd=null,btcUsd=null,belUsd=null,dingoUsd=null,extraUsd={}){
    const usd=coin==='pep'?pepUsd:coin==='shic'?shicUsd:coin==='ltc'?ltcUsd:coin==='doge'?dogeUsd:coin==='btc'?btcUsd:coin==='bel'?belUsd:coin==='dingo'?dingoUsd:extraUsd[coin]??null;
    if(!Number.isFinite(usd)||usd<=0||!Number.isFinite(usdtUsd)||usdtUsd<=0)return null;
    const value=Number(amount)/1e8*usd/usdtUsd;
    if(amount>0n&&value===0)return Number.MIN_VALUE; // Display-only underflow: positive is not zero.
    return Number.isFinite(value)?value:null;
  }
  function formatWorth(value){
    if(value===null||!Number.isFinite(value))return '*';
    if(value>0&&value<0.01)return '<0.01';
    return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
  }
  function formatUnitPrice(value){
    if(!Number.isFinite(value)||value<=0)return '*';
    // Very small positive prices must never round to a misleading zero.
    return new Intl.NumberFormat('en-US',{maximumSignificantDigits:8,
      notation:value<1e-8?'scientific':'standard'}).format(value);
  }
  // Include all known coin balances for this wallet, not the selected coin.
  // Unknown positive holdings are not assigned a fabricated zero price.
  function worth(snapshots,pepUsd,usdtUsd,shicUsd=null,ltcUsd=null,dogeUsd=null,btcUsd=null,belUsd=null,dingoUsd=null,extraUsd={}){
    let total=0,priced=false,incomplete=false,positive=false;
    for(const coin of new Set(['pep','wht',...Object.keys(snapshots)])){
      const s=snapshots[coin];
      if(!s){incomplete=true;continue;}
      const amount=s.confirmed+s.unconfirmed;
      if(amount<=0n)continue;
      positive=true;
      const value=valueInUsdt(coin,amount,pepUsd,usdtUsd,shicUsd,ltcUsd,dogeUsd,btcUsd,belUsd,dingoUsd,extraUsd);
      if(value!==null){total+=value;priced=true;}
      else incomplete=true;
    }
    return {value:priced||(!positive&&!incomplete)?total:null,incomplete};
  }
  function marketQuote(data,id,now=Date.now()){
    if(!['shibacoin','litecoin','dogecoin','bitcoin','bellscoin','dingocoin','bitcoin-cash','dash','digibyte','junkcoin','luckycoin','ravencoin','catcoin','trumpow'].includes(id))throw Error('Unsupported price asset');
    const q=data?.[id],updated=q?.last_updated_at*1000;
    if(typeof q?.usd!=='number'||!Number.isFinite(q.usd)||q.usd<=0
      ||!Number.isSafeInteger(q?.last_updated_at)||updated>now+30000||now-updated>600000)throw Error('Price unavailable');
    return {value:q.usd,updated,at:now};
  }
  const shicQuote=(data,now=Date.now())=>marketQuote(data,'shibacoin',now);
  const ltcQuote=(data,now=Date.now())=>marketQuote(data,'litecoin',now);
  const dogeQuote=(data,now=Date.now())=>marketQuote(data,'dogecoin',now);
  const freshShic=(quote,now=Date.now())=>!!quote&&now-quote.at<300000&&now-quote.updated<=600000&&quote.updated<=now+30000;
  const btcQuote=(data,now=Date.now())=>marketQuote(data,'bitcoin',now);
  const belQuote=(data,now=Date.now())=>marketQuote(data,'bellscoin',now);
  const dingoQuote=(data,now=Date.now())=>marketQuote(data,'dingocoin',now);
  // Every supported coin uses dollar fee limits. Compare exact decimal ratios, not a
  // rounded display value or floating-point fee multiplication at the boundary.
  function feeUsd(coin,fee,quote,now=Date.now()){
    if(!['flop','bel','btc','bch','bonc','cat','dash','dgb','dingo','doge','jkc','ltc','lky','pep','rvn','shic','trmp','wht'].includes(coin))throw Error('Unsupported fee asset.');
    if(typeof fee!=='bigint'||fee<0n)throw Error('Invalid network fee.');
    if(!freshShic(quote,now)||!Number.isFinite(quote.value)||quote.value<=0
      ||!Number.isSafeInteger(quote.at)||!Number.isSafeInteger(quote.updated)||quote.at>now)
      throw Object.assign(Error('A fresh USD price is unavailable. The $5 warning and $100 fee limit cannot be checked. Try again later, or explicitly accept this risk for this transaction.'),{code:'USD_PRICE_UNAVAILABLE'});
    const [mantissa,exponent='0']=String(quote.value).toLowerCase().split('e');
    const decimals=(mantissa.split('.')[1]||'').length,scale=decimals-Number(exponent);
    let numerator=fee*BigInt(mantissa.replace('.','')),denominator=100000000n;
    if(scale>=0)denominator*=10n**BigInt(scale);else numerator*=10n**BigInt(-scale);
    const cents=(numerator*100n+denominator-1n)/denominator;
    return {cents,display:numerator>0n&&numerator*100n<denominator?'<$0.01 USD':`$${cents/100n}.${String(cents%100n).padStart(2,'0')} USD`,
      warning:numerator>5n*denominator,blocked:numerator>100n*denominator};
  }
  return {POLL_MS,WAIT_MS,create,worth,valueInUsdt,formatWorth,formatUnitPrice,shicQuote,ltcQuote,dogeQuote,btcQuote,belQuote,dingoQuote,marketQuote,freshShic,feeUsd};
});
