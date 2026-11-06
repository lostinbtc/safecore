/* Local seed custody. Live development mode uses only pinned Electrum WSS endpoints. */
(() => {
  'use strict';
  const E = window.WalletEngine;
  const T = window.WalletTransactions, N = window.WalletNetwork;
  const $ = id => document.getElementById(id);
  const STORE = 'whippet.dev.encrypted.v1';
  const library = WalletLibrary.create(localStorage);
  const protectedWallet = vault => vault?.format === E.FORMAT;
  const withWalletLock = task => navigator.locks.request('corevault-wallet-storage', task);
  const COIN_PREFS = 'corevault.hidden-coins.v1';
  // Approved brand icon; older gallery-preview choices do not override it.
  const BRAND_PREF = 'corevault.icon.v2';
  const DEFAULT_BRAND = 26;
  const BRAND_ICONS = ['Shield Core','Orbit','Safe Hex','SC Monogram','Vault Dial','Linked','Keystone','Core Layers','Signal','North Star','Minted Core','Twin Coins','Chain Token','Block Mint','Core Coin','Coin Reserve','Crypto Orbit','Node Coin','Crystal Token','Proof Coin','Nexus Hub','Hex Mesh','Relay Ring','Node Shield','Consensus','Ledger Cube','Circuit Core','Constellation','Dual Hub','Chain Bridge'];
  const brandPath = id => id ? `assets/icons/safecore-${String(id).padStart(2,'0')}.svg` : 'assets/corevault.svg';
  function savedBrand(){try{const raw=localStorage.getItem(BRAND_PREF);if(raw===null)return DEFAULT_BRAND;const id=Number(raw);return Number.isInteger(id)&&id>=0&&id<=BRAND_ICONS.length?id:DEFAULT_BRAND;}catch(_){return DEFAULT_BRAND;}}
  function applyBrand(id){document.querySelector('.mobile-brand img').src=brandPath(id);document.querySelector('link[rel="icon"]').href=brandPath(id);}
  // Display catalog only. Coming-soon entries never enter the key engine.
  const COINS = { ...E.NETWORKS, doge: { name: 'Dogecoin', ticker: 'DOGE', comingSoon: true } };
  let hiddenCoins = [];
  function loadCoinPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(COIN_PREFS) || '["doge"]');
      hiddenCoins = Array.isArray(saved) ? saved.filter(coin => Object.hasOwn(COINS, coin)) : ['doge'];
    } catch (_) { hiddenCoins = ['doge']; }
  }
  loadCoinPrefs();
  const visibleCoins = () => Object.keys(COINS).filter(coin => !hiddenCoins.includes(coin));
  const icons = {
    wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8h15M17 12h4v5h-4a2.5 2.5 0 0 1 0-5Z"/>',
    receive: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    send: '<path d="M12 17V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0m-4 8v2"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.wallet}</svg>`;
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const coinImage = coin => `assets/${coin === 'pep' ? 'pepecoin' : 'whippet'}.png`;
  const coinMark = coin => coin === 'doge' ? '<span class="doge-mark" aria-hidden="true">Ð</span>' : `<img src="${coinImage(coin)}" alt="">`;
  let envelope = null, pending = null, sendCoin = null, receiveCoin = null;
  let receiveBooks = null, addingWallet = false, revealed = false;
  let receivePools = null, networkEpoch = 0, snapshots = {}, networkErrors = {}, scans = {}, lastRefresh = {}, sendDraft = null;
  let rescanning=false,sweepState=null;
  let komodoGate=null;
  const komodoPreference=()=>envelope?'corevault.komodo-recovery.'+WalletLibrary.id(envelope):null;
  const komodoEnabled=()=>{try{return Boolean(envelope)&&localStorage.getItem(komodoPreference())==='true';}catch(_){return false;}};
  const komodoVerified=()=>komodoEnabled()&&komodoGate?.source===envelope&&komodoGate.epoch===networkEpoch&&Date.now()<komodoGate.expires;
  function clearKomodo(){
    if(komodoGate)clearTimeout(komodoGate.timer);komodoGate=null;
    for(const id of ['komodo-phrase','verify-wallet-phrase','verify-wallet-passphrase','verify-wallet-password'])if($(id))$(id).value='';
    for(const id of ['komodo-suggestions','verify-wallet-suggestions'])$(id)?.replaceChildren();
  }
  const scanVersions={},fullScanCompletions={};
  let sendRefreshRun=null;
  let sweepReceipt=null,sweepReceiptTimer=null;
  function clearSweepReceipt(){clearTimeout(sweepReceiptTimer);sweepReceiptTimer=null;sweepReceipt=null;}
  function sweepProgress(message){const el=$('sweep-progress');if(el){el.textContent=message;el.hidden=false;}}
  let initialDiscovery = new Set();
  function clearSweep(){if(sweepState){clearTimeout(sweepState.timer);sweepState.key=null;sweepState=null;}const field=$('sweep-key');if(field)field.value='';}
  let reports={},reportTimers={},deleteTarget=null;
  function clearReports(){for(const timer of Object.values(reportTimers))clearTimeout(timer);reportTimers={};reports={};}
  const reported=coin=>reports[coin]?.value;
  let pepPrice=null,priceAttempt=0,priceBusy=false;
  const priceFresh=()=>pepPrice&&Date.now()-pepPrice.at<300000;
  async function refreshPrice(){
    if(priceBusy||Date.now()-priceAttempt<60000||mode!=='unlocked'||document.hidden)return;
    priceBusy=true;priceAttempt=Date.now();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch('https://api.kraken.com/0/public/Ticker?pair=PEPUSD,USDTUSD',{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok)throw Error('Price unavailable');
      const data=await response.json(),value=Number(data.result?.PEPUSD?.c?.[0]),usdt=Number(data.result?.USDTZUSD?.c?.[0]);
      if(!Array.isArray(data.error)||data.error.length||!Number.isFinite(value)||value<=0)throw Error('Invalid price');
      pepPrice={value,usdt:Number.isFinite(usdt)&&usdt>0?usdt:null,at:Date.now()};
    }catch(_){/* Price availability never changes coin balances or spending. */}
    finally{clearTimeout(timer);priceBusy=false;if(!document.hidden&&['','#wallet'].includes(location.hash))render();}
  }
  let mode = 'demo', generation = 0, idleTimer = null, toastTimer = null;
  let stagedFile = null, setupType = 'create', busy = false;
  try {
    const saved = localStorage.getItem(STORE);
    if (saved) { envelope = E.validateEnvelope(JSON.parse(saved)); mode = 'locked'; }
  } catch (_) { mode = 'storage-error'; }
  function prepareAddresses(candidate, vault) {
    sendCoin = null; receiveCoin = null;
    clearReports();
    clearSweep();clearKomodo();clearSweepReceipt();rescanning=false;sendRefreshRun=null;
    const pools = E.receivePool(ethers, candidate,200);
    N.close(); networkEpoch++; snapshots = {}; networkErrors = {}; scans = {}; lastRefresh = {}; sendDraft = null; receivePools = pools;
    initialDiscovery = new Set(Object.keys(pools));
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('corevault.receive.' + WalletLibrary.id(vault)) || '{}'); } catch (_) {}
    receiveBooks = Object.fromEntries(Object.entries(pools).map(([coin,pool]) => [coin, ReceiveBook.create(pool, prefs?.[coin] || {})]));
    for(const coin of Object.keys(pools)){
      try { const cached=N.decode(localStorage.getItem('corevault.balance.'+WalletLibrary.id(vault)+'.'+coin),coin,pools[coin]);
        if(cached){snapshots[coin]=cached;reports[coin]=WalletReporting.create(cached);receiveBooks[coin].remember(cached.everUsed);}
      } catch (_) { /* Missing/corrupt cache triggers discovery, never a false zero. */ }
    }
    // Start both assets even when opening on Security or an unselected Receive tab.
    // Callers finish unlocking synchronously before this microtask runs.
    const epoch = networkEpoch;
    queueMicrotask(() => {
      if (epoch === networkEpoch) for (const coin of initialDiscovery) void refreshLive(coin);
    });
  }
  function openUnprotected() {
    if (envelope?.format === E.OPEN_FORMAT) {
      prepareAddresses(E.validateRecipe(ethers, envelope.recipe), envelope); mode = 'unlocked';
    }
  }
  try { openUnprotected(); } catch (_) { mode = 'storage-error'; }
  try { document.documentElement.dataset.theme = localStorage.getItem('corevault.theme') === 'light' ? 'light' : 'dark'; } catch (_) {}

  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }
  function error(message) {
    $('error').textContent = message; $('error').hidden = false;
  }
  function clearError() { $('error').hidden = true; $('error').textContent = ''; }
  function resetIdle() {
    clearTimeout(idleTimer);
    if ((mode === 'unlocked' && protectedWallet(envelope)) || pending || revealed || document.querySelector('#phrase, #passphrase, #unlock-password, #seed-password, #komodo-phrase, #verify-wallet-phrase')) {
      idleTimer = setTimeout(() => lock(protectedWallet(envelope) ? 'Wallet locked after inactivity.' : 'Recovery details hidden after inactivity.'), 120000);
    }
  }
  function lock(message, reopen = true) {
    clearSweep();clearKomodo();clearSweepReceipt();rescanning=false;sendRefreshRun=null;
    sendCoin = null; receiveCoin = null;
    clearReports();
    N.close(); networkEpoch++; receivePools = null; snapshots = {}; networkErrors = {}; scans = {}; lastRefresh = {}; sendDraft = null;
    initialDiscovery.clear();
    generation++; pending = null; receiveBooks = null; stagedFile = null; busy = false; revealed = false; addingWallet = false;
    clearTimeout(idleTimer);
    mode = envelope ? 'locked' : mode === 'storage-error' ? 'storage-error' : 'demo';
    if(reopen&&envelope?.format===E.OPEN_FORMAT&&!document.hidden)openUnprotected();
    clearError(); render();
    if (message) toast(message);
  }
  function go(route) {
    if (route !== 'backup') pending = null;
    if (!['setup','backup'].includes(route)) addingWallet = false;
    if (location.hash === '#' + route) render(); else location.hash = route;
  }
  function liveEnabled() {
    return Boolean(envelope);
  }
  const fresh = coin => snapshots[coin] && !snapshots[coin].cached && !networkErrors[coin] && Date.now() - snapshots[coin].at < 45000;
  async function refreshLive(coin,full=false,indices=null) {
    if (!liveEnabled() || mode !== 'unlocked' || !receivePools?.[coin] || document.hidden) return null;
    if(indices&&initialDiscovery.has(coin))return null;
    // Confirmed-send refreshes supersede slow scans instead of queuing behind them.
    // The version guard prevents those older results from restoring spent balances.
    while (!indices&&scans[coin]) {if(!full)return scans[coin];const epoch=networkEpoch;await scans[coin];if(epoch!==networkEpoch)return null;}
    const version=(scanVersions[coin]||0)+1;scanVersions[coin]=version;
    lastRefresh[coin] = Date.now();
    const epoch = networkEpoch, source = envelope;
    const work = (async () => {
      try {
        const prior=snapshots[coin];
        if(prior)prior.everUsed=[...new Set([...(prior.everUsed||[]),...receiveBooks[coin].preferences().used])];
        const snapshot = await N.scan(coin, receivePools[coin],prior,{full:full || initialDiscovery.has(coin),verify:reports[coin]?.pending===true,...(indices?{indices}:{})});
        if (epoch !== networkEpoch || version!==scanVersions[coin] || source !== envelope || !liveEnabled()) return null;
        if(full)fullScanCompletions[coin]=(fullScanCompletions[coin]||0)+1;
        // Completion belongs to this wallet session, not its disk cache or display delay.
        initialDiscovery.delete(coin);
        for (const row of snapshot.rows) if(row.checked!==false)receiveBooks[coin].observe(row.account.address, row.history);
        snapshots[coin] = snapshot; delete networkErrors[coin];
        receiveBooks[coin].remember(snapshot.everUsed||[]);
        const gate=reports[coin]||(reports[coin]=WalletReporting.create());
        const report=gate.observe(snapshot);
        clearTimeout(reportTimers[coin]);delete reportTimers[coin];
        if(!report.published){
          reportTimers[coin]=setTimeout(()=>{
            delete reportTimers[coin];
            if(epoch===networkEpoch&&source===envelope&&!document.hidden)void refreshLive(coin);
          },report.remaining);
          return null;
        }
        try {
          await withWalletLock(()=>{
            if(epoch!==networkEpoch||version!==scanVersions[coin]||source!==envelope)return;
            const key='corevault.balance.'+WalletLibrary.id(source)+'.'+coin;
            const existing=N.decode(localStorage.getItem(key),coin,receivePools[coin]);
            snapshot.everUsed=[...new Set([...(snapshot.everUsed||[]),...(existing?.everUsed||[])])];
            localStorage.setItem(key,N.encode(snapshot));
          });
        } catch (_) { toast('Balance refreshed, but could not be saved on this device.'); }
        return epoch===networkEpoch&&version===scanVersions[coin]?snapshot:null;
      } catch (e) {
        if (epoch === networkEpoch&&version===scanVersions[coin]) { networkErrors[coin] = e.message;reports[coin]?.invalidate();clearTimeout(reportTimers[coin]);delete reportTimers[coin]; }
        return null;
      } finally {
        if (epoch === networkEpoch&&version===scanVersions[coin]) {
          delete scans[coin];
          if (['', '#wallet', '#activity'].includes(location.hash) || coin === receiveCoin && location.hash === '#receive') render();
          if (location.hash === '#send') updateSendPicker();
        }
      }
    })();
    scans[coin] = work; return work;
  }
  function sendAttempts() {
    const raw = localStorage.getItem('corevault.send-attempts.' + WalletLibrary.id(envelope));
    const attempts = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(attempts) || attempts.some(a=>!a || !/^[0-9a-f]{64}$/.test(a.txid) || !Object.hasOwn(E.NETWORKS,a.coin) || !Array.isArray(a.outpoints) || a.outpoints.some(o=>! /^[0-9a-f]{64}:\d+$/.test(o)) || !['unknown','submitted'].includes(a.status))) throw Error('Send records could not be read. Do not retry a previous payment until its status is checked.');
    if(attempts.some(a=>a.refreshIndices!==undefined&&(!Array.isArray(a.refreshIndices)||!a.refreshIndices.length||a.refreshIndices.length>200||a.refreshIndices.some(i=>!Number.isInteger(i)||i<0||i>=200))||a.balanceRefreshed!==undefined&&typeof a.balanceRefreshed!=='boolean'))throw Error('Invalid send refresh metadata.');
    return attempts;
  }
  async function checkSentBalances(){
    if(sendRefreshRun||mode!=='unlocked'||!envelope||document.hidden)return;
    const run={},epoch=networkEpoch,source=envelope;sendRefreshRun=run;
    const active=()=>sendRefreshRun===run&&epoch===networkEpoch&&source===envelope&&mode==='unlocked'&&!document.hidden;
    try{
      for(const attempt of sendAttempts().filter(a=>a.refreshIndices&&!a.balanceRefreshed)){
        if(!active())return;
        const coin=attempt.coin,indices=attempt.refreshIndices;
        if(initialDiscovery.has(coin)||!snapshots[coin])continue;
        try{
          const result=await N.confirmation(coin,attempt.txid,receivePools[coin][indices[0]].address);
          if(!active())return;
          if(result.confirmations<1)continue;
          const snapshot=await refreshLive(coin,false,indices);
          if(!active())return;
          if(!snapshot)continue; // A changed total still needs a fresh matching read.
          await withWalletLock(()=>{
            if(!active())return;
            const records=sendAttempts();
            localStorage.setItem('corevault.send-attempts.'+WalletLibrary.id(source),JSON.stringify(records.map(a=>a.txid===attempt.txid?{...a,balanceRefreshed:true}:a)));
          });
          if(active()&&$('submitted-txid')?.textContent===attempt.txid){
            $('main').innerHTML=title('Transaction confirmed','Your wallet balance has been refreshed.')+`<code class="address">${escape(attempt.txid)}</code><a href="#activity" class="text-button">Check activity →</a>`;
          }
        }catch(_){/* Keep the public attempt pending; retry reads, never broadcast. */}
      }
    }catch(_){/* Malformed local records cannot authorize requests or a send. */}
    finally{if(sendRefreshRun===run)sendRefreshRun=null;}
  }
  const fundedCoins = () => Object.keys(E.NETWORKS).filter(coin => {
    const value = reported(coin);
    return value && value.confirmed + value.unconfirmed > 0n;
  });
  function updateSendPicker() {
    const host = $('send-picker');
    if (!host) return;
    const open = Boolean(host.querySelector('details')?.open), coins = fundedCoins();
    const name = sendCoin ? E.NETWORKS[sendCoin].name : 'Choose an asset';
    const value = sendCoin && reported(sendCoin);
    const balance = value ? `${T.format(value.confirmed + value.unconfirmed)} ${E.NETWORKS[sendCoin].ticker}` : '';
    host.innerHTML = `<details class="wallet-coin-switch" ${open ? 'open' : ''}><summary id="send-coin" class="coin-picker" aria-label="Choose sending asset">${sendCoin ? coinMark(sendCoin) : ''}<span>${name}<small>${balance || 'Assets with a balance'}</small></span><span class="picker-chevron" aria-hidden="true"></span></summary><div class="wallet-coin-options">${coins.length ? coins.map(coin => {
      const n = E.NETWORKS[coin], s = reported(coin);
      return `<button type="button" data-send-coin="${coin}" aria-pressed="${coin === sendCoin}">${coinMark(coin)}<span>${n.name}<small>${T.format(s.confirmed + s.unconfirmed)} ${n.ticker}${!fresh(coin) ? ' · Last known' : ''}${s.unconfirmed ? ' · Includes pending' : ''}</small></span></button>`;
    }).join('') : `<p class="subtle">${Object.keys(E.NETWORKS).some(coin => !reported(coin)) ? 'Checking balances…' : 'No assets with a balance yet.'}</p>`}</div></details>`;
    host.querySelectorAll('[data-send-coin]').forEach(el => el.onclick = () => {
      if (!fundedCoins().includes(el.dataset.sendCoin)) return;
      if (sendCoin === el.dataset.sendCoin) { host.querySelector('details').open = false; return; }
      // Network changes invalidate the form, quote and any late async callback.
      generation++; sendCoin = el.dataset.sendCoin; sendDraft = null; busy = false; clearError(); send();
      $('send-coin').focus();
    });
  }
  function send() {
    if (!envelope) { go('setup'); return; }
    if (mode !== 'unlocked') { go('unlock'); return; }
    sendDraft = null;
    const header = '<div class="page-head"><h1>Send</h1></div><div id="send-picker"></div>';
    if (!sendCoin) { $('main').innerHTML = header; updateSendPicker(); return; }
    const coin = sendCoin, network = E.NETWORKS[coin];
    $('main').innerHTML = header +
      `<form id="send-form" class="form-panel"><label for="send-address">Receiving address</label><div class="send-address-row"><input id="send-address" autocomplete="off" spellcheck="false" required maxlength="40"><button id="scan-address" type="button" class="icon-button" aria-label="Scan address QR code" title="Scan address QR code">${icon('camera')}</button></div><section id="scan-panel" aria-label="Scan receiving address" hidden><div class="scan-view"><video id="scan-video" autoplay muted playsinline></video><span id="scan-hint" class="scan-hint">Starting camera…</span></div><button id="cancel-scan" type="button" class="text-button">Cancel scan</button></section><p id="scan-status" class="inline-info" role="status" hidden></p><label for="send-amount">Total including fee (${network.ticker})</label><input id="send-amount" inputmode="decimal" autocomplete="off" required placeholder="0.00"><button id="send-max" type="button" class="text-button" disabled>Max</button><p class="subtle">Network fee: 0.01 ${network.ticker} for small transactions.</p><div id="send-estimate" aria-live="polite" class="subtle">Checking available balance…</div><div class="form-actions">${button('review-send','Review transaction','primary')}<a href="#wallet" class="text-button">Cancel</a></div></form>`;
    updateSendPicker();
    $('review-send').type = 'submit';
    const viewToken=generation,viewWallet=envelope;
    let quote=null;
    const activeView=()=>generation===viewToken&&envelope===viewWallet&&Boolean($('send-estimate'));
    const scanButton=$('scan-address'),scanPanel=$('scan-panel'),scanStatus=$('scan-status'),scanVideo=$('scan-video'),addressInput=$('send-address'),reviewButton=$('review-send');
    let stopScan=null;
    scanButton.onclick=()=>{
      if(!activeView()||scanButton.disabled)return;
      scanPanel.hidden=false;scanStatus.hidden=false;scanStatus.textContent='Allow camera access to scan an address.';
      scanButton.disabled=true;reviewButton.disabled=true;
      stopScan=WalletScanner.start({video:scanVideo,status:scanStatus,hint:$('scan-hint'),coin,validate:T.script,
        onClose:()=>{scanPanel.hidden=true;scanButton.disabled=false;reviewButton.disabled=false;stopScan=null;},
        onAddress:address=>{
          if(!activeView()||!addressInput.isConnected)return;
          const same=addressInput.value.trim()===address;
          addressInput.value=address;addressInput.dispatchEvent(new Event('input'));
          scanStatus.textContent=same?'Address scanned. Same address confirmed.':'Address scanned. Check it before sending.';
          toast(same?'Same address confirmed.':'Address scanned. Check the recipient.');
          addressInput.scrollIntoView({block:'nearest'});
        }
      });
      scanVideo.scrollIntoView({block:'nearest'});
    };
    $('cancel-scan').onclick=()=>{stopScan?.();scanStatus.hidden=true;scanButton.focus();};
    async function available(){
      const snapshot=await refreshLive(coin);
      if(!snapshot)throw Error('Could not refresh your balance. Try again before sending.');
      const utxos=await N.spendable(snapshot);
      if(!activeView())return null;
      const blocked=new Set(sendAttempts().filter(a=>a.coin===coin).flatMap(a=>a.outpoints));
      if(utxos.length&&utxos.every(u=>blocked.has(u.txid+':'+u.pos)))throw Error('These coins have a previous send attempt. Check its transaction ID in Activity before trying another payment.');
      return {snapshot,utxos:utxos.filter(u=>!blocked.has(u.txid+':'+u.pos))};
    }
    function build(data,destination,requested){return T.plan({coin,destination,amount:requested,utxos:data.utxos,changeAddress:receivePools[coin][0].address,feeRate:data.snapshot.feeRate,tip:data.snapshot.tip,feeIncluded:true,flatFee:true});}
    function estimate(){
      if(!activeView()||!quote)return;
      if(!$('send-amount').value){$('send-estimate').textContent='Enter a total to see what the recipient receives.';return;}
      try{
        const p=build(quote,$('send-address').value.trim()||receivePools[coin][0].address,$('send-amount').value.trim());
        $('send-estimate').innerHTML=`<strong>You are sending ${T.format(p.amount)} ${network.ticker}</strong><br>Network fee: ${T.format(p.fee)} ${network.ticker}<br>Total deducted: ${T.format(p.amount+p.fee)} ${network.ticker}<br><small>Rechecked before confirmation.</small>`;
      }catch(e){$('send-estimate').textContent=e.message;}
    }
    $('send-address').oninput=estimate;$('send-amount').oninput=estimate;
    $('send-max').onclick=()=>{
      if(!quote)return;
      const total=quote.utxos.slice().sort((a,b)=>a.value>b.value?-1:a.value<b.value?1:0).slice(0,T.FLAT_MAX_INPUTS).reduce((n,u)=>n+u.value,0n);
      $('send-amount').value=T.format(total);estimate();
    };
    void available().then(data=>{if(data&&activeView()){quote=data;$('send-max').disabled=false;estimate();}}).catch(e=>{if(activeView())$('send-estimate').textContent=e.message;});
    $('send-form').onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      stopScan?.();
      const token = generation, source = envelope;
      const destination = $('send-address').value.trim(), requested = $('send-amount').value.trim();
      clearError(); busy = true; $('review-send').disabled = true; $('review-send').textContent = 'Checking confirmed coins…';
      try {
        T.script(coin,destination); T.amount(requested);
        const data = await available();
        if (token !== generation || source !== envelope) return;
        if(!data)return;
        const plan = build(data,destination,requested);
        snapshots[coin] = data.snapshot;
        sendDraft = {plan, walletId:WalletLibrary.id(source)};
        sendReview();
      } catch (e) { if (token === generation) error(e.message); }
      finally { if (token === generation) { busy = false; if ($('review-send')) { $('review-send').disabled = false; $('review-send').textContent = 'Review transaction'; } } }
    };
  }
  function renderSweepReceipt(){
    const r=sweepReceipt;if(!r)return;
    const confirmed=r.confirmations>0;
    const message=confirmed?'The sweep has its first confirmation.':r.error?'Unable to check confirmation right now. Retrying automatically. Do not repeat the sweep.':r.seen?'Waiting for the first confirmation. Keep this page open to follow progress. Do not repeat the sweep.':'Submitted to the node. Waiting for it to appear in transaction history. Do not repeat the sweep.';
    $('main').innerHTML=title(confirmed?'Sweep confirmed':'Sweep submitted',confirmed?'Funds were sent to your wallet.':'The transaction has been submitted; confirmation is pending.')+
      `<p class="notice" id="sweep-confirmation" role="status" aria-live="polite">${message}</p><code class="address">${escape(r.txid)}</code><p class="subtle">Closing this page will not cancel the submitted transaction. Its status is available in Activity.</p><a href="#activity" class="text-button">Check activity →</a>`;
  }
  function watchSweep(coin,txid,destination){
    clearSweepReceipt();
    const r={coin,txid,destination,confirmations:0,seen:false,error:false};sweepReceipt=r;
    const epoch=networkEpoch,source=envelope;
    const active=()=>sweepReceipt===r&&epoch===networkEpoch&&source===envelope&&mode==='unlocked'&&['#sweep','#komodo-sweep'].includes(location.hash)&&!document.hidden;
    const check=async()=>{
      if(!active())return;
      try{const result=await N.confirmation(coin,txid,destination);if(!active())return;r.confirmations=result.confirmations;r.seen=result.seen;r.error=false;}
      catch(_){if(!active())return;r.error=true;}
      renderSweepReceipt();
      if(!r.confirmations)sweepReceiptTimer=setTimeout(check,WalletReporting.POLL_MS);
      else void refreshLive(coin);
    };
    renderSweepReceipt();void check();
  }
  async function prepareSweepReview(key,active,komodoRecovery=false){
    const coin=receiveCoin,source=envelope;
    if(key.coin!==coin||komodoRecovery&&(coin!=='pep'||!komodoVerified()))throw Error('Verify your current wallet backup before Komodo recovery.');
    const state={key,destinationIndex:null,komodo:komodoRecovery};sweepState=state;
    await refreshLive(coin);
    if(!active()||sweepState!==state)return;
    if(!fresh(coin))throw Error('Could not verify your receiving addresses. Reconnect and try again.');
    const view=receiveBooks[coin].view(),index=view.pinned?0:view.cursor;
    if(index>=200)throw Error('Wallet addresses are full. Select the first-address option or use another wallet.');
    const destination=receivePools[coin][index].address;
    if(!view.pinned&&snapshots[coin].rows[index].checked===false)throw Error('Receiving address has not been checked yet. Rescan and try again.');
    if(receivePools[coin].some(a=>a.address===key.address))throw Error('This key already belongs to this wallet. Use Rescan to discover its balance.');
    sweepProgress('Checking all deposits and calculating the sweep fee. Please keep this page open…');
    const data=await N.sweepSource(coin,key.address,{compressed:key.compressed});
    if(!active()||sweepState!==state)return;
    const p=T.sweepPlan({coin,destination,utxos:data.utxos,tip:data.snapshot.tip,feeRate:data.snapshot.feeRate,compressed:key.compressed});
    state.destinationIndex=index;
    state.timer=setTimeout(()=>{if(sweepState===state){clearSweep();sendDraft=null;if(active()){if(komodoRecovery){clearKomodo();komodo();}else sweep();error('Sweep review expired. Enter the recovery details again.');}}},90000);
    sendDraft={plan:p,walletId:WalletLibrary.id(source),sweep:true,komodo:komodoRecovery};sendReview();
  }
  function komodo(){
    if(mode!=='unlocked'||receiveCoin!=='pep'||!komodoEnabled()){clearKomodo();clearSweep();go('security');return;}
    if(sweepReceipt){renderSweepReceipt();return;}
    clearSweep();sendDraft=null;
    const token=generation,source=envelope;
    const active=()=>token===generation&&source===envelope&&mode==='unlocked'&&location.hash==='#komodo-sweep'&&!document.hidden&&komodoEnabled();
    const warning='<p class="notice">Pepecoin only. This moves all spendable PEP from the derived legacy Komodo address, minus the fee, into your current SafeCore wallet. Your current recovery phrase will control the recovered funds. Do not reuse the old Komodo seed or deposit address. Keep its backup until all assets are recovered: other coins and HD accounts are not swept.</p>';
    if(!komodoVerified()){
      clearKomodo();
      $('main').innerHTML=title('Verify your new wallet','Re-enter the current SafeCore recovery phrase from your backup. This does not restore or replace a wallet.')+warning+
        `<form id="komodo-verify-form" class="form-panel" autocomplete="off"><label for="verify-wallet-phrase">Current SafeCore recovery phrase</label><textarea id="verify-wallet-phrase" maxlength="1000" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" aria-describedby="verify-wallet-status"></textarea><div id="verify-wallet-suggestions" class="recovery-suggestions" role="group" aria-label="Current wallet recovery suggestions" hidden></div><p id="verify-wallet-status" class="inline-info" aria-live="polite"></p><label for="verify-wallet-passphrase">Extra BIP39 passphrase, if used</label><input id="verify-wallet-passphrase" type="password" maxlength="1000" autocomplete="off">${protectedWallet(envelope)?'<label for="verify-wallet-password">Current wallet password</label><input id="verify-wallet-password" type="password" autocomplete="off" required>':''}<label class="check"><input id="komodo-backup-ack" type="checkbox" required><span>I saved this new wallet’s recovery phrase and any extra passphrase separately from my old Komodo backup.</span></label>${button('verify-komodo-wallet','Verify current wallet','primary wide')}<a href="#sweep" class="text-button">Cancel</a></form>`;
      const submit=$('verify-komodo-wallet');submit.type='submit';
      WalletRecovery.attach(ethers,{input:$('verify-wallet-phrase'),list:$('verify-wallet-suggestions'),status:$('verify-wallet-status'),onValidity:valid=>submit.disabled=busy||!valid});
      $('komodo-verify-form').onsubmit=async event=>{
        event.preventDefault();if(!active()||busy)return;clearError();
        if(!$('komodo-backup-ack').checked){error('Confirm that you have saved the new wallet backup.');return;}
        busy=true;submit.disabled=true;
        try{
          const fingerprint=await WalletKomodo.verifyDestination(crypto,source,$('verify-wallet-password')?.value||'',$('verify-wallet-phrase').value,$('verify-wallet-passphrase').value);
          if(!active())return;
          clearKomodo();
          const gate={fingerprint,source,epoch:networkEpoch,expires:Date.now()+600000};komodoGate=gate;
          gate.timer=setTimeout(()=>{if(komodoGate===gate){clearKomodo();clearSweep();sendDraft=null;generation++;busy=false;if(location.hash==='#komodo-sweep'){komodo();error('Verification expired. Verify your new wallet backup again.');}}},600000);
          busy=false;komodo();
        }catch(e){if(active())error(e.message);}
        finally{if(active()){busy=false;if($('verify-wallet-password'))$('verify-wallet-password').value='';if(submit.isConnected)submit.disabled=false;}}
      };return;
    }
    $('main').innerHTML=title('Komodo Sweep','Recover legacy Komodo Wallet Pepecoin into your verified SafeCore wallet.')+warning+
      `<form id="komodo-sweep-form" class="form-panel" autocomplete="off"><label for="komodo-phrase">Old Komodo passphrase / seed words</label><textarea id="komodo-phrase" maxlength="2048" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" aria-describedby="komodo-status"></textarea><div id="komodo-suggestions" class="recovery-suggestions" role="group" aria-label="Komodo word suggestions" hidden></div><p id="komodo-status" class="inline-info" aria-live="polite"></p><p class="subtle">Legacy 12 or 24 words only; not Komodo HD accounts or KMD coin. Outer spaces are trimmed to match the converter. Case and internal spacing are preserved. Suggestions change a word only when you choose one.</p><p class="subtle">The old phrase stays on this device and is not saved. Review the derived PEP address and estimated fee before confirming.</p><p id="sweep-progress" class="notice" role="status" aria-live="polite" hidden></p>${button('review-komodo-sweep','Review Komodo sweep','primary wide')}<a href="#sweep" class="text-button">Cancel</a></form>`;
    const submit=$('review-komodo-sweep');submit.type='submit';
    WalletRecovery.attach(ethers,{input:$('komodo-phrase'),list:$('komodo-suggestions'),status:$('komodo-status'),mode:'komodo',onValidity:valid=>submit.disabled=busy||!valid});
    $('komodo-sweep-form').onsubmit=async event=>{
      event.preventDefault();if(!active()||busy)return;clearError();busy=true;submit.disabled=true;
      try{
        if(!komodoVerified())throw Error('Verify your new wallet backup again.');
        const key=WalletKomodo.key($('komodo-phrase').value,komodoGate.fingerprint);$('komodo-phrase').value='';$('komodo-suggestions').replaceChildren();
        sweepProgress('Checking your receiving address. Please keep this page open…');
        await prepareSweepReview(key,()=>active()&&komodoVerified(),true);
      }catch(e){if(active()){clearSweep();error(e.message);}}
      finally{if(active()){busy=false;if(submit.isConnected)submit.disabled=false;if($('sweep-progress'))$('sweep-progress').hidden=true;}}
    };
  }
  function sweep(){
    if(sweepReceipt){renderSweepReceipt();return;}
    clearSweep();sendDraft=null;
    const coin=receiveCoin;
    if(mode!=='unlocked'||!E.NETWORKS[coin]){go('receive');return;}
    const ticker=E.NETWORKS[coin].ticker,token=generation,source=envelope;
    const active=()=>token===generation&&source===envelope&&mode==='unlocked'&&location.hash==='#sweep'&&!document.hidden;
    $('main').innerHTML='<div class="page-head"><h1>Sweep private key</h1></div>'+`<p>Move the full ${ticker} balance from one private key into this wallet.</p><p class="notice">Select the correct asset: PEP and WHT share the same private-key format. The key stays on this device and is not saved.</p><form id="sweep-form" class="form-panel"><label for="sweep-key">Private key (WIF)</label><div class="send-address-row"><input id="sweep-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="52" required><button id="scan-key" type="button" class="icon-button" aria-label="Scan private key QR code">${icon('camera')}</button></div><section id="scan-panel" hidden><div class="scan-view"><video id="scan-video" autoplay muted playsinline></video><span id="scan-hint" class="scan-hint">Starting camera…</span></div><button id="cancel-scan" type="button" class="text-button">Cancel scan</button></section><p id="scan-status" role="status" hidden></p><p class="subtle">Standard WIF keys only. Deposits must be confirmed and mining rewards mature.</p><p class="subtle">Review the estimated network fee before confirming.</p><p id="sweep-progress" class="notice" role="status" aria-live="polite" hidden></p>${button('review-sweep','Review sweep','primary wide')}<a href="#receive" class="text-button">Cancel</a></form>`;
    if(coin==='pep'&&komodoEnabled()){
      $('sweep-form').insertAdjacentHTML('afterend',button('komodo-open','Komodo Sweep','wide'));
      $('komodo-open').onclick=()=>go('komodo-sweep');
    }
    const input=$('sweep-key'),submit=$('review-sweep'),scanButton=$('scan-key'),panel=$('scan-panel'),status=$('scan-status');submit.type='submit';
    let stopScan=null;
    scanButton.onclick=()=>{
      if(!active()||scanButton.disabled)return;input.value='';panel.hidden=false;status.hidden=false;scanButton.disabled=true;submit.disabled=true;
      stopScan=WalletScanner.start({video:$('scan-video'),status,hint:$('scan-hint'),coin,privateKey:true,
        parseValue:raw=>{T.sweepKey(coin,raw);return raw.trim();},
        onClose:()=>{panel.hidden=true;scanButton.disabled=false;submit.disabled=false;stopScan=null;},
        onAddress:value=>{if(active()){input.value=value;status.textContent='Private key scanned. Review the sweep before sending.';}}
      });
    };
    $('cancel-scan').onclick=()=>{stopScan?.();status.hidden=true;};
    $('sweep-form').onsubmit=async event=>{
      event.preventDefault();if(busy||!active())return;stopScan?.();clearError();busy=true;submit.disabled=true;scanButton.disabled=true;
      sweepProgress('Checking your receiving address. Please keep this page open…');
      try{
        const key=T.sweepKey(coin,input.value);input.value='';
        await prepareSweepReview(key,active);
      }catch(e){if(active()){clearSweep();error(e.message);}}
      finally{if(active()){busy=false;if($('sweep-progress'))$('sweep-progress').hidden=true;if($('review-sweep')){submit.disabled=false;scanButton.disabled=false;}}}
    };
  }
  function sendReview() {
    if (!sendDraft || mode !== 'unlocked') { go('wallet'); return; }
    const p = sendDraft.plan, ticker = E.NETWORKS[p.coin].ticker;
    const sweeping=sendDraft.sweep===true;
    if(sendDraft.komodo&&(p.coin!=='pep'||!komodoVerified())){clearSweep();clearKomodo();sendDraft=null;go('security');return;}
    $('main').innerHTML = title(sweeping?'Review sweep':'Review transaction', 'Nothing has been sent yet.', protectionIcon(protectedWallet(envelope))) +
      (sweeping?`<p class="subtle">From external ${ticker} address: <code>${escape(sweepState.key.address)}</code><br>Into your wallet, Address #${sweepState.destinationIndex+1}. The key will not be saved.</p><p class="subtle">Full source balance: ${T.format(p.budget)} ${ticker}.</p>`:'')+
      (sweeping?`<p class="notice" id="sweep-fee-estimate">Estimated network fee: <strong>${T.format(p.fee)} ${ticker}</strong>, deducted from the swept balance.</p>`:`<p class="notice">You are sending <strong>${T.format(p.amount)} ${ticker}</strong> to the recipient.</p>`)+`<div class="details send-review"><div class="detail-row"><span>Network</span><strong>${E.NETWORKS[p.coin].name} mainnet</strong></div><div class="detail-row"><span>Recipient</span><code>${escape(p.destination)}</code></div><div class="detail-row"><span>${sweeping?'Your wallet receives':'Recipient receives'}</span><strong>${T.format(p.amount)} ${ticker}</strong></div><div class="detail-row"><span>${sweeping?'Estimated network fee (included)':'Network fee (included)'}</span><strong>${T.format(p.fee)} ${ticker}</strong></div><div class="detail-row"><span>Total deducted</span><strong>${T.format(p.amount+p.fee)} ${ticker}</strong></div><div class="detail-row"><span>Change returned</span><strong>${T.format(p.change)} ${ticker}</strong></div>${p.change ? `<div class="detail-row"><span>Change address</span><code>${escape(p.changeAddress)}</code></div>` : ''}</div>
      <p class="subtle">${sweeping?'All source funds, minus the fee, go to your reviewed wallet address.':'Change returns to your first receiving address. This reuses an address.'} The review expires after 90 seconds.</p>
      <form id="broadcast-form" class="form-panel">${protectedWallet(envelope) ? '<label for="send-password">Wallet password</label><input id="send-password" type="password" required autocomplete="current-password">' : '<p class="notice">Password lock is off for this wallet.</p>'}<label class="check"><input id="send-ack" type="checkbox" required><span>${sweeping?'I checked the estimated fee and receiving address. Sweep into my wallet.':'I checked the address, network, amount and fee. Send this real test transaction.'}</span></label>${sweeping?'<p id="sweep-progress" class="notice" role="status" aria-live="polite" hidden></p>':''}${button('broadcast-send',sweeping?'Confirm sweep':'Confirm and send','primary wide')}<a class="text-button coin-empty-link" href="#wallet">Cancel</a></form>`;
    if(sendDraft.komodo){
      $('broadcast-form').insertAdjacentHTML('beforebegin','<p class="notice" id="komodo-review-warning">This empties the displayed old Komodo PEP address of the reviewed spendable funds, minus the fee. Your verified current SafeCore seed controls the recovered PEP. Do not reuse the Komodo seed or address. Other coins and HD accounts are not moved; keep the old backup until they are recovered.</p>');
      $('send-ack').nextElementSibling.textContent='I recognize my old Komodo PEP address, checked the destination and fee, and will use my verified SafeCore backup for the recovered funds. I will not reuse the old Komodo seed.';
    }
    $('broadcast-send').type = 'submit';
    $('broadcast-form').onsubmit = async event => {
      event.preventDefault(); if (busy || !sendDraft || !$('send-ack').checked) return;
      const token = generation, source = envelope, draft = sendDraft;
      const password = $('send-password')?.value || '';
      busy = true; clearError(); $('broadcast-send').disabled = true; $('broadcast-send').textContent = 'Checking and signing locally…';
      if(sweeping)sweepProgress('Rechecking the source balance and fee. Please do not close this page or submit again…');
      let attempted = null;
      const attemptKey = 'corevault.send-attempts.' + WalletLibrary.id(source);
      try {
        if(draft.komodo&&(p.coin!=='pep'||!komodoVerified()))throw Error('Komodo recovery is disabled or verification expired. Verify your new wallet backup again.');
        if (draft.walletId !== WalletLibrary.id(source) || Date.now()-p.createdAt > 90000 || !liveEnabled()) throw Error('Review expired or wallet changed. Build a fresh transaction.');
        const candidate = E.validateRecipe(ethers,await E.decrypt(crypto,source,password));
        if (token !== generation || source !== envelope) return;
        await N.checkInputs(p.coin,p.inputs);
        if (token !== generation || source !== envelope || !liveEnabled()) return;
        if (Date.now()-p.createdAt > 90000) throw Error('Review expired. Build a fresh transaction.');
        let signed;
        if(draft.sweep){
          const state=sweepState;if(!state?.key)throw Error('Sweep key cleared. Scan or enter it again.');
          const current=await N.sweepSource(p.coin,state.key.address,{compressed:state.key.compressed});
          if(token!==generation||source!==envelope||sweepState!==state||!state.key)return;
          const identity=items=>items.map(u=>u.txid+':'+u.pos+':'+u.value).sort().join('|');
          if(identity(current.utxos)!==identity(p.inputs))throw Error('Source outputs changed. Build a fresh sweep review.');
          if(T.sweepFee(p.estimatedBytes,current.snapshot.feeRate).requiredFee>p.fee)throw Error('The required network fee increased beyond the reviewed cushion. Build a fresh sweep review.');
          if(!receiveBooks[p.coin].view().pinned){
            sweepProgress('Verifying your receiving address. Please keep this page open…');
            await refreshLive(p.coin);
            if(token!==generation||source!==envelope||sweepState!==state||!state.key)return;
            if(!fresh(p.coin)||receiveBooks[p.coin].view().cursor!==state.destinationIndex)throw Error('Receiving address changed. Build a fresh sweep review.');
          }
          if(Date.now()-p.createdAt>90000)throw Error('Sweep review expired.');
          sweepProgress('Signing the sweep on this device. Please keep this page open…');
          await new Promise(resolve=>setTimeout(resolve,0));
          if(token!==generation||source!==envelope||sweepState!==state||!state.key)return;
          if(draft.komodo&&!komodoVerified())throw Error('Komodo verification expired or recovery was disabled.');
          signed=T.signSweep(p,state.key,candidate,state.destinationIndex);
        }else signed=T.sign(p,candidate);
        // Record before the broadcast. An uncertain response must never auto-retry.
        const outpoints = p.inputs.map(i=>i.txid+':'+i.pos);
        await withWalletLock(() => {
          if(draft.komodo&&!komodoVerified())throw Error('Komodo verification expired or recovery was disabled.');
          if (token !== generation || source !== envelope || localStorage.getItem(STORE) !== JSON.stringify(source) || !liveEnabled() || Date.now()-p.createdAt > 90000) throw Error('Wallet changed or review expired. Build a fresh transaction.');
          const attempts = sendAttempts();
          if (attempts.some(a=>a.coin===p.coin&&a.outpoints.some(o=>outpoints.includes(o)))) throw Error('These inputs already have a send attempt. Check its transaction ID before retrying.');
          const record = {txid:signed.txid,coin:p.coin,outpoints,at:Date.now(),status:'unknown'};
          if(!sweeping){
            const affected=new Set(p.inputs.map(i=>i.index));
            for(const account of receivePools[p.coin])if(account.address===p.destination||p.change>0n&&account.address===p.changeAddress)affected.add(account.index);
            record.refreshIndices=[...affected];record.balanceRefreshed=false;
          }
          localStorage.setItem(attemptKey,JSON.stringify([...attempts,record]));
          attempted = record;
        });
        if (token !== generation || source !== envelope || !liveEnabled() || draft.komodo&&!komodoVerified()) throw Error('Wallet or recovery settings changed before submission.');
        $('broadcast-send').textContent = 'Submitting signed transaction…';
        if(sweeping)sweepProgress('Submitting the sweep. Please do not close this page or submit again…');
        const txid = await N.client(p.coin).call('blockchain.transaction.broadcast',[signed.raw]);
        if (txid !== signed.txid) throw Error('Unexpected broadcast response. Check the recorded transaction ID before retrying.');
        attempted.status='submitted';
        await withWalletLock(() => {
          const records=JSON.parse(localStorage.getItem(attemptKey)||'[]');
          localStorage.setItem(attemptKey,JSON.stringify(records.map(a=>a.txid===txid?attempted:a)));
        });
        if (token === generation && source === envelope) {
          clearSweep();if(draft.komodo)clearKomodo();sendDraft = null; if(snapshots[p.coin])snapshots[p.coin].cached=true;
          if(sweeping)watchSweep(p.coin,txid,p.destination);
          else {$('main').innerHTML = title('Transaction submitted', 'Accepted by the node; confirmation is still pending.') + `<code id="submitted-txid" class="address">${txid}</code><a href="#activity" class="text-button">Check activity →</a>`;void checkSentBalances();}
        }
      } catch (e) {
        if (attempted && e instanceof N.RPCError) {
          // An explicit daemon rejection is different from an uncertain timeout.
          try { await withWalletLock(() => { const records=JSON.parse(localStorage.getItem(attemptKey)||'[]');localStorage.setItem(attemptKey,JSON.stringify(records.filter(a=>a.txid!==attempted.txid))); }); } catch (_) {}
        }
        if (token === generation) error(attempted && !(e instanceof N.RPCError) ? `Submission status is uncertain. Do not send again. Check transaction ${attempted.txid}.` : e.message);
      } finally {
        if(draft.sweep&&attempted){clearSweep();if(draft.komodo)clearKomodo();}
        if($('sweep-progress'))$('sweep-progress').hidden=true;
        busy = false;
        if ($('broadcast-send')) { $('broadcast-send').disabled = Boolean(attempted); $('broadcast-send').textContent = attempted ? 'Check transaction status before retrying' : sweeping?'Confirm sweep':'Confirm and send'; }
      }
    };
  }
  const title = (name, description, action = '') => `<div class="page-head"><div><p class="eyebrow">PEPECOIN + WHIPPET</p><h1>${name}</h1><p class="subtle">${description}</p></div>${action}</div>`;
  const protectionIcon = protectedMode => `<span id="seed-lock" class="seed-lock ${protectedMode ? 'protected' : 'unprotected'}" role="img" aria-label="${protectedMode ? 'Password protected' : 'No password protection'}" title="${protectedMode ? 'Password protected' : 'No password protection'}">${icon(protectedMode ? 'lock' : 'unlock')}</span>`;
  const button = (id, text, kind = '', glyph = '') => `<button id="${id}" class="${kind}"><span class="button-content">${glyph ? icon(glyph) : ''}${text}</span></button>`;
  const recoveryNotice = '<div class="notice">Your recovery phrase controls your funds. Keep a backup somewhere safe and never share it.</div>';
  function bindCoins() {
    document.querySelectorAll('[data-coin]').forEach(el => el.addEventListener('click', () => { receiveCoin = el.dataset.coin;const selector=document.querySelector('.wallet-coin-switch');if(selector)selector.open=false;render(); }));
  }
  function activityRows(coinFilter = null) {
    if (mode !== 'demo' && liveEnabled()) {
      const coins = coinFilter ? [coinFilter] : Object.keys(E.NETWORKS);
      let attempts;
      try { attempts = sendAttempts(); } catch (e) { return `<p class="notice">${escape(e.message)}</p>`; }
      return coins.map(coin => {
        const snap = snapshots[coin];
        // Reconcile saved sends against all history; limit only the rendered rows.
        const history = snap ? [...new Map(snap.rows.flatMap(r=>r.history).map(h=>[h.tx_hash,h])).values()].sort((a,b)=>(b.height>0?b.height:Infinity)-(a.height>0?a.height:Infinity)) : [];
        const seen = new Set(history.map(h=>h.tx_hash));
        const txLink=hash=>coin==='pep'&&/^[0-9a-f]{64}$/i.test(hash)?`<a href="https://pepecoinservice.org/explorer/tx/${hash.toLowerCase()}/" target="${window.SafeCorePlatform?'_self':'_blank'}" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="View Pepecoin transaction ${hash}"><code>${hash}</code></a>`:`<code>${escape(hash)}</code>`;
        const outstanding=attempts.filter(a=>a.coin===coin&&!seen.has(a.txid));
        const recorded = outstanding.map(a=>`<div class="live-tx">${txLink(a.txid)}<small>${a.status==='unknown' ? 'Submission uncertain — do not resend until checked.' : 'Submitted — awaiting appearance in server history.'}</small></div>`).join('');
        const rows=recorded+(snap ? (history.slice(0,30).map(h=>`<div class="live-tx">${txLink(h.tx_hash)}<small>${h.height>0 ? `${Math.max(0,snap.tip-h.height+1)} confirmations` : 'Pending'}</small></div>`).join('') || (!outstanding.length?'<p class="subtle">No transactions yet.</p>':'')) : `<p class="subtle">${networkErrors[coin] ? 'Unable to refresh. Try again shortly.' : 'Checking transactions…'}</p>`);
        return `<details class="activity-asset" data-activity-coin="${coin}"><summary class="coin-picker">${coinMark(coin)}<span>${E.NETWORKS[coin].name}<small>${E.NETWORKS[coin].ticker}</small></span><span class="picker-chevron" aria-hidden="true"></span></summary><div class="activity-list" tabindex="0" role="region" aria-label="${E.NETWORKS[coin].name} transaction history">${snap&&!fresh(coin)?`<p class="subtle">Last updated ${escape(new Date(snap.at).toLocaleString())}</p>`:''}${rows}</div></details>`;
      }).join('');
    }
    return `<div class="empty">${icon('activity')}<br>Your transactions will appear here.</div>`;
  }
  function overview() {
    const visible = visibleCoins();
    if (!visible.length) {
      $('main').innerHTML = '<p class="subtle">No coins shown. Your wallet and recovery data are unchanged.</p><a class="text-button coin-empty-link" href="#coins">Add coins →</a>';
      return;
    }
    const valuation=WalletReporting.worth(Object.fromEntries(Object.keys(E.NETWORKS).map(c=>[c,reported(c)])),priceFresh()?pepPrice.value:null,priceFresh()?pepPrice.usdt:null);
    const worth=valuation.value===null?'*':valuation.value>0&&valuation.value<0.01?'<0.01':new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(valuation.value);
    const heading = `<div class="page-head home-heading"><section class="wallet-worth" aria-label="Estimated wallet value"><small>Wallet value</small><div id="wallet-worth">${valuation.value!==null?'≈ ':''}${escape(worth)} <span>USDT${valuation.incomplete&&valuation.value!==null?'*':''}</span></div></section><a class="text-button" href="#coins">Add coins +</a></div>`;
    const rescanControl=mode==='unlocked'?`<div class="overview-actions"><button id="rescan" class="primary overview-rescan" ${rescanning?'disabled':''}>${rescanning?'Rescanning…':'Rescan'}</button></div>`:'';
    const usd=value=>value>0&&value<0.01?'<$0.01':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
    const holdings=`<section class="holdings" aria-label="Coin balances"><h2>Your coins</h2>${visible.map(coin=>{
      const n=COINS[coin],s=reported(coin),total=s?s.confirmed+s.unconfirmed:null;
      const priced=coin==='pep'&&priceFresh();
      const price=priced?'$'+pepPrice.value.toFixed(8).replace(/0+$/,'').replace(/\.$/,''):'*';
      const value=priced&&total!==null?usd(Number(total)/1e8*pepPrice.value):'*';
      const status=s?`${!fresh(coin)?'Last known · ':''}Updated ${escape(new Date(s.at).toLocaleString())}${s.unconfirmed?` · Pending ${T.format(s.unconfirmed)} ${n.ticker}`:''}${networkErrors[coin]?' · Unable to refresh':''}`:n.comingSoon?'':!envelope?'Create a wallet to get started.':mode==='locked'?'Open wallet to refresh.':'Checking balance…';
      return `<button type="button" class="holding-row" data-overview-coin="${coin}" aria-label="${n.comingSoon?n.name+' coming soon':'Receive '+n.name}" ${n.comingSoon?'disabled':''}>${coinMark(coin)}<span class="holding-name"><strong>${n.name}</strong><small>${n.comingSoon?'Coming soon':price}</small><small class="holding-status">${status}</small></span><span class="holding-values"><strong class="holding-balance">${total!==null?T.format(total):'*'} <small>${n.ticker}</small></strong><small>${n.comingSoon?'*':value}</small></span></button>`;
    }).join('')}<p class="subtle holdings-note">* Price not available</p></section>`;
    const full=Object.keys(E.NETWORKS).filter(c=>receiveBooks?.[c]?.view().exhausted);
    $('main').innerHTML = heading + full.map(c=>`<p class="notice">${E.NETWORKS[c].ticker} wallet addresses are full (200 used). Existing addresses still receive funds. Create another wallet for new addresses.</p>`).join('') + holdings + rescanControl + (mode === 'demo' ? button('security-cta','Create or restore a wallet','wide home-security','plus') : '');
    if($('rescan'))$('rescan').onclick=async()=>{
      if(rescanning)return;rescanning=true;const epoch=networkEpoch;clearError();overview();
      try{let complete=true;for(const coin of Object.keys(E.NETWORKS)){if(epoch!==networkEpoch)return;const before=fullScanCompletions[coin]||0;await refreshLive(coin,true);if((fullScanCompletions[coin]||0)===before)complete=false;}if(epoch===networkEpoch)toast(!complete||Object.keys(networkErrors).length?'Rescan incomplete. Check your connection and try again.':'Rescan complete: checked 200 addresses per asset.');}
      finally{if(epoch===networkEpoch){rescanning=false;if(['','#wallet'].includes(location.hash))render();}}
    };
    document.querySelectorAll('[data-overview-coin]').forEach(el=>el.onclick=()=>{
      if(!E.NETWORKS[el.dataset.overviewCoin])return;
      receiveCoin=el.dataset.overviewCoin;go('receive');
    });
    if ($('security-cta')) $('security-cta').onclick = () => go('setup');
  }
  function coins() {
    $('main').innerHTML = `<div class="page-head"><h1>Coins</h1><a class="text-button" href="#wallet">Done</a></div>
      <label class="coin-search-label" for="coin-search">Find a coin</label><input id="coin-search" type="search" placeholder="Search name or symbol" autocomplete="off" maxlength="80">
      <p class="subtle coin-help">Show or hide coins on your home screen. Your keys and addresses stay unchanged.</p>
      <div id="coin-results"></div><p id="coin-result-count" class="subtle" role="status" aria-live="polite"></p>
      <p class="subtle coin-help">Coming-soon coins are display previews only, not usable wallets.</p>`;
    function results() {
      const query = $('coin-search').value.trim().toLowerCase();
      const matches = Object.entries(COINS).filter(([,n]) => `${n.name} ${n.ticker}`.toLowerCase().includes(query));
      $('coin-results').innerHTML = matches.map(([coin,n]) => `<div class="coin-row">
        <button class="coin-choice" data-select-coin="${coin}" aria-label="Select ${n.name}">${coinMark(coin)}<span>${n.name}<small>${n.ticker}${n.comingSoon ? ' · Coming soon' : ''}</small></span></button>
        <label class="coin-visibility"><input type="checkbox" data-show-coin="${coin}" ${hiddenCoins.includes(coin) ? '' : 'checked'}><span>Show ${n.name} on home</span></label></div>`).join('');
      $('coin-result-count').textContent = matches.length ? `${matches.length} coin${matches.length === 1 ? '' : 's'}` : 'No coins match your search.';
      document.querySelectorAll('[data-show-coin]').forEach(el => el.onchange = () => {
        const coin = el.dataset.showCoin;
        const next = el.checked ? hiddenCoins.filter(c => c !== coin) : [...hiddenCoins, coin];
        try { localStorage.setItem(COIN_PREFS, JSON.stringify(next)); hiddenCoins = next; results(); document.querySelector(`[data-show-coin="${coin}"]`).focus(); }
        catch (_) { el.checked = !el.checked; error('Could not save coin visibility on this browser.'); }
      });
      document.querySelectorAll('[data-select-coin]').forEach(el => el.onclick = () => {
        const coin = el.dataset.selectCoin;
        try {
          const next = hiddenCoins.filter(c => c !== coin);
          localStorage.setItem(COIN_PREFS, JSON.stringify(next)); hiddenCoins = next;
          go('wallet');
        } catch (_) { error('Could not save coin visibility on this browser.'); }
      });
    }
    $('coin-search').oninput = results;
    results();
  }
  function receive() {
    const pickerOpen=Boolean($('receive-coin')?.parentElement.open);
    const visible = visibleCoins().filter(coin => E.NETWORKS[coin]);
    if (!visible.length) {
      $('main').innerHTML = '<div class="page-head"><h1>Receive</h1></div><a class="text-button" href="#coins">Add coins →</a>'; return;
    }
    if (!visible.includes(receiveCoin)) receiveCoin = null;
    const coin = receiveCoin, n = COINS[coin];
    const selector = `<details class="wallet-coin-switch" ${pickerOpen?'open':''}><summary id="receive-coin" class="coin-picker" aria-label="Choose receiving coin">${coin ? coinMark(coin) : ''}<span>${n ? n.name : 'Choose an asset'}<small>${n ? n.ticker : 'Select the coin you want to receive'}</small></span><span class="picker-chevron" aria-hidden="true"></span></summary><div class="wallet-coin-options">${visible.map(coin => `<button data-coin="${coin}">${coinMark(coin)}<span>${COINS[coin].name}<small>${COINS[coin].ticker}</small></span></button>`).join('')}</div></details>`;
    if (!coin) {
      $('main').innerHTML = '<div class="page-head"><h1>Receive</h1></div>' + selector;
      bindCoins(); return;
    }
    const book = receiveBooks?.[coin], view = book?.view();
    const waitingLive = liveEnabled() && mode === 'unlocked' && !fresh(coin);
    const account = view && !waitingLive && !(view.exhausted && view.automatic) ? view.account : null;
    $('main').innerHTML = '<div class="page-head"><h1>Receive</h1></div>' + selector +
      `<section class="receive-card"><div class="address-navigation">${button('previous-address','← Previous','text-button')}<span id="address-number">Address #${(view?.index || 0) + 1}</span>${button('next-address','Next →','text-button')}</div>
      <div id="qr" class="qr">${account ? '' : `<div class="qr-empty">${icon('lock')}<span>${waitingLive ? escape(networkErrors[coin] || 'Checking receiving-address history…') : view?.exhausted ? 'Wallet addresses are full (200 used). Existing addresses still work.' : mode === 'locked' ? 'Open your wallet to see its address' : 'Create or restore a wallet first'}</span></div>`}</div>
      ${account ? `<code class="address" id="address">${escape(account.address)}</code>${button('copy-address','Copy address','wide','copy')}` : `<h2>No payment address yet</h2>${view?.exhausted || waitingLive ? '' : button('receive-setup',mode === 'locked' ? 'Open wallet' : 'Create or restore','primary')}`}
      </section><label class="check reuse-check"><input id="reuse-first" type="checkbox" ${view?.pinned ? 'checked' : ''} ${!book ? 'disabled' : ''}><span><strong>Keep using the first address</strong><small>Use the same receiving address until you uncheck this.</small></span></label>
      ${view?.browsing ? button('latest-address','Return to current address','text-button') : ''}
      <p class="subtle">${view?.pinned ? 'Receiving is locked to Address #1 until you uncheck this.' : 'A new address becomes available after a payment arrives. Previous addresses still work.'}</p>${view?.exhausted?'<p class="notice">Wallet addresses are full (200 used). You can keep receiving at existing addresses, or create another wallet.</p>':''}${mode==='unlocked'?button('sweep-open','Sweep private key','wide'):''}`;
    bindCoins();
    if($('sweep-open'))$('sweep-open').onclick=()=>go('sweep');
    $('previous-address').disabled = !view?.canPrevious;
    $('next-address').disabled = !view?.canNext;
    function update(action) {
      action();
      try { localStorage.setItem('corevault.receive.' + WalletLibrary.id(envelope), JSON.stringify(Object.fromEntries(Object.entries(receiveBooks).map(([coin,b]) => [coin,b.preferences()])))); }
      catch (_) { error('Address preference could not be saved.'); }
      receive();
    }
    $('previous-address').onclick = () => update(() => book.previous());
    $('next-address').onclick = () => update(() => book.next());
    $('reuse-first').onchange = event => update(() => book.pin(event.target.checked));
    if ($('latest-address')) $('latest-address').onclick = () => update(() => book.latest());
    if (account) {
      new QRCode($('qr'), { text: account.address, width:184, height:184, colorDark:'#0b1724', colorLight:'#ffffff', correctLevel: QRCode.CorrectLevel.M });
      $('copy-address').onclick = async () => {
        try { if(window.SafeCorePlatform)await SafeCorePlatform.copyAddress(account.address);else await navigator.clipboard.writeText(account.address); toast('Address copied.'); }
        catch (_) { error('Clipboard access was denied. Select the address to copy it manually.'); }
      };
    } else if ($('receive-setup')) $('receive-setup').onclick = () => go(mode === 'locked' ? 'unlock' : 'setup');
  }
  function activity() {
    const previous=Object.fromEntries([...document.querySelectorAll('[data-activity-coin]')].map(el=>[el.dataset.activityCoin,{open:el.open,scroll:el.querySelector('.activity-list').scrollTop}]));
    $('main').innerHTML = '<div class="page-head"><h1>Activity</h1></div>' + activityRows();
    document.querySelectorAll('[data-activity-coin]').forEach(el=>{
      const state=previous[el.dataset.activityCoin];if(!state)return;
      el.open=state.open;el.querySelector('.activity-list').scrollTop=state.scroll;
    });
  }
  function security() {
    const exists = Boolean(envelope);
    const protectedMode = protectedWallet(envelope);
    $('main').innerHTML = title('Security & recovery', 'Protection is saved separately for each wallet.', protectionIcon(protectedMode)) +
      `<label class="theme-control" for="theme-choice">Appearance<select id="theme-choice"><option value="dark">Dark</option><option value="light">Light</option></select></label>` +
      `<div class="receive-layout"><section class="panel"><h2>${exists ? protectedMode ? 'Password lock is on' : 'Password lock is off' : 'No wallet saved yet'}</h2><p class="subtle">${exists ? protectedMode ? 'This wallet is encrypted. Its password is required each time you reveal the recovery phrase, even when the wallet is open.' : 'This wallet is stored without encryption. Anyone with access to this browser profile can read its seed. Hiding the screen is not password protection.' : 'Create or restore a development wallet to begin.'}</p><ul class="facts"><li>${icon('check')}Recovery words hide when the app is backgrounded.</li><li>${icon('check')}Live mode sends public address data and signed transactions only. No seed, private key or password is sent.</li></ul>
      <div class="settings-actions">${exists ? button('show-seed','View recovery phrase','','shield') + button('export',protectedMode ? 'Export encrypted backup' : 'Export unprotected backup','','receive') + (protectedMode ? button('unlock-security',mode === 'locked' ? 'Unlock wallet' : 'Lock wallet','','lock') : '') : button('setup-security','Create or restore','primary')}</div>
      </section>
      <section class="panel"><h2>Wallet settings</h2><p class="inline-info">Keep your recovery phrase safe. Clearing browser data removes wallets saved on this device.</p>${exists ? button('remove-start','Remove local wallet','danger space-top') : ''}${['localhost','127.0.0.1'].includes(location.hostname)&&location.port==='8787'?'<a href="#reset-tests" class="text-button coin-empty-link">Reset all local test data</a>':''}</section></div>`;
    if (exists) {
      $('remove-start').parentElement.insertAdjacentHTML('afterbegin',`<label class="check"><input id="komodo-recovery-enabled" type="checkbox" ${komodoEnabled()?'checked':''} ${mode!=='unlocked'?'disabled':''}><span><strong>Komodo recovery (Pepecoin only)</strong><small>Off by default. Show Komodo Sweep below Sweep private key. Requires verification of this wallet’s recovery backup.</small></span></label>`);
      $('komodo-recovery-enabled').onchange=event=>{
        try{if(event.target.checked)localStorage.setItem(komodoPreference(),'true');else localStorage.removeItem(komodoPreference());clearKomodo();toast(event.target.checked?'Komodo Sweep enabled for this wallet’s Pepecoin.':'Komodo recovery disabled.');}
        catch(_){event.target.checked=komodoEnabled();error('Could not save the recovery setting.');}
      };
      $('export').onclick = exportBackup;
      $('show-seed').onclick = () => go('reveal');
      if($('unlock-security'))$('unlock-security').onclick = () => mode === 'locked' ? go('unlock') : lock('Wallet locked.');
    $('remove-start').onclick = () => {deleteTarget=WalletLibrary.id(envelope);go('remove');};
    } else $('setup-security').onclick = () => go('setup');
    $('theme-choice').value = document.documentElement.dataset.theme || 'dark';
    $('theme-choice').onchange = event => { const theme = event.target.value; document.documentElement.dataset.theme = theme; try { localStorage.setItem('corevault.theme',theme); } catch (_) { error('Theme changed, but could not be saved.'); } };
  }
  function iconGallery(choice=savedBrand()){
    applyBrand(choice);
    const tile=(name,i)=>`<button class="brand-option" data-brand="${i+1}" aria-label="Preview ${name}" aria-pressed="${choice===i+1}"><img src="${brandPath(i+1)}" alt=""><span><small>${String(i+1).padStart(2,'0')}</small>${name}</span></button>`;
    const groups=[['Nodes & networks · New',20,30],['Coins & crypto',10,20],['Original designs',0,10]].map(([label,start,end])=>`<h2>${label}</h2><div class="brand-grid" aria-label="${label}">${BRAND_ICONS.slice(start,end).map((name,i)=>tile(name,i+start)).join('')}</div>`).join('');
    $('main').innerHTML=title('Choose your icon',`${BRAND_ICONS.length} SafeCore designs. Tap one to preview it in the header.`)+
      `<div class="brand-preview"><img src="${brandPath(choice)}" alt="${escape(choice?BRAND_ICONS[choice-1]:'Original')} icon preview"><div><strong>SafeCore</strong><p class="subtle">${choice?`${String(choice).padStart(2,'0')} · ${BRAND_ICONS[choice-1]}`:'Original icon'}</p></div></div><div class="form-actions">${button('save-brand','Use this icon','primary')}<a href="#security" class="text-button">Cancel</a></div>${groups}${button('original-brand','Restore original icon','text-button')}`;
    document.querySelectorAll('[data-brand]').forEach(el=>el.onclick=()=>iconGallery(Number(el.dataset.brand)));
    $('original-brand').onclick=()=>iconGallery(0);
    $('save-brand').onclick=()=>{try{localStorage.setItem(BRAND_PREF,String(choice));go('wallet');toast('Icon updated.');}catch(_){error('Could not save the icon. Your previous choice is unchanged.');}};
  }
  async function exportBackup(confirmed = false) {
    if (!envelope) return;
    if (!protectedWallet(envelope) && confirmed !== true) { go('export'); return; }
    if(window.SafeCorePlatform){
      try{await SafeCorePlatform.exportBackup(JSON.stringify(envelope,null,2)+'\n');toast('Backup saved. Keep it private and safe.');}
      catch(e){error(e.message);}
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(envelope, null, 2) + '\n'], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = protectedWallet(envelope) ? 'safecore-encrypted-backup.json' : 'safecore-UNPROTECTED-backup.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(protectedWallet(envelope) ? 'Encrypted backup exported. Keep its password safe.' : 'Unprotected backup exported. Anyone with this file can read the seed.');
  }
  function exportConfirm() {
    if (!envelope) { go('wallets'); return; }
    $('main').innerHTML = title('Export unprotected backup', 'This file contains your recovery phrase in readable form.', protectionIcon(false)) + '<p class="notice">Anyone with this file can recover the wallet. Keep it private and offline. Never share it in chat.</p>' + button('confirm-export','Download unprotected backup','danger') + '<a class="text-button coin-empty-link" href="#security">Cancel</a>';
    $('confirm-export').onclick = () => exportBackup(true);
  }
  function wallets() {
    let entries;
    try { entries = library.list(); }
    catch (e) { $('main').innerHTML = title('Wallet list needs attention','Saved data has not been overwritten.'); error(e.message); return; }
    const activeId = envelope ? WalletLibrary.id(envelope) : null;
    $('main').innerHTML = title('Your wallets', 'Switch wallets to see their accounts or recovery phrase.') +
      `<div class="wallet-list">${entries.map(item => `<div class="saved-wallet"><div>${icon(protectedWallet(item.vault) ? 'lock' : 'unlock')}<strong>${escape(item.name)}</strong><small>${protectedWallet(item.vault) ? 'Password protected' : 'No password protection'}</small></div><span class="wallet-actions"><button data-open-wallet="${item.id}" class="text-button" ${item.id === activeId ? 'disabled' : ''}>${item.id === activeId ? 'Current' : 'Open'}</button><button data-delete-wallet="${item.id}" class="text-button wallet-delete">Delete</button></span></div>`).join('') || '<p class="subtle">No wallets saved yet.</p>'}</div>
      ${button('add-wallet','Create or restore another wallet','wide home-security','plus')}
      ${activeId ? '<form id="rename-wallet" class="form-panel"><label for="current-wallet-name">Current wallet name</label><input id="current-wallet-name" maxlength="50" required><button class="text-button" type="submit">Save name</button></form>' + button('wallet-seed','View current recovery phrase','text-button','shield') : ''}
      <p class="subtle">Only wallets saved in this browser are listed. Deleted seeds cannot be recovered without a backup. Back up each wallet separately.</p>`;
    $('add-wallet').onclick = () => { addingWallet = true; setupType = 'create'; go('setup'); };
    document.querySelectorAll('[data-delete-wallet]').forEach(el=>el.onclick=()=>{deleteTarget=el.dataset.deleteWallet;go('remove');});
    document.querySelectorAll('[data-open-wallet]').forEach(el => el.onclick = async () => {
      try {
        await withWalletLock(() => {
          const next = library.activate(el.dataset.openWallet);
          generation++; pending = null; revealed = false; receiveBooks = null;
          clearReports();
          N.close();networkEpoch++;receivePools=null;snapshots={};networkErrors={};scans={};lastRefresh={};sendDraft=null;
          envelope = next; mode = 'locked'; openUnprotected();
        });
        resetIdle(); go(mode === 'locked' ? 'unlock' : 'wallet');
      } catch (e) { error(e.message); }
    });
    if (activeId) {
      $('current-wallet-name').value = entries.find(item => item.id === activeId)?.name || 'My wallet';
      $('rename-wallet').onsubmit = async event => { event.preventDefault(); const name = $('current-wallet-name').value; try { await withWalletLock(() => library.rename(activeId,name)); wallets(); toast('Wallet renamed.'); } catch (e) { error(e.message); } };
      $('wallet-seed').onclick = () => go('reveal');
    }
  }
  function reveal() {
    if (!envelope) { go('wallets'); return; }
    const needsPassword = protectedWallet(envelope);
    revealed = false;
    $('main').innerHTML = title('Recovery phrase', 'Keep these words private. Anyone with them can recover this wallet.', protectionIcon(needsPassword)) +
      `<form id="reveal-form" class="form-panel">${needsPassword ? '<label for="seed-password">Wallet password</label><input id="seed-password" type="password" required autocomplete="current-password"><p class="subtle">Required every time you view this wallet’s seed.</p>' : '<p class="notice">This wallet has no password protection. Make sure nobody can see your screen.</p>'}${button('reveal-seed','Show recovery phrase','primary')}</form>`;
    $('reveal-seed').type = 'submit';
    $('reveal-form').onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      const token = generation, source = envelope;
      busy = true; clearError(); $('reveal-seed').disabled = true;
      try {
        const candidate = E.validateRecipe(ethers, await E.decrypt(crypto, source, needsPassword ? $('seed-password').value : ''));
        if (token !== generation || source !== envelope) return;
        revealed = true;
        $('reveal-form').outerHTML = `<section class="seed-display"><div id="revealed-words" class="word-grid">${candidate.mnemonic.split(' ').map((word,i) => `<div class="word"><span>${i+1}</span>${escape(word)}</div>`).join('')}</div>${candidate.passphrase ? `<p class="notice">This wallet also needs its exact BIP39 passphrase:</p><pre id="revealed-passphrase">${escape(candidate.passphrase)}</pre>` : ''}${button('hide-seed','Hide recovery phrase','wide')}</section>`;
        $('hide-seed').onclick = () => { revealed = false; go('security'); }; resetIdle();
      } catch (e) { if (token === generation) error(e.message); }
      finally { busy = false; if ($('reveal-seed')) $('reveal-seed').disabled = false; }
    };
  }
  function setup() {
    if ((envelope && !addingWallet) || mode === 'storage-error') { go('security'); return; }
    $('main').innerHTML = title('Create or restore', 'Your recovery phrase belongs to this wallet.', protectionIcon(false)) +
      `<section class="panel form-panel">${recoveryNotice}<div class="tabs"><button data-setup="create" class="${setupType === 'create' ? 'selected wht' : ''}">Create new</button><button data-setup="import" class="${setupType === 'import' ? 'selected wht' : ''}">Restore</button></div><form id="setup-form" autocomplete="off">
      <label for="wallet-name">Wallet name</label><input id="wallet-name" maxlength="50" placeholder="My wallet">
      ${setupType === 'create' ? '<label for="words">Recovery phrase length</label><select id="words"><option value="12">12 words</option><option value="24">24 words</option></select>' : '<label for="phrase">Recovery phrase</label><textarea id="phrase" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" aria-describedby="phrase-status" placeholder="Start typing your recovery words"></textarea><div id="phrase-suggestions" class="recovery-suggestions" role="group" aria-label="Recovery word suggestions" hidden></div><p id="phrase-status" class="inline-info" aria-live="polite"></p><small>Or import your wallet backup file.</small><label for="backup-file">Backup file (optional)</label><input id="backup-file" type="file" accept=".json,application/json"><p id="file-status" class="inline-info"></p>'}
      <label class="check"><input id="use-passphrase" type="checkbox"><span>Extra seed passphrase (advanced)</span></label><div id="passphrase-fields" hidden><label for="passphrase">BIP39 passphrase</label><input id="passphrase" type="password" autocomplete="off"><small>This changes your addresses. Losing it can mean losing your coins. It is not the app password.</small></div>
      <label class="check"><input id="password-lock" type="checkbox"><span>Password lock (optional)</span></label><div id="password-fields" hidden><label for="password">Wallet password</label><input id="password" type="password" minlength="12" autocomplete="new-password"><small>At least 12 characters. Required to open this wallet or reveal its recovery phrase.</small><label for="confirm">Confirm password</label><input id="confirm" type="password" minlength="12" autocomplete="new-password"></div>
      <p id="protection-notice" class="inline-info">Password lock is off. This wallet and its backups will contain an unencrypted recovery phrase. Anyone with access to this browser profile can read it.</p>
      ${setupType==='create'?'<label class="check"><input id="ack" type="checkbox" required><span>I understand that losing my recovery phrase may mean losing access to my funds.</span></label>':''}
      <div class="form-actions">${button('cancel-setup','Cancel')}${button('submit-setup',setupType === 'create' ? 'Create wallet' : 'Restore wallet','primary')}</div></form></section>`;
    document.querySelectorAll('[data-setup]').forEach(el => el.onclick = () => { generation++; busy = false; setupType = el.dataset.setup; stagedFile = null; clearError(); setup(); });
    $('cancel-setup').type = 'button'; $('cancel-setup').onclick = () => go('wallet');
    $('submit-setup').type = 'submit';
    const recovery=$('phrase')?WalletRecovery.attach(ethers,{input:$('phrase'),list:$('phrase-suggestions'),status:$('phrase-status'),onValidity:valid=>{$('submit-setup').disabled=busy||(!stagedFile&&!valid);}}):null;
    function syncProtection() {
      const enabled = $('password-lock').checked;
      $('password-fields').hidden = !enabled;
      $('password').required = enabled; $('confirm').required = enabled;
      if (!enabled) { $('password').value = ''; $('confirm').value = ''; }
      $('seed-lock').outerHTML = protectionIcon(enabled);
      $('protection-notice').textContent = enabled ? 'This wallet will be encrypted. Save its recovery phrase separately: the app password cannot recover a lost backup.' : 'Password lock is off. This wallet and its backups will contain an unencrypted recovery phrase. Anyone with access to this browser profile can read it.';
    }
    $('password-lock').onchange = syncProtection;
    $('use-passphrase').onchange = () => { $('passphrase-fields').hidden = !$('use-passphrase').checked; if (!$('use-passphrase').checked) $('passphrase').value = ''; };
    if ($('backup-file')) $('backup-file').onchange = async event => {
      const token = ++generation;
      try {
        stagedFile = null; clearError();
        $('password-lock').disabled = false;
        $('phrase').value = ''; $('passphrase').value = '';
        $('phrase').disabled = false; $('passphrase').disabled = false;
        $('file-status').textContent = '';
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 1000000) throw new Error('Backup is too large (maximum 1 MB).');
        const data = JSON.parse(await file.text());
        if (token !== generation || !$('file-status')) return;
        if (data.format === E.FORMAT || data.format === E.OPEN_FORMAT) {
          if(data.format===E.OPEN_FORMAT)E.validateRecipe(ethers,data.recipe);
          stagedFile = E.validateEnvelope(data);
          const protectedSource = protectedWallet(stagedFile);
          $('password-lock').checked = protectedSource; $('password-lock').disabled = protectedSource; syncProtection();
          $('file-status').textContent = protectedSource ? 'Encrypted backup selected. Its password protection will be preserved.' : 'Unprotected backup selected. You can optionally enable Password lock.';
          $('phrase').value = ''; $('phrase').disabled = true; $('passphrase').value = ''; $('passphrase').disabled = true;
        } else {
          const bundle = WhippetWallet.restore(ethers, data);
          $('phrase').value = bundle.mnemonic; $('passphrase').value = bundle.passphrase;
          $('use-passphrase').checked = Boolean(bundle.passphrase); $('passphrase-fields').hidden = !bundle.passphrase;
          $('phrase').disabled = false; $('passphrase').disabled = false;
          $('file-status').textContent = 'Original Whippet backup verified. Its recovery path is preserved; receiving starts at the first address.';
        }
      } catch (e) {
        stagedFile = null;
        if ($('file-status')) { $('file-status').textContent = ''; $('phrase').disabled = false; $('passphrase').disabled = false; }
        error(e.message);
      } finally {if(token===generation&&$('phrase'))recovery?.refresh();}
    };
    $('setup-form').onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      const token = generation; clearError();
      try {
        const usePassword = $('password-lock').checked;
        const password = usePassword ? $('password').value : '';
        if (usePassword && password.length < 12) throw new Error('Use a wallet password of at least 12 characters.');
        if (usePassword && password !== $('confirm').value) throw new Error('The wallet passwords do not match.');
        if (setupType==='create'&&!$('ack').checked) throw new Error('Please acknowledge the importance of keeping your recovery phrase safe.');
        if(setupType==='import'&&!stagedFile&&!recovery.valid())throw new Error('Check the spelling, order and number of your recovery words before restoring.');
        busy = true; $('submit-setup').disabled = true; $('submit-setup').textContent = 'Preparing locally…';
        let candidate;
        if (stagedFile) candidate = E.validateRecipe(ethers, await E.decrypt(crypto, stagedFile, password));
        else candidate = E.recipe(ethers, setupType === 'create' ? E.createPhrase(ethers, crypto, Number($('words').value)) : $('phrase').value, $('passphrase').value);
        const sealed = usePassword ? await E.encrypt(crypto, candidate, password) : E.unprotected(crypto, candidate);
        if (token !== generation) return;
        if (setupType === 'create') {
          await persist(candidate, sealed, $('wallet-name').value, token);
          if(token !== generation || envelope !== sealed)return;
          // Only reveal a generated phrase after its durable wallet record exists.
          // Navigation may discard this temporary display state, not the wallet.
          pending = { candidate, sealed }; location.hash = 'backup'; resetIdle();
        } else { await persist(candidate, sealed, $('wallet-name').value, token); go('wallet'); toast('Wallet restored.'); }
      } catch (e) { if (token === generation) error(e.message); }
      finally { busy = false; if ($('submit-setup')) { $('submit-setup').disabled = false; $('submit-setup').textContent = setupType === 'create' ? 'Create wallet' : 'Restore wallet'; recovery?.refresh(); } }
    };
  }
  async function persist(candidate, sealed, name, token = generation) {
    await withWalletLock(() => {
      if (token !== generation) throw new Error('Wallet changed or was closed. Please try again.');
      if (JSON.stringify(library.active()) !== JSON.stringify(envelope)) throw new Error('Another tab changed the active wallet. Reload before saving.');
      library.save(sealed, name);
      envelope = sealed; prepareAddresses(candidate, sealed); pending = null; stagedFile = null; addingWallet = false;
      mode = 'unlocked'; resetIdle();
    });
  }
  function backup() {
    if (!pending) { go('wallet'); return; }
    $('main').innerHTML = title('Write down your recovery phrase', 'Keep the words in order. Never share them.', protectionIcon(protectedWallet(pending.sealed))) +
      `<section class="panel form-panel"><p class="notice" id="wallet-saved">Your wallet is saved on this device. You can view these words again in Security → View recovery phrase.</p><p class="subtle">Keep a separate backup of these words. You will need it if this device is lost or its browser data is cleared.</p><div class="word-grid" id="recovery-words">${pending.candidate.mnemonic.split(' ').map((word,i) => `<div class="word"><span>${i+1}</span>${escape(word)}</div>`).join('')}</div>
      ${pending.candidate.passphrase ? '<div class="notice">A BIP39 passphrase is set. Keep it with your recovery instructions; these words alone will recover different addresses.</div>' : ''}
      <div class="form-actions">${button('finish','Continue to wallet','primary wide')}</div></section>`;
    $('finish').onclick = () => { pending = null; go('wallet'); };
  }
  function unlock() {
    if (!envelope) { go('setup'); return; }
    if (mode === 'unlocked') { go('wallet'); return; }
    if (!protectedWallet(envelope)) {
      $('main').innerHTML = title('Open your wallet', 'Password lock is off for this wallet.', protectionIcon(false)) + button('open-wallet','Open wallet','primary');
      $('open-wallet').onclick = () => { try { openUnprotected(); resetIdle(); go('wallet'); } catch (e) { error(e.message); } }; return;
    }
    $('main').innerHTML = title('Welcome back', 'Unlock your local development wallet.') + `<section class="panel form-panel"><div class="security-icon">${icon('lock')}</div><h2>Your keys are locked</h2><p class="subtle">Enter the password you used to encrypt this wallet. Nothing is sent to a server.</p><form id="unlock-form"><label for="unlock-password">Wallet password</label><input id="unlock-password" type="password" required autocomplete="current-password"><div class="form-actions">${button('unlock-submit','Unlock wallet','primary')}</div></form></section>`;
    $('unlock-submit').type = 'submit';
    $('unlock-form').onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      const token = generation; clearError(); busy = true; $('unlock-submit').disabled = true;
      try {
        const candidate = E.validateRecipe(ethers, await E.decrypt(crypto, envelope, $('unlock-password').value));
        if (token !== generation) return;
        prepareAddresses(candidate, envelope); mode = 'unlocked'; resetIdle(); go('wallet');
      } catch (e) { if (token === generation) error(e.message); }
      finally { busy = false; if ($('unlock-submit')) $('unlock-submit').disabled = false; }
    };
  }
  function resetTests(){
    if(!['localhost','127.0.0.1'].includes(location.hostname)||location.port!=='8787'){go('security');return;}
    $('main').innerHTML=title('Reset local test data','Start fresh in this browser.')+
      '<p class="notice">This removes all SafeCore wallets, locally saved recovery phrases, balances, history caches and settings from this browser. It does not move funds, delete your exported backups or change any server database.</p><label class="check"><input id="reset-backup" type="checkbox"><span>I have backed up any wallets with remaining funds.</span></label>'+button('reset-tests-confirm','Reset all local test data','danger wide')+'<a href="#security" class="text-button">Cancel</a>';
    $('reset-tests-confirm').onclick=async()=>{
      if(!$('reset-backup').checked){error('Confirm your backups before resetting.');return;}
      try{
        await withWalletLock(()=>{
          const exact=[STORE,'corevault.wallets.v1','corevault.hidden-coins.v1','corevault.theme','corevault.icon.v1',BRAND_PREF];
          const prefixes=['corevault.balance.','corevault.receive.','corevault.send-attempts.','corevault.live.','corevault.komodo-recovery.'];
          const keys=Object.keys(localStorage).filter(k=>exact.includes(k)||prefixes.some(p=>k.startsWith(p)));
          for(const key of keys)localStorage.removeItem(key);
          envelope=null;mode='demo';lock();loadCoinPrefs();document.documentElement.dataset.theme='dark';
        });
        go('wallet');toast('Local test data removed. Restore a backup to recover an old wallet.');
      }catch(_){error('Reset could not finish. Some local data may remain; check saved wallets before testing again.');}
    };
  }
  function remove() {
    const storageFailure=mode==='storage-error';
    const target=deleteTarget||(envelope?WalletLibrary.id(envelope):null);
    let item;
    try{if(!storageFailure)item=library.list().find(w=>w.id===target);}catch(e){error(e.message);return;}
    if(!item&&!storageFailure){deleteTarget=null;go('wallets');return;}
    const isActive=Boolean(envelope&&target===WalletLibrary.id(envelope));
    $('main').innerHTML = title('Delete wallet', 'This cannot be undone without your recovery phrase or backup.') +
      `<section class="panel form-panel"><div class="notice">${item?`Delete <strong>${escape(item.name)}</strong> from this device? Its saved recovery phrase and local history will be removed. Other wallets and on-chain funds are not changed.`:'The saved vault could not be parsed. Export the original data before removing it.'}</div>${isActive ? button('backup-before-remove','Export this wallet first','wide') : ''}<label for="delete-confirm">Type REMOVE to confirm</label><input id="delete-confirm" autocomplete="off"><label class="check"><input id="delete-ack" type="checkbox"><span>I have a working recovery backup or accept losing access to this wallet.</span></label><div class="form-actions">${button('cancel-remove','Cancel')}${button('confirm-remove','Delete wallet','danger')}</div></section>`;
    if ($('backup-before-remove')) $('backup-before-remove').onclick = exportBackup;
    $('cancel-remove').onclick = () => {deleteTarget=null;go('wallets');};
    $('confirm-remove').onclick = async () => {
      if ($('delete-confirm').value !== 'REMOVE' || !$('delete-ack').checked) { error('Type REMOVE and confirm your backup first.'); return; }
      const token = generation;
      let cleanupFailed=false;
      try {
        await withWalletLock(() => {
          if (token !== generation) throw new Error('The active wallet changed. Review before removing it.');
          if (storageFailure) localStorage.removeItem(STORE);
          else {
            if (JSON.stringify(library.active()) !== JSON.stringify(envelope)) throw new Error('Another tab changed the active wallet. Reload before removing it.');
            const current=library.list().find(w=>w.id===target);
            if(!current||JSON.stringify(current.vault)!==JSON.stringify(item.vault))throw Error('This wallet changed. Review it again before deleting.');
            library.remove(target);
            try{
              for(const coin of Object.keys(E.NETWORKS))localStorage.removeItem('corevault.balance.'+target+'.'+coin);
              for(const prefix of ['corevault.receive.','corevault.send-attempts.','corevault.live.','corevault.komodo-recovery.'])localStorage.removeItem(prefix+target);
            }catch(_){cleanupFailed=true;}
          }
          if(isActive||storageFailure){envelope = null; mode = 'demo'; lock();}
          deleteTarget=null;
        });
        go(isActive||storageFailure?'wallet':'wallets'); toast(cleanupFailed?'Wallet deleted; some local public history could not be cleared.':'Wallet deleted from this device. Other wallets and exported backups were kept.');
      } catch (e) { error(e.message); }
    };
  }
  function storageError() {
    $('main').innerHTML = title('Saved wallet needs attention', 'Your existing data has not been overwritten.') + '<section class="panel form-panel"><div class="notice">The saved wallet could not be read. Export the original data before removing or replacing it. An unprotected wallet export contains readable recovery words; keep it private.</div>' + button('export-raw','Export saved data','wide') + button('remove-raw','Remove local copy','danger space-top') + '</section>';
    $('export-raw').onclick = () => {
      const raw = localStorage.getItem(STORE); if (!raw) return;
      if(window.SafeCorePlatform){SafeCorePlatform.exportBackup(raw).then(()=>toast('Backup saved.')).catch(e=>error(e.message));return;}
      const url = URL.createObjectURL(new Blob([raw], {type:'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = 'safecore-unreadable-vault.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    };
    $('remove-raw').onclick = () => {deleteTarget=null;go('remove');};
  }
  function render() {
    let route = location.hash.slice(1) || 'wallet';
    if (!['wallet','wallets','live','send','sweep','komodo-sweep','reveal','export','coins','receive','activity','security','setup','backup','unlock','remove','reset-tests','icons'].includes(route)) route = 'wallet';
    if(!['sweep','komodo-sweep'].includes(route)){clearSweep();clearSweepReceipt();}
    if(route!=='komodo-sweep')clearKomodo();
    if (route !== 'send') sendCoin = null;
    if (!['receive','sweep','komodo-sweep'].includes(route)) receiveCoin = null;
    if (pending && route !== 'backup') pending = null;
    document.documentElement.dataset.walletState = mode;
    if(route!=='icons')applyBrand(savedBrand());
    const shortcut = document.querySelector('.wallets-shortcut');
    try {
      const name = envelope && library.list().find(item => item.id === WalletLibrary.id(envelope))?.name;
      $('current-wallet-label').textContent = name || 'No wallet selected';
      shortcut.title = name ? `Switch wallets · Current: ${name}` : 'Manage saved wallets';
    } catch (_) { $('current-wallet-label').textContent = 'Wallets'; }
    if(route==='wallets')shortcut.setAttribute('aria-current','page');else shortcut.removeAttribute('aria-current');
    $('lock').disabled = mode === 'demo' && !pending;
    $('lock').hidden = !protectedWallet(envelope);
    $('breadcrumb').textContent = ({wallet:'Overview',coins:'Coins',receive:'Receive',activity:'Activity',security:'Security',setup:'Setup',backup:'Recovery',unlock:'Unlock',remove:'Remove'})[route];
    document.querySelectorAll('[data-nav]').forEach(el => {
      const active = el.dataset.nav === (['sweep','komodo-sweep'].includes(route)?'receive':['coins','wallets'].includes(route) ? 'wallet' : ['setup','backup','unlock','remove','reveal','export','reset-tests','icons'].includes(route) ? 'security' : route);
      el.classList.toggle('active', active); if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    if (mode === 'storage-error' && !['remove','reset-tests'].includes(route)) storageError();
    else ({wallet:overview,wallets,live:()=>go('wallet'),send,sweep,'komodo-sweep':komodo,reveal,export:exportConfirm,coins,receive,activity,security,setup,backup,unlock,remove,'reset-tests':resetTests,icons:iconGallery})[route]();
    document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
    if (['wallet','receive','activity','send'].includes(route) && liveEnabled() && mode === 'unlocked') {
      const targets = route !== 'receive' ? Object.keys(E.NETWORKS) : [receiveCoin];
      for (const coin of targets) if (E.NETWORKS[coin] && !scans[coin] && Date.now()-(lastRefresh[coin]||0)>WalletReporting.POLL_MS) void refreshLive(coin);
      if(route==='wallet')void refreshPrice();
    }
  }
  $('lock').onclick = () => mode === 'locked' ? go('unlock') : lock('Wallet locked.');
  document.addEventListener('click', event => {
    const selector = document.querySelector('.wallet-coin-switch[open]');
    if (selector && !selector.contains(event.target)) selector.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const selector = document.querySelector('.wallet-coin-switch[open]');
      if (selector) { selector.open = false; selector.querySelector('summary').focus(); }
    }
  });
  window.addEventListener('hashchange', event => {
    // Native resume/import can replace a route before an older hash event arrives.
    // That stale event must not discard a freshly staged backup or rebuilt form.
    if(event.newURL&&new URL(event.newURL).hash!==location.hash)return;
    sendCoin = null;
    // Only an explicit Overview coin click may preselect a deposit asset.
    // Other routes clear receiveCoin on render; the bottom tab starts blank.
    if(!['#receive','#sweep','#komodo-sweep'].includes(location.hash))receiveCoin=null;
    generation++; stagedFile = null; busy = false; clearError(); render(); window.scrollTo(0,0);
  });
  function resumeUnprotected() {
    if(!document.hidden&&envelope?.format===E.OPEN_FORMAT&&mode==='locked'){
      try{openUnprotected();render();resetIdle();}catch(_){error('Could not reopen this wallet.');}
    }
  }
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){if(!window.SafeCorePlatform?.cameraPermissionPending)lock();}
    else resumeUnprotected();
  });
  window.addEventListener('pagehide', () => lock(undefined, false));
  window.addEventListener('pageshow', resumeUnprotected);
  window.addEventListener('safecore-pause', () => lock(undefined, false));
  window.addEventListener('safecore-resume', resumeUnprotected);
  window.addEventListener('safecore-import', event => {
    if(!window.SafeCorePlatform||typeof event.detail!=='string'||event.detail.length>65536)return;
    addingWallet=Boolean(envelope);setupType='import';
    history.replaceState(null,'','#setup');render();
    const input=$('backup-file'),transfer=new DataTransfer();
    transfer.items.add(new File([event.detail],'backup.json',{type:'application/json'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change'));
  });
  window.addEventListener('storage', event => {
    if(event.key===komodoPreference()){
      clearKomodo();clearSweep();sendDraft=null;generation++;busy=false;
      if(location.hash==='#komodo-sweep')go('security');else if(location.hash==='#security'||location.hash==='#sweep')render();
    }
    if(event.key===BRAND_PREF) {applyBrand(savedBrand());if(location.hash==='#icons')iconGallery();}
    if (event.key === 'corevault.theme') document.documentElement.dataset.theme = event.newValue === 'light' ? 'light' : 'dark';
    if (event.key === COIN_PREFS) { loadCoinPrefs(); if (['', '#wallet', '#coins'].includes(location.hash)) render(); }
    if (event.key === STORE || event.key === WalletLibrary.COLLECTION || event.key === null) { lock(undefined, false); try { const raw = localStorage.getItem(STORE); envelope = raw ? E.validateEnvelope(JSON.parse(raw)) : null; mode = envelope ? 'locked' : 'demo'; if(!document.hidden)openUnprotected(); } catch (_) { envelope = null; mode = 'storage-error'; } render(); resetIdle(); }
  });
  for (const event of ['pointerdown','keydown']) document.addEventListener(event, resetIdle, {passive:true});
  render();
  resetIdle();
  const notificationTimers={};
  N.onChange(coin=>{
    if(notificationTimers[coin])return;
    const epoch=networkEpoch;
    notificationTimers[coin]=setTimeout(()=>{delete notificationTimers[coin];if(epoch===networkEpoch&&!document.hidden&&mode==='unlocked')void refreshLive(coin);},250);
  });
  setInterval(() => {
    if (!document.hidden && mode === 'unlocked' && liveEnabled()) {
      const active = ['', '#wallet', '#receive', '#activity', '#send'].includes(location.hash);
      const routine = !active ? [] : location.hash !== '#receive' ? Object.keys(E.NETWORKS) : receiveCoin ? [receiveCoin] : [];
      const targets = new Set([...initialDiscovery, ...routine]);
      for (const coin of targets) void refreshLive(coin);
      void checkSentBalances();
      if(['','#wallet'].includes(location.hash))void refreshPrice();
    }
  },WalletReporting.POLL_MS);
})();
