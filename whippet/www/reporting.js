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
  function valueInUsdt(coin,amount,pepUsd,usdtUsd){
    if(coin!=='pep'||!Number.isFinite(pepUsd)||pepUsd<=0||!Number.isFinite(usdtUsd)||usdtUsd<=0)return null;
    const value=Number(amount)/1e8*pepUsd/usdtUsd;
    return Number.isFinite(value)?value:null;
  }
  function formatWorth(value){
    if(value===null||!Number.isFinite(value))return '*';
    if(value>0&&value<0.01)return '<0.01';
    return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
  }
  // Include all known coin balances for this wallet, not the selected coin.
  // Unknown positive holdings are not assigned a fabricated zero price.
  function worth(snapshots,pepUsd,usdtUsd){
    let total=0,priced=false,incomplete=false,positive=false;
    for(const coin of ['pep','wht']){
      const s=snapshots[coin];
      if(!s){incomplete=true;continue;}
      const amount=s.confirmed+s.unconfirmed;
      if(amount<=0n)continue;
      positive=true;
      const value=valueInUsdt(coin,amount,pepUsd,usdtUsd);
      if(value!==null){total+=value;priced=true;}
      else incomplete=true;
    }
    return {value:priced||(!positive&&!incomplete)?total:null,incomplete};
  }
  return {POLL_MS,WAIT_MS,create,worth,valueInUsdt,formatWorth};
});
