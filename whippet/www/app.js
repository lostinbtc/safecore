/* Local seed custody. Default or explicitly selected Electrum WSS endpoints. */
(async () => {
  'use strict';
  const E = window.WalletEngine;
  const T = window.WalletTransactions, N = window.WalletNetwork;
  const $ = id => document.getElementById(id);
  // Opt-in presentation only: .glow-control shares the document timeline so
  // replacing a control during polling cannot restart its glow. No frame loop.
  const glowMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function syncControlGlow(root) {
    if (glowMotion.matches || !(root instanceof Element)) return;
    const controls = root.matches('.glow-control') ? [root] : [...root.querySelectorAll('.glow-control')];
    for (const control of controls) {
      if (!control.isConnected || typeof control.getAnimations !== 'function') continue;
      for (const animation of control.getAnimations({subtree:true})) {
        if (['control-glow','control-icon-glow','control-haze'].includes(animation.animationName)) animation.startTime = 0;
      }
    }
  }
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target.matches('.glow-control')) syncControlGlow(record.target);
      } else for (const node of record.addedNodes) syncControlGlow(node);
    }
  }).observe(document.body, {childList:true,subtree:true,attributes:true,attributeFilter:['class','disabled','aria-disabled']});
  glowMotion.addEventListener('change', () => syncControlGlow(document.body));
  syncControlGlow(document.body);
  const STORE = 'whippet.dev.encrypted.v1';
  // Installation-wide notice acknowledgment; never part of a seed or wallet backup.
  const RISK_ACK = 'corevault.risk-ack.v1';
  const RISK_NOTICE = [
    'SafeCore is experimental, self-custody wallet software provided “as is,” without warranties.',
    'You are responsible for safeguarding your recovery phrase, maintaining backups, and verifying transactions. Software defects, compromised devices, network problems, or user errors may cause permanent loss of funds.',
    'The developers do not hold your funds or recovery keys and cannot recover lost keys or reverse confirmed transactions.',
    'SafeCore’s developers and contributors are not liable for lost funds or other losses resulting from use of this wallet.',
    'Your BIP39 recovery phrase can also be restored in Coinomi on supported networks when the address derivation and any extra BIP39 passphrase match. Verify a known receiving address after restoring.'
  ];
  const riskAccepted = () => { try { return localStorage.getItem(RISK_ACK) === 'acknowledged'; } catch (_) { return false; } };
  const riskContent = () => RISK_NOTICE.map(text => `<p>${escape(text)}</p>`).join('');
  function showRiskNotice() {
    if (riskAccepted()) { $('risk-notice')?.close(); return; }
    if (!$('risk-notice')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'risk-notice'; dialog.className = 'risk-notice';
      dialog.setAttribute('aria-labelledby', 'risk-title');
      dialog.innerHTML = '<h1 id="risk-title" tabindex="-1">Before you use SafeCore</h1>' +
        `<div class="risk-copy">${riskContent()}</div>` +
        '<label class="check"><input id="risk-ack" type="checkbox"><span>I have read this notice and understand that I could permanently lose funds.</span></label>' +
        '<p id="risk-error" role="alert" hidden></p><button id="risk-continue" class="primary wide" disabled>I understand — continue</button>';
      document.body.append(dialog);
      dialog.addEventListener('cancel', event => event.preventDefault());
      $('risk-ack').onchange = () => { $('risk-continue').disabled = !$('risk-ack').checked; };
      $('risk-continue').onclick = () => {
        if (!$('risk-ack').checked) return;
        try {
          localStorage.setItem(RISK_ACK, 'acknowledged');
          if (!riskAccepted()) throw Error('Acknowledgment was not saved');
        } catch (_) {
          $('risk-error').textContent = 'Could not save your acknowledgment. Enable local storage and try again. Your wallet data has not been changed.';
          $('risk-error').hidden = false;
          return;
        }
        dialog.close(); clearError(); render(); $('main').focus();
      };
    }
    if (!$('risk-notice').open) {
      $('risk-ack').checked = false; $('risk-continue').disabled = true; $('risk-error').hidden = true;
      $('risk-notice').showModal(); $('risk-title').focus();
    }
  }
  const nativeStorage = location.origin === 'https://appassets.androidplatform.net';
  let walletStorage;
  function deviceStorageError() {
    $('main').innerHTML = '<h1>Wallet storage unavailable</h1><p>Close and reopen the app to retry. Do not uninstall or clear app data. If the device key is lost, you will need your separate recovery backup.</p>';
    $('lock').hidden = true;
    $('header-add-coins').hidden = true;
  }
  try {
    if (nativeStorage) $('main').textContent = 'Opening protected wallet storage…';
    if(!window.WalletStorage)throw Error('Storage script unavailable');
    walletStorage = await WalletStorage.open(localStorage, window.SafeCorePlatform, nativeStorage);
  } catch (_) { deviceStorageError(); return; }
  const library = WalletLibrary.create(walletStorage);
  const protectedWallet = vault => vault?.format === E.FORMAT;
  const withWalletLock = task => navigator.locks.request('corevault-wallet-storage', task);
  const changeWallet = (task, published = () => {}) => withWalletLock(async () => {
    try { const result = await walletStorage.transaction(task); published(result); return result; }
    catch (e) {
      if (walletStorage.failed) { envelope = null; mode = 'storage-error'; lock(undefined, false); }
      throw e;
    }
  });
  const COIN_PREFS = 'corevault.hidden-coins.v1';
  const WALLET_COIN_PREFS = 'corevault.hidden-coins.v2.';
  const coinPrefsKey = () => envelope ? WALLET_COIN_PREFS + WalletLibrary.id(envelope) : COIN_PREFS;
  const CONNECTION_PREFS='corevault.connections.v1';
  const LEGACY_ASSETS=Object.freeze({flop:'corevault.legacy-flop.v1',cat:'corevault.legacy-cat.v1',bonc:'corevault.legacy-bonc.v1',jkc:'corevault.legacy-jkc.v1',lky:'corevault.legacy-lky.v1'});
  const legacyEnabled=coin=>{try{return localStorage.getItem(LEGACY_ASSETS[coin])==='true';}catch(_){return false;}};
  const catalogEnabled=coin=>!LEGACY_ASSETS[coin]||legacyEnabled(coin);
  const activeConnections=()=>{const values=savedConnections();for(const coin of Object.keys(LEGACY_ASSETS))if(!legacyEnabled(coin))delete values[coin];return values;};
  const liveCoin=coin=>catalogEnabled(coin)&&Boolean(N.endpoint(coin));
  const connectionTests=new Set();
  const cancelConnectionTests=()=>{for(const controller of connectionTests)controller.abort();connectionTests.clear();};
  const savedConnections=()=>N.validateEndpoints(JSON.parse(localStorage.getItem(CONNECTION_PREFS)||'{}'));
  let connectionProblem=null;
  try{N.configure(activeConnections());}catch(_){connectionProblem='Check your saved connections in Settings.';}
  const BALANCE_PRIVACY = 'corevault.hide-balances.v1';
  const balancesHidden=()=>{try{return localStorage.getItem(BALANCE_PRIVACY)==='true';}catch(_){return true;}};
  const hiddenBalance='<span class="masked-balance" aria-label="Balance hidden">••••</span>';
  // Approved brand icon; older gallery-preview choices do not override it.
  const BRAND_PREF = 'corevault.icon.v3';
  const DEFAULT_BRAND = 31;
  const BRAND_ICONS = ['Shield Core','Orbit','Safe Hex','SC Monogram','Vault Dial','Linked','Keystone','Core Layers','Signal','North Star','Minted Core','Twin Coins','Chain Token','Block Mint','Core Coin','Coin Reserve','Crypto Orbit','Node Coin','Crystal Token','Proof Coin','Nexus Hub','Hex Mesh','Relay Ring','Node Shield','Consensus','Ledger Cube','Circuit Core','Constellation','Dual Hub','Chain Bridge'];
  BRAND_ICONS.push('SC Globe');
  const brandPath = id => id===31 ? 'assets/safecore.png' : id ? `assets/icons/safecore-${String(id).padStart(2,'0')}.svg` : 'assets/corevault.svg';
  function savedBrand(){try{const raw=localStorage.getItem(BRAND_PREF);if(raw===null)return DEFAULT_BRAND;const id=Number(raw);return Number.isInteger(id)&&id>=0&&id<=BRAND_ICONS.length?id:DEFAULT_BRAND;}catch(_){return DEFAULT_BRAND;}}
  function applyBrand(id){document.querySelector('.mobile-brand img').src=brandPath(id);const favicon=document.querySelector('link[rel="icon"]');favicon.href=brandPath(id);favicon.type=id===31?'image/png':'image/svg+xml';}
  // One alphabetical presentation order for every screen. Never reorder the
  // key engine, saved recipes or scanning queues to change the visual layout.
  const COINS = Object.freeze(Object.fromEntries(Object.entries(E.NETWORKS)
    .sort(([,a],[,b])=>a.name.localeCompare(b.name,'en'))));
  // Navigation only, never polled or loaded inside the wallet. WHT has no explorer.
  const EXPLORERS = Object.freeze({
    bch:'https://blockchair.com/bitcoin-cash/transaction/',
    dash:'https://blockchair.com/dash/transaction/',
    dgb:'https://digiexplorer.info/tx/',
    rvn:'https://ravencoinexplorer.com/tx/',
    pep:'https://pepecoinservice.org/explorer/tx/',
    btc:'https://mempool.space/tx/',
    doge:'https://dogechain.com/tx/',
    ltc:'https://litecoinspace.org/tx/',
    bel:'https://nintondo.io/bells/explorer/tx/',
    dingo:'https://explorer.dingocoin.com/tx/',
    shic:'https://explorer.shibacoinshic.org/tx/'
  });
  const assetOrder = Object.keys(COINS).filter(coin => Object.hasOwn(E.NETWORKS, coin));
  let hiddenCoins = [];
  function loadCoinPrefs() {
    try {
      // Existing wallets inherit their old installation-wide selection until
      // explicitly changed. New wallets receive their own empty selection at save.
      const raw = localStorage.getItem(coinPrefsKey()) ?? localStorage.getItem(COIN_PREFS);
      const saved = raw === null ? (envelope ? [] : assetOrder) : JSON.parse(raw);
      hiddenCoins = Array.isArray(saved) ? saved.filter(coin => Object.hasOwn(COINS, coin)) : [...assetOrder];
    } catch (_) { hiddenCoins = [...assetOrder]; }
  }
  const visibleCoins = () => Object.keys(COINS).filter(coin => catalogEnabled(coin) && !hiddenCoins.includes(coin));
  const assetRoute=()=>location.hash.startsWith('#asset/');
  const selectedAsset=()=>{const coin=location.hash.slice(7);return assetRoute()&&Object.hasOwn(COINS,coin)&&visibleCoins().includes(coin)?coin:null;};
  const priceScreen=()=>['','#wallet'].includes(location.hash)||assetRoute();
  const icons = {
    wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8h15M17 12h4v5h-4a2.5 2.5 0 0 1 0-5Z"/>',
    receive: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    send: '<path d="M12 17V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
    settings: '<path d="m9.5 3-.5 2.5-2 1.2-2.4-.8-2.4 4.2L4.2 12l-2 1.9 2.4 4.2 2.4-.8 2 1.2.5 2.5h5l.5-2.5 2-1.2 2.4.8 2.4-4.2-2-1.9 2-1.9-2.4-4.2-2.4.8-2-1.2-.5-2.5Z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/><path d="M12 15v2"/>',
    unlock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 7.5-2"/><path d="M12 15v2"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.wallet}</svg>`;
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const coinImage = coin => coin==='bch'?'assets/bitcoincash.svg':`assets/${({pep:'pepecoin',wht:'whippet',shic:'shibacoin',ltc:'litecoin',doge:'dogecoin',btc:'bitcoin',bel:'bellscoin',bonc:'bonkcoin',dingo:'dingocoin',bch:'bitcoincash',dash:'dash',dgb:'digibyte',jkc:'junkcoin',lky:'luckycoin',rvn:'ravencoin',cat:'catcoin',trmp:'trumpow',flop:'flopcoin'})[coin]}.png`;
  const coinMark = coin => `<img src="${coinImage(coin)}" alt="">`;
  let envelope = null, pending = null, sendCoin = null, receiveCoin = null;
  let assetSendSelection=null;
  let receiveBooks = null, addingWallet = false, revealed = false;
  let receivePools = null, networkEpoch = 0, snapshots = {}, networkErrors = {}, scans = {}, lastRefresh = {}, sendDraft = null;
  let rescanning=false,sweepState=null;
  let komodoGate=null;
  // In-memory comparison only. Never persist this mnemonic fingerprint.
  let destinationFingerprint=null,komodoEntry=null;
  const komodoPreference=()=>envelope?'corevault.komodo-recovery.'+WalletLibrary.id(envelope):null;
  const komodoEnabled=()=>{try{return Boolean(envelope)&&localStorage.getItem(komodoPreference())==='true';}catch(_){return false;}};
  const komodoVerified=(coin=receiveCoin)=>komodoEnabled()&&WalletKomodo.supports(coin)&&komodoGate?.coin===coin&&komodoGate?.source===envelope&&komodoGate.epoch===networkEpoch&&Date.now()<komodoGate.expires;
  function clearKomodo(){
    komodoEntry?.destroy();komodoEntry=null;
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
  let exportSelection=null;
  const balanceWrites=new Map();
  function clearReports(){for(const timer of Object.values(reportTimers))clearTimeout(timer);reportTimers={};reports={};balanceWrites.clear();}
  const reported=coin=>reports[coin]?.value;
  const EXTRA_PRICE_IDS=Object.freeze({bch:'bitcoin-cash',dash:'dash',dgb:'digibyte',jkc:'junkcoin',lky:'luckycoin',rvn:'ravencoin',cat:'catcoin',trmp:'trumpow'});
  const extraQuotes={};
  let pepPrice=null,usdtPrice=null,priceAttempt=0,priceBusy=false;
  let shicPrice=null,ltcPrice=null,dogePrice=null,btcPrice=null,belPrice=null,dingoPrice=null,shicPriceAttempt=0,shicPriceBusy=false,shicPriceRetry=240000;
  const DISPLAY_PRICE_STORE='corevault.display-prices.v1';
  let displayPrices={},displayPricesSaved='',priceEpoch=0;
  try{displayPricesSaved=localStorage.getItem(DISPLAY_PRICE_STORE)||'';displayPrices=WalletReporting.readDisplayPrices(displayPricesSaved);}catch(_){}
  function rememberDisplayPrices(){
    // Public prices only, no wallet identifiers. Never hydrate live fee quotes
    // from this untrusted display cache, even if its timestamps appear fresh.
    for(const [coin,q]of Object.entries({pep:pepPrice,usdt:usdtPrice,shic:shicPrice,ltc:ltcPrice,doge:dogePrice,btc:btcPrice,bel:belPrice,dingo:dingoPrice,...extraQuotes})){
      if(q&&WalletReporting.displayQuote(q).value!==null)displayPrices[coin]={value:q.value,at:q.at,updated:q.updated};
    }
    const saved=JSON.stringify({version:1,quotes:displayPrices});
    if(saved!==displayPricesSaved)try{localStorage.setItem(DISPLAY_PRICE_STORE,saved);displayPricesSaved=saved;}catch(_){}
  }
  async function refreshShicPrice(forFee=false){
    if(shicPriceBusy||Date.now()-shicPriceAttempt<(forFee?10000:shicPriceRetry))return;
    shicPriceBusy=true;shicPriceAttempt=Date.now();
    // Refresh before the five-minute freshness deadline; retry failed requests
    // once per minute, independently of the four-second balance polling.
    shicPriceRetry=60000;
    const epoch=priceEpoch,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=shibacoin,litecoin,dogecoin,bitcoin,bellscoin,dingocoin,bitcoin-cash,dash,digibyte,junkcoin,luckycoin,ravencoin,catcoin,trumpow&vs_currencies=usd&include_last_updated_at=true',{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok)throw Error('SHIC price unavailable');
      const quotes=await response.json();
      if(epoch!==priceEpoch)return;
      let accepted=false;
      const readQuote=id=>{const quote=WalletReporting.marketQuote(quotes,id);accepted=true;return quote;};
      // A missing field must not erase a still-fresh known quote and expose a
      // dollar-limit override. Retain it until the normal freshness deadline.
      for(const [coin,id] of Object.entries(EXTRA_PRICE_IDS)){try{extraQuotes[coin]=readQuote(id);}catch(_){}}
      try{shicPrice=readQuote('shibacoin');}catch(_){}
      try{ltcPrice=readQuote('litecoin');}catch(_){}
      try{dogePrice=readQuote('dogecoin');}catch(_){}
      try{btcPrice=readQuote('bitcoin');}catch(_){}
      try{belPrice=readQuote('bellscoin');}catch(_){}
      try{dingoPrice=readQuote('dingocoin');}catch(_){}
      if(accepted){shicPriceRetry=240000;rememberDisplayPrices();}
    }catch(_){/* Keep prior quotes; missing/stale prices require a per-review acknowledgment. */}
    finally{clearTimeout(timer);shicPriceBusy=false;if(!document.hidden&&priceScreen())render();}
  }
  async function refreshPrice(forFee=false){
    if(!riskAccepted()||priceBusy||Date.now()-priceAttempt<(forFee?10000:60000)||mode!=='unlocked'||document.hidden)return;
    priceBusy=true;priceAttempt=Date.now();
    void refreshShicPrice();
    const epoch=priceEpoch,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch('https://api.kraken.com/0/public/Ticker?pair=PEPUSD,USDTUSD',{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok)throw Error('Price unavailable');
      const data=await response.json(),value=Number(data.result?.PEPUSD?.c?.[0]),usdt=Number(data.result?.USDTZUSD?.c?.[0]);
      if(epoch!==priceEpoch)return;
      if(!Array.isArray(data.error)||data.error.length)throw Error('Invalid price');
      const at=Date.now();
      // PEP and USDT must age independently. A missing field must not erase or
      // renew the other quote, nor make a stale quote acceptable for fee checks.
      if(Number.isFinite(value)&&value>0)pepPrice={value,at,updated:at};
      if(Number.isFinite(usdt)&&usdt>0)usdtPrice={value:usdt,at,updated:at};
      if(Number.isFinite(value)&&value>0||Number.isFinite(usdt)&&usdt>0)rememberDisplayPrices();
    }catch(_){/* Keep the last quote; fee checks reject stale prices unless explicitly acknowledged. */}
    finally{clearTimeout(timer);priceBusy=false;if(!document.hidden&&priceScreen())render();}
  }
  let mode = 'demo', generation = 0, idleTimer = null, toastTimer = null;
  let stagedFile = null, setupType = 'create', busy = false;
  let activityPages = {};
  let restoreEntry = null;
  try {
    const saved = walletStorage.getItem(STORE);
    if (saved) { envelope = E.validateEnvelope(JSON.parse(saved)); mode = 'locked'; }
  } catch (_) { mode = 'storage-error'; }
  loadCoinPrefs();
  function prepareAddresses(candidate, vault) {
    activityPages = {};
    assetSendSelection=null;
    sendCoin = null; receiveCoin = null;
    clearReports();
    clearSweep();clearKomodo();clearSweepReceipt();rescanning=false;sendRefreshRun=null;
    destinationFingerprint=WalletKomodo.fingerprint(candidate.mnemonic);
    const pools = E.cachedReceivePool(ethers, candidate, localStorage, WalletLibrary.id(vault), 200);
    N.close(); networkEpoch++; snapshots = {}; networkErrors = {}; scans = {}; lastRefresh = {}; sendDraft = null; receivePools = pools;
    initialDiscovery = new Set(Object.keys(pools).filter(liveCoin));
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
  const deviceTheme=matchMedia('(prefers-color-scheme: dark)');
  let nativeSystemTheme=null;
  function themePreference(){try{const value=localStorage.getItem('corevault.theme');return ['light','dark'].includes(value)?value:'system';}catch(_){return 'system';}}
  function applyTheme(){
    const preference=themePreference(),theme=preference==='system'?(nativeSystemTheme||(deviceTheme.matches?'dark':'light')):preference;
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0b1018':'#f3f6fa';
    document.querySelectorAll('[data-theme-choice]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.themeChoice===preference)));
  }
  deviceTheme.addEventListener('change',applyTheme);applyTheme();
  window.addEventListener('safecore-theme',event=>{if(['light','dark'].includes(event.detail)){nativeSystemTheme=event.detail;applyTheme();}});

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
    activityPages = {};
    assetSendSelection=null;
    cancelConnectionTests();
    exportSelection=null;
    clearSweep();clearKomodo();clearSweepReceipt();rescanning=false;sendRefreshRun=null;
    destinationFingerprint=null;
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
    return riskAccepted() && Boolean(envelope);
  }
  const liveSnapshot = coin => !connectionProblem && snapshots[coin] && !snapshots[coin].cached && N.isCurrent(snapshots[coin]) && !networkErrors[coin] && Date.now() - snapshots[coin].at < 45000;
  const fresh = coin => liveSnapshot(coin) && snapshots[coin].complete!==false;
  let balanceViewQueued=false;
  function refreshBalanceViews(coin){
    if(balanceViewQueued)return;
    const epoch=networkEpoch,source=envelope,route=location.hash;
    if(!['','#wallet','#activity','#send'].includes(route)&&!assetRoute()&&!(coin===receiveCoin&&route==='#receive'))return;
    balanceViewQueued=true;
    queueMicrotask(()=>{
      balanceViewQueued=false;
      if(epoch!==networkEpoch||source!==envelope||route!==location.hash||mode!=='unlocked'||document.hidden)return;
      // A balance notification must not rebuild the header or trigger more scans.
      if(['','#wallet'].includes(route))overview();
      else if(assetRoute())assetDetail();
      else if(route==='#send')updateSendPicker();
      else render();
    });
  }
  function balanceFingerprint(snapshot){
    // Public display cache only: timestamps, probe cursors and spendable UTXOs
    // are deliberately excluded. Fresh spending checks still use live snapshots.
    return JSON.stringify([snapshot.tip,snapshot.confirmed,snapshot.unconfirmed,
      [...(snapshot.everUsed||[])].sort((a,b)=>a-b),snapshot.rows.map(r=>[
        r.account.address,r.confirmed,r.unconfirmed,r.checked!==false,r.history])],
      (_,v)=>typeof v==='bigint'?v.toString():v);
  }
  async function refreshLive(coin,full=false,indices=null) {
    if (!liveCoin(coin) || connectionProblem || !liveEnabled() || mode !== 'unlocked' || !receivePools?.[coin] || document.hidden) return null;
    if(indices&&initialDiscovery.has(coin))return null;
    // Confirmed-send refreshes supersede slow scans instead of queuing behind them.
    // The version guard prevents those older results from restoring spent balances.
    while (!indices&&scans[coin]) {if(!full)return scans[coin];const epoch=networkEpoch;await scans[coin];if(epoch!==networkEpoch)return null;}
    const version=(scanVersions[coin]||0)+1;scanVersions[coin]=version;
    lastRefresh[coin] = Date.now();
    const epoch = networkEpoch, source = envelope;
    const active=()=>epoch===networkEpoch&&version===scanVersions[coin]&&source===envelope&&mode==='unlocked'&&!document.hidden&&liveEnabled();
    const work = (async () => {
      try {
        const prior=snapshots[coin];
        if(prior)prior.everUsed=[...new Set([...(prior.everUsed||[]),...receiveBooks[coin].preferences().used])];
        const discovering=initialDiscovery.has(coin);
        const snapshot = await N.scan(coin, receivePools[coin],prior,{full:full || discovering,verify:reports[coin]?.pending===true,isActive:active,...(indices?{indices}:{}),
          ...(discovering?{onBatch:batch=>{
            if(!active())return;
            snapshots[coin]=batch;delete networkErrors[coin];
            for(const row of batch.rows)if(row.checked!==false)receiveBooks[coin].observe(row.account.address,row.history);
            receiveBooks[coin].remember(batch.everUsed||[]);
            // Discovery grows the displayed balance quietly; it is not a spendable
            // snapshot or a completed disk cache. Ordinary refreshes still settle.
            reports[coin]=WalletReporting.create(batch);
            refreshBalanceViews(coin);
          }}:{})});
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
          const key='corevault.balance.'+WalletLibrary.id(source)+'.'+coin;
          const fingerprint=balanceFingerprint(snapshot),written=balanceWrites.get(key);
          // Changes are persisted immediately; unchanged observations get a
          // bounded heartbeat instead of a synchronous storage write every poll.
          if(!written||written.fingerprint!==fingerprint||Date.now()-written.at>=30000)await withWalletLock(()=>{
            if(epoch!==networkEpoch||version!==scanVersions[coin]||source!==envelope)return;
            const existing=N.decode(localStorage.getItem(key),coin,receivePools[coin]);
            snapshot.everUsed=[...new Set([...(snapshot.everUsed||[]),...(existing?.everUsed||[])])];
            localStorage.setItem(key,N.encode(snapshot));
            balanceWrites.set(key,{fingerprint:balanceFingerprint(snapshot),at:Date.now()});
          });
        } catch (_) { toast('Balance refreshed, but could not be saved on this device.'); }
        return epoch===networkEpoch&&version===scanVersions[coin]?snapshot:null;
      } catch (e) {
        if (epoch === networkEpoch&&version===scanVersions[coin]) { networkErrors[coin] = e.message;reports[coin]?.invalidate();clearTimeout(reportTimers[coin]);delete reportTimers[coin]; }
        return null;
      } finally {
        if (epoch === networkEpoch&&version===scanVersions[coin]) {
          delete scans[coin];
          refreshBalanceViews(coin);
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
  const fundedCoins = () => assetOrder.filter(coin => {
    if(!liveCoin(coin))return false;
    const value = reported(coin);
    return value && value.confirmed + value.unconfirmed > 0n;
  });
  function updateSendPicker() {
    const host = $('send-picker');
    if (!host) return;
    const coins = fundedCoins();
    // Keep the actual buttons alive across balance polls. Replacing them between
    // pointer-down and pointer-up can lose a tap and leave the old coin selected.
    if (!host.firstElementChild) {
      host.innerHTML = `<section class="wallet-coin-switch send-coin-switch" aria-labelledby="send-coin"><div class="send-coin-heading"><h2 id="send-coin"></h2><button id="change-send-coin" type="button" class="text-button" aria-controls="send-coin-options"></button></div><div id="send-selected-coin" class="send-selected-coin"></div><div id="send-coin-options" class="wallet-coin-options" ${sendCoin?'hidden':''}></div><p id="send-coins-empty" class="subtle" hidden></p></section>`;
      $('change-send-coin').onclick = () => {
        if ($('scan-panel') && !$('scan-panel').hidden) $('cancel-scan').click();
        $('send-coin-options').hidden = !$('send-coin-options').hidden;
        updateSendPicker();
      };
      host.addEventListener('click', event => {
        const el = event.target.closest('[data-send-coin]');
        if (!el || !host.contains(el) || !fundedCoins().includes(el.dataset.sendCoin)) return;
        if (sendCoin === el.dataset.sendCoin) {
          $('send-coin-options').hidden = true; updateSendPicker();
        } else {
          // Coin changes invalidate the form, quote and every late async callback.
          if ($('scan-panel') && !$('scan-panel').hidden) $('cancel-scan').click();
          generation++; sendCoin = el.dataset.sendCoin; sendDraft = null; busy = false; clearError(); send();
        }
        $('change-send-coin')?.focus({preventScroll:true});
      });
    }
    const options = $('send-coin-options'), selected = $('send-selected-coin'), change = $('change-send-coin');
    const balanceText = coin => {
      const s = reported(coin), n = E.NETWORKS[coin];
      return `${s ? balancesHidden()?'••••':T.formatDisplay(s.confirmed+s.unconfirmed) : 'Checking…'} ${n.ticker}${s&&!fresh(coin)&&snapshots[coin]?.complete!==false?' · Last known':''}${s?.unconfirmed?' · Includes pending':''}`;
    };
    const updateBalance = (target, coin) => {
      target.textContent = balanceText(coin);
      if (balancesHidden()) target.setAttribute('aria-label', `Balance hidden (${E.NETWORKS[coin].ticker})`);
      else target.removeAttribute('aria-label');
    };
    $('send-coin').textContent = options.hidden ? 'Sending' : 'Choose an asset';
    selected.hidden = !sendCoin || !options.hidden;
    change.hidden = !sendCoin;
    change.textContent = options.hidden ? 'Change' : 'Close';
    change.setAttribute('aria-expanded', String(!options.hidden));
    if ($('send-form')) $('send-form').hidden = !options.hidden;
    if (sendCoin) {
      if (selected.dataset.coin !== sendCoin) {
        selected.dataset.coin = sendCoin;
        selected.innerHTML = `${coinMark(sendCoin)}<span><strong>${E.NETWORKS[sendCoin].name} <span class="send-selected-ticker">${E.NETWORKS[sendCoin].ticker}</span></strong><small></small></span>`;
      }
      updateBalance(selected.querySelector('small'), sendCoin);
    }
    for (const el of options.querySelectorAll('[data-send-coin]')) if (!coins.includes(el.dataset.sendCoin)) el.remove();
    for (const coin of coins) {
      let el = options.querySelector(`[data-send-coin="${coin}"]`);
      if (!el) {
        el = document.createElement('button'); el.type = 'button'; el.dataset.sendCoin = coin;
        el.innerHTML = `${coinMark(coin)}<span>${E.NETWORKS[coin].name}<small></small></span><span class="send-choice-state" aria-hidden="true"></span>`;
        const next = [...options.children].find(row => assetOrder.indexOf(row.dataset.sendCoin)>assetOrder.indexOf(coin));
        options.insertBefore(el, next || null);
      }
      // Choosing an asset is navigation, not authorization to spend. Discovery
      // may still be running; available() and review retain the spending gate.
      el.setAttribute('aria-pressed', String(coin===sendCoin));
      updateBalance(el.querySelector('small'), coin);
      el.querySelector('.send-choice-state').textContent = coin===sendCoin ? '✓ Selected' : '';
    }
    $('send-coins-empty').hidden = options.hidden || coins.length>0;
    $('send-coins-empty').textContent = assetOrder.filter(liveCoin).some(coin=>!reported(coin)) ? 'Checking balances…' : 'No assets with a balance yet.';
    $('send-form')?.dispatchEvent(new Event('safecore-send-refresh'));
  }
  function send() {
    if (!envelope) { go('setup'); return; }
    if (mode !== 'unlocked') { go('unlock'); return; }
    sendDraft = null;
    const header = '<div class="page-head transfer-heading"><h1>Send</h1></div><div id="send-picker"></div>';
    if (!sendCoin) { $('main').innerHTML = header; updateSendPicker(); return; }
    const coin = sendCoin, network = E.NETWORKS[coin];
    const automaticFee = !T.policy(coin).flatFee;
    $('main').innerHTML = header +
      `<form id="send-form" class="form-panel"><label for="send-address">Receiving address</label><div class="send-address-row"><input id="send-address" autocomplete="off" spellcheck="false" required maxlength="90"><button id="scan-address" type="button" class="icon-button" aria-label="Scan address QR code" title="Scan address QR code">${icon('camera')}</button></div><section id="scan-panel" aria-label="Scan receiving address" hidden><div class="scan-view"><video id="scan-video" autoplay muted playsinline></video><span id="scan-hint" class="scan-hint">Starting camera…</span></div><button id="cancel-scan" type="button" class="text-button">Cancel scan</button></section><p id="scan-status" class="inline-info" role="status" hidden></p><label for="send-amount">Total to spend (${network.ticker})</label><input id="send-amount" inputmode="decimal" autocomplete="off" required placeholder="0.00"><button id="send-max" type="button" class="text-button" disabled>Max</button><p class="subtle">${!T.policy(coin).flatFee?'Fee based on transaction size; shown before confirmation.'+(coin==='ltc'?' Standard Litecoin only; no MWEB.':''):`Default network fee: 0.01 ${network.ticker}.`}</p><div id="send-estimate" aria-live="polite" class="subtle">Checking available balance…</div><div class="form-actions">${button('review-send','Review transaction','primary')}<a href="#wallet" class="text-button">Cancel</a></div></form>`;
    if(T.supportsOneCoinFee(coin))$('send-estimate').insertAdjacentHTML('beforebegin',
      `<label class="check send-fee-option"><input id="one-coin-fee" type="checkbox"><span>Use 1 ${network.ticker} total fee<small>For many inputs. Replaces the 0.01 ${network.ticker} fee.</small></span></label>`);
    $('send-form').querySelector('p.subtle').textContent = automaticFee
      ? 'Includes the automatic network fee.' + (coin==='ltc'?' Standard Litecoin only; no MWEB.':'')
      : `Default network fee: 0.01 ${network.ticker}.`;
    if(automaticFee)$('send-estimate').insertAdjacentHTML('beforebegin',
      `<div class="automatic-fee"><span>Estimated network fee</span><output id="automatic-fee" aria-live="polite">—</output></div>`);
    $('send-form').querySelector('label[for="send-address"]').textContent = `${network.name} receiving address`;
    const amountLabel = $('send-form').querySelector('label[for="send-amount"]');
    amountLabel.textContent = `Total to spend (${network.ticker})`;
    const amountHeading = document.createElement('div'); amountHeading.className = 'send-amount-heading';
    amountLabel.before(amountHeading); amountHeading.append(amountLabel, $('send-max'));
    updateSendPicker();
    $('review-send').type = 'submit';
    $('review-send').className = 'glow-control';
    $('send-form').querySelector('.form-actions > a').classList.add('glow-control');
    $('scan-address').classList.add('glow-control');
    const viewToken=generation,viewWallet=envelope;
    let quote=null, quotePending=false, feeQuote=null;
    const feeQuoteMs=5*60*1000;
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
      if(snapshot.complete===false)throw Error('Still checking this asset. Try again shortly.');
      const utxos=await N.spendable(snapshot);
      if(!activeView())return null;
      const blocked=new Set(sendAttempts().filter(a=>a.coin===coin).flatMap(a=>a.outpoints));
      if(utxos.length&&utxos.every(u=>blocked.has(u.txid+':'+u.pos)))throw Error('These coins have a previous send attempt. Check its transaction ID in Activity before trying another payment.');
      return {snapshot,utxos:utxos.filter(u=>!blocked.has(u.txid+':'+u.pos))};
    }
    const oneCoinFee=()=>$('one-coin-fee')?.checked===true;
    function build(data,destination,requested){
      if(automaticFee&&(!feeQuote||Date.now()<feeQuote.at||Date.now()-feeQuote.at>=feeQuoteMs))throw Error('Fee estimate expired. Wait for a fresh estimate, then review again.');
      return T.plan({coin,destination,amount:requested,utxos:data.utxos,changeAddress:receivePools[coin][0].address,feeRate:automaticFee?feeQuote.rate:data.snapshot.feeRate,tip:data.snapshot.tip,feeIncluded:true,flatFee:T.policy(coin).flatFee&&!oneCoinFee(),oneCoinFee:oneCoinFee()});
    }
    function estimate(){
      if(!activeView()||!quote)return;
      if($('automatic-fee'))$('automatic-fee').textContent='—';
      if(!$('send-amount').value){$('send-estimate').textContent='Enter a total to see what the recipient receives.';return;}
      try{
        const p=build(quote,$('send-address').value.trim()||receivePools[coin][0].address,$('send-amount').value.trim());
        if($('automatic-fee'))$('automatic-fee').textContent=`${T.format(p.fee)} ${network.ticker}`;
        $('send-estimate').innerHTML=`<strong>You are sending ${T.format(p.amount)} ${network.ticker}</strong>${automaticFee?'':`<br>${p.oneCoinFee?'Selected':'Default'} network fee: ${T.format(p.fee)} ${network.ticker}`}<br>Total deducted: ${T.format(p.amount+p.fee)} ${network.ticker}<br><small>Rechecked before confirmation.</small>`;
      }catch(e){$('send-estimate').textContent=e.message;}
    }
    $('send-address').oninput=estimate;$('send-amount').oninput=estimate;
    if($('one-coin-fee'))$('one-coin-fee').onchange=estimate;
    $('send-max').onclick=()=>{
      if(!quote)return;
      const total=quote.utxos.slice().sort((a,b)=>a.value>b.value?-1:a.value<b.value?1:0).slice(0,oneCoinFee()?T.ONE_COIN_MAX_INPUTS:T.policy(coin).flatFee?T.FLAT_MAX_INPUTS:8).reduce((n,u)=>n+u.value,0n);
      $('send-amount').value=T.format(total);estimate();
    };
    function refreshQuote(){
      if(quotePending||!activeView())return;
      quotePending=true;$('send-max').disabled=true;
      void available().then(data=>{if(data&&activeView()){
        quote=data;
        if(automaticFee)feeQuote={rate:data.snapshot.feeRate,at:Date.now()};
        if(coin==='dingo')$('send-form').querySelector('p.subtle').textContent='Automatic fee per started kB. Recipient minimum: 1 DINGO.';
        if(['bel','bonc','bch','dash','dgb','jkc','lky','rvn','cat','trmp','flop'].includes(coin))$('send-form').querySelector('p.subtle').textContent=data.snapshot.feeSource==='core-minimum'
          ?'Size-based fee using the Core minimum; live estimates unavailable.':'Includes the automatic network fee.';
        $('send-max').disabled=false;estimate();
      }}).catch(e=>{if(activeView()){$('send-estimate').textContent=e.message;if($('automatic-fee'))$('automatic-fee').textContent='Unavailable';}})
        .finally(()=>{quotePending=false;});
    }
    $('send-form').addEventListener('safecore-send-refresh',()=>{
      if(activeView()&&fresh(coin)&&(!quote||automaticFee&&feeQuote&&Date.now()-feeQuote.at>=feeQuoteMs))refreshQuote();
    });
    refreshQuote();
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
        if(automaticFee)plan.feeQuoteExpiresAt=feeQuote.at+feeQuoteMs;
        snapshots[coin] = data.snapshot;
        sendDraft = {plan, walletId:WalletLibrary.id(source)};
        await sendReview();
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
    if(key.coin!==coin||komodoRecovery&&(!WalletKomodo.supports(coin)||!komodoVerified(coin)))throw Error('Komodo recovery is disabled or its session expired.');
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
    document.body.classList.remove('restore-mode','restore-typing');
    sendDraft={plan:p,walletId:WalletLibrary.id(source),sweep:true,komodo:komodoRecovery};await sendReview();
  }
  function komodo(){
    if(mode!=='unlocked'||!WalletKomodo.supports(receiveCoin)||!komodoEnabled()){clearKomodo();clearSweep();go('security');return;}
    if(sweepReceipt){renderSweepReceipt();return;}
    clearSweep();sendDraft=null;
    const token=generation,source=envelope;
    const active=()=>token===generation&&source===envelope&&mode==='unlocked'&&location.hash==='#komodo-sweep'&&!document.hidden&&komodoEnabled();
    const coin=receiveCoin,network=E.NETWORKS[coin];
    const warning='<p class="subtle">Only the selected coin is recovered. KMD, other coins and Komodo HD accounts are not supported. Keep the old backup if it holds other assets.</p>';
    clearKomodo();
    document.body.classList.add('restore-mode');
    $('main').innerHTML=button('restore-back','← Back','text-button')+title('Komodo recovery',`<strong class="komodo-scope">${network.name} (${network.ticker}) only</strong>`)+
      `<form id="komodo-sweep-form" class="form-panel" autocomplete="off"><div class="restore-length"><label for="restore-count">Old Komodo words</label><select id="restore-count"><option value="12">12 words</option><option value="24">24 words</option></select></div><input id="komodo-phrase" type="hidden" hidden><div id="restore-grid" class="restore-grid" role="group" aria-label="Old Komodo words in order"></div><p id="komodo-status" class="inline-info" aria-live="polite"></p><p class="subtle">Enter your old Komodo phrase exactly as backed up.</p><details id="restore-options"><summary>Recovery information</summary>${warning}<p class="subtle">Your phrase stays on this device and is not saved.</p></details><p class="inline-info" id="komodo-recovery-explainer">The recovered ${network.name} will be controlled by this wallet’s new seed phrase. Your old Komodo ${network.name} address will be emptied by the sweep. Do not reuse the old Komodo seed.</p><label class="check"><input id="komodo-backup-ack" type="checkbox" required><span>I have backed up this wallet’s new seed phrase and any extra passphrase.</span></label><p id="sweep-progress" class="notice" role="status" aria-live="polite" hidden></p>${button('review-komodo-sweep','Review Komodo sweep','primary wide')}<a href="#receive" class="text-button">Cancel</a></form><div id="restore-keyboard" class="restore-keyboard" aria-label="Komodo word keyboard" hidden><div id="komodo-suggestions" class="restore-suggestions" role="group" aria-label="Komodo word suggestions"></div></div>`;
    $('restore-back').onclick=()=>go('receive');
    const submit=$('review-komodo-sweep');submit.type='submit';
    const entry=WalletRecovery.attachGrid(ethers,{input:$('komodo-phrase'),grid:$('restore-grid'),count:$('restore-count'),keyboard:$('restore-keyboard'),list:$('komodo-suggestions'),status:$('komodo-status'),mode:'komodo',onEdit:clearError,onValidity:valid=>submit.disabled=busy||!valid});
    komodoEntry=entry;
    $('komodo-sweep-form').onsubmit=async event=>{
      event.preventDefault();if(!active()||busy)return;clearError();
      if(!$('komodo-backup-ack').checked){error('Confirm that you saved your SafeCore backup and understand the recovery destination.');return;}
      if(!entry.valid()){error('Enter the exact 12 or 24 words from your legacy Komodo backup.');return;}
      busy=true;submit.disabled=true;
      try{
        const key=WalletKomodo.key($('komodo-phrase').value,destinationFingerprint,coin);
        entry.destroy();komodoEntry=null;
        const gate={source,coin,epoch:networkEpoch,expires:Date.now()+600000};komodoGate=gate;
        gate.timer=setTimeout(()=>{if(komodoGate===gate){clearKomodo();clearSweep();sendDraft=null;generation++;busy=false;if(location.hash==='#komodo-sweep'){komodo();error('Recovery session expired. Enter the Komodo phrase again.');}}},600000);
        sweepProgress('Checking your receiving address. Please keep this page open…');
        await prepareSweepReview(key,()=>active()&&komodoVerified(),true);
      }catch(e){if(active()){busy=false;clearSweep();komodo();error(e.message);}}
      finally{if(active()){busy=false;if($('sweep-progress'))$('sweep-progress').hidden=true;}}
    };
  }
  function sweep(){
    if(sweepReceipt){renderSweepReceipt();return;}
    clearSweep();sendDraft=null;
    const coin=receiveCoin;
    if(mode!=='unlocked'||!E.NETWORKS[coin]){go('receive');return;}
    const ticker=E.NETWORKS[coin].ticker,token=generation,source=envelope;
    const active=()=>token===generation&&source===envelope&&mode==='unlocked'&&location.hash==='#sweep'&&!document.hidden;
    $('main').innerHTML='<div class="page-head"><h1>Sweep private key</h1></div>'+`<p>Move the full ${ticker} balance from one private key into this wallet.</p><p class="notice">Select the correct asset. Several coins share the same private-key format. The key stays on this device and is not saved.</p><form id="sweep-form" class="form-panel"><label for="sweep-key">Private key (WIF)</label><div class="send-address-row"><input id="sweep-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="52" required><button id="scan-key" type="button" class="icon-button" aria-label="Scan private key QR code">${icon('camera')}</button></div><section id="scan-panel" hidden><div class="scan-view"><video id="scan-video" autoplay muted playsinline></video><span id="scan-hint" class="scan-hint">Starting camera…</span></div><button id="cancel-scan" type="button" class="text-button">Cancel scan</button></section><p id="scan-status" role="status" hidden></p><p class="subtle">Standard WIF keys only. Deposits must be confirmed and mining rewards mature.</p><p class="subtle">Review the estimated network fee before confirming.</p><p id="sweep-progress" class="notice" role="status" aria-live="polite" hidden></p>${button('review-sweep','Review sweep','primary wide')}<a href="#receive" class="text-button">Cancel</a></form>`;
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
  async function sendReview() {
    if (!sendDraft || mode !== 'unlocked') { go('wallet'); return; }
    const reviewDraft=sendDraft,reviewToken=generation;
    const p = sendDraft.plan, ticker = E.NETWORKS[p.coin].ticker;
    const priceQuote=()=>p.coin==='pep'&&pepPrice?{...pepPrice,updated:pepPrice.at}:
      ({btc:btcPrice,ltc:ltcPrice,shic:shicPrice,doge:dogePrice,bel:belPrice,dingo:dingoPrice})[p.coin]||extraQuotes[p.coin]||null;
    const automatic=!T.policy(p.coin).flatFee;
    const refreshFeePrice=()=>p.coin==='pep'?refreshPrice(true):
      ['btc','ltc','shic','doge','bel','dingo',...Object.keys(EXTRA_PRICE_IDS)].includes(p.coin)?refreshShicPrice(true):Promise.resolve();
    if(!WalletReporting.freshShic(priceQuote()))await refreshFeePrice();
    if(reviewDraft!==sendDraft||reviewToken!==generation||mode!=='unlocked')return;
    let approvedFee=null,feeProblem='',priceUnavailable=false,missingPriceAccepted=false;
    try{approvedFee=WalletReporting.feeUsd(p.coin,p.fee,priceQuote());}
    catch(e){feeProblem=e.message;priceUnavailable=e.code==='USD_PRICE_UNAVAILABLE';}
    const feeNotice=()=>feeProblem||(!approvedFee?'':
      `Estimated network fee: ${T.format(p.fee)} ${ticker} (approximately ${approvedFee.display}). `+
      (approvedFee.blocked?'Sending blocked: this fee exceeds $100 USD. Try again later. There is no override.':
       approvedFee.warning?'High fee: more than $5 USD. Check the fee carefully before confirming, or cancel and try again later.':'Check the fee before confirming.'));
    function syncFeeUi(initial=false){
      const notice=$('fee-usd-notice'),override=$('missing-price-option');
      if(notice){notice.textContent=feeNotice();notice.hidden=!feeProblem&&!approvedFee?.warning;}
      if(override){override.hidden=!priceUnavailable;if(!priceUnavailable){missingPriceAccepted=false;$('missing-price-ack').checked=false;}}
      if($('broadcast-send')&&(!busy||initial)){
        $('broadcast-send').disabled=Boolean(approvedFee?.blocked||feeProblem&&(!priceUnavailable||!missingPriceAccepted));
        $('broadcast-send').textContent=approvedFee?.blocked?'Fee exceeds $100 — try again later':
          feeProblem&&!missingPriceAccepted?'USD price unavailable — acknowledgment required':reviewDraft.sweep?'Confirm sweep':'Confirm and send';
      }
    }
    const checkFee=()=>{
      if(automatic&&!reviewDraft.sweep&&(!Number.isSafeInteger(p.feeQuoteExpiresAt)||Date.now()>=p.feeQuoteExpiresAt))throw Error('Fee estimate expired. Build a fresh transaction.');
      let current;
      try{current=WalletReporting.feeUsd(p.coin,p.fee,priceQuote());}
      catch(e){
        feeProblem=e.message;priceUnavailable=e.code==='USD_PRICE_UNAVAILABLE';approvedFee=null;syncFeeUi();
        if(!priceUnavailable||!missingPriceAccepted){$('send-ack').checked=false;throw e;}
        return; // Only the USD comparison is waived, never network fee validation.
      }
      feeProblem='';priceUnavailable=false;
      const increased=current.warning&&(!approvedFee||!approvedFee.warning||current.cents>approvedFee.cents);
      approvedFee=current;syncFeeUi();
      if(current.blocked)throw Error(feeNotice());
      if(increased){
        $('send-ack').checked=false;
        throw Error('The estimated USD fee increased. Check the updated fee and confirm again, or try again later.');
      }
    };
    const sweeping=sendDraft.sweep===true;
    if(sendDraft.komodo&&(!WalletKomodo.supports(p.coin)||!komodoVerified(p.coin))){clearSweep();clearKomodo();sendDraft=null;go('security');return;}
    $('main').innerHTML = title(sweeping?'Review sweep':'Review transaction', 'Nothing has been sent yet.', protectionIcon(protectedWallet(envelope))) +
      (sweeping?`<p class="subtle">From external ${ticker} address: <code>${escape(sweepState.key.address)}</code><br>Into your wallet, Address #${sweepState.destinationIndex+1}. The key will not be saved.</p><p class="subtle">Full source balance: ${T.format(p.budget)} ${ticker}.</p>`:'')+
      (sweeping?`<p class="notice" id="sweep-fee-estimate">Estimated network fee: <strong>${T.format(p.fee)} ${ticker}</strong>, deducted from the swept balance.</p>`:`<p class="notice">You are sending <strong>${T.format(p.amount)} ${ticker}</strong> to the recipient.</p>`)+`<div class="details send-review"><div class="detail-row"><span>Network</span><strong>${E.NETWORKS[p.coin].name} mainnet</strong></div><div class="detail-row"><span>Recipient</span><code>${escape(p.destination)}</code></div><div class="detail-row"><span>${sweeping?'Your wallet receives':'Recipient receives'}</span><strong>${T.format(p.amount)} ${ticker}</strong></div><div class="detail-row"><span>${sweeping||automatic?'Estimated network fee (included)':p.oneCoinFee?'Selected network fee (included)':'Default network fee (included)'}</span><strong>${T.format(p.fee)} ${ticker}</strong></div><div class="detail-row"><span>Total deducted</span><strong>${T.format(p.amount+p.fee)} ${ticker}</strong></div><div class="detail-row"><span>Change returned</span><strong>${T.format(p.change)} ${ticker}</strong></div>${p.change ? `<div class="detail-row"><span>Change address</span><code>${escape(p.changeAddress)}</code></div>` : ''}</div>
      <p class="subtle">${sweeping?'All source funds, minus the fee, go to your reviewed wallet address.':'Change returns to your first receiving address. This reuses an address.'} The review expires after 90 seconds.</p>
      <form id="broadcast-form" class="form-panel">${protectedWallet(envelope) ? '<label for="send-password">Wallet password</label><input id="send-password" type="password" required autocomplete="current-password">' : '<p class="notice">Password lock is off for this wallet.</p>'}<label class="check"><input id="send-ack" type="checkbox" required><span>${sweeping?'I checked the estimated fee and receiving address. Sweep into my wallet.':'I checked the address, network, amount and fee. Send this real test transaction.'}</span></label>${sweeping?'<p id="sweep-progress" class="notice" role="status" aria-live="polite" hidden></p>':''}${button('broadcast-send',sweeping?'Confirm sweep':'Confirm and send','primary wide')}<a class="text-button coin-empty-link" href="#wallet">Cancel</a></form>`;
    if(sendDraft.komodo){
      $('broadcast-form').insertAdjacentHTML('beforebegin',`<p class="notice" id="komodo-review-warning">This empties the displayed old Komodo ${E.NETWORKS[p.coin].ticker} address of the reviewed spendable funds, minus the fee. Your current SafeCore seed controls the recovered ${E.NETWORKS[p.coin].ticker}. Do not reuse the Komodo seed or address. Other coins and HD accounts are not moved; keep the old backup until they are recovered.</p>`);
      $('send-ack').nextElementSibling.textContent=`I recognize my old Komodo ${E.NETWORKS[p.coin].ticker} address, checked the destination and fee, and saved my SafeCore backup for the recovered funds. I will not reuse the old Komodo seed.`;
    }
    if(p.oneCoinFee)$('broadcast-form').insertAdjacentHTML('beforebegin',`<p id="one-coin-fee-notice" class="notice">You selected a total network fee of <strong>1 ${ticker}</strong>, replacing the default 0.01 ${ticker}. This fee is included in the total deducted.</p>`);
    $('broadcast-form').insertAdjacentHTML('beforebegin','<p id="fee-usd-notice" class="notice" role="alert" hidden></p>');
    $('send-ack').closest('label').insertAdjacentHTML('beforebegin',`<label id="missing-price-option" class="check" hidden><input id="missing-price-ack" type="checkbox"><span>Override the unavailable USD fee check for this transaction.<small>I accept the displayed ${T.format(p.fee)} ${ticker} network fee without the $5 warning or $100 limit. Its dollar value could exceed $100.</small></span></label>`);
    $('missing-price-ack').onchange=()=>{missingPriceAccepted=priceUnavailable&&$('missing-price-ack').checked;syncFeeUi();};
    $('broadcast-send').type = 'submit';syncFeeUi(true);
    $('broadcast-form').onsubmit = async event => {
      event.preventDefault(); if (busy || !sendDraft || !$('send-ack').checked) return;
      const token = generation, source = envelope, draft = sendDraft;
      const password = $('send-password')?.value || '';
      busy = true; clearError(); $('broadcast-send').disabled = true; $('broadcast-send').textContent = 'Checking and signing locally…';
      if(sweeping)sweepProgress('Rechecking the source balance and fee. Please do not close this page or submit again…');
      let attempted = null;
      const attemptKey = 'corevault.send-attempts.' + WalletLibrary.id(source);
      try {
        if(draft.komodo&&(!WalletKomodo.supports(p.coin)||!komodoVerified(p.coin)))throw Error('Komodo recovery is disabled or the session expired. Enter the Komodo phrase again.');
        if (draft.walletId !== WalletLibrary.id(source) || Date.now()-p.createdAt > 90000 || !liveEnabled()) throw Error('Review expired or wallet changed. Build a fresh transaction.');
        if(priceUnavailable)await refreshFeePrice();
        if(token!==generation||source!==envelope||draft!==sendDraft)return;
        checkFee();
        if(window.SafeCorePlatform?.authenticateWalletAction)await SafeCorePlatform.authenticateWalletAction('send');
        if(token!==generation||source!==envelope)return;
        const candidate = E.validateRecipe(ethers,await E.decrypt(crypto,source,password));
        if (token !== generation || source !== envelope) return;
        await N.checkInputs(p.coin,p.inputs);
        if (token !== generation || source !== envelope || !liveEnabled()) return;
        if(p.oneCoinFee){
          const relay=await N.client(p.coin).call('blockchain.relayfee');
          if(!Number.isFinite(relay)||relay<0||relay>Number(T.policy(p.coin).maxRate)/1e8)throw Error('Could not verify the current relay requirement for the 1-coin fee. Try again later.');
          if(token!==generation||source!==envelope||!liveEnabled())return;
          T.plan({coin:p.coin,destination:p.destination,amount:T.format(p.budget),utxos:p.inputs,changeAddress:p.changeAddress,
            feeRate:BigInt(Math.max(Number(T.policy(p.coin).minRate),Math.ceil(relay*1e8))),tip:p.tip,feeIncluded:true,oneCoinFee:true});
        }
        if (Date.now()-p.createdAt > 90000) throw Error('Review expired. Build a fresh transaction.');
        let signed;
        if(draft.sweep){
          const state=sweepState;if(!state?.key)throw Error('Sweep key cleared. Scan or enter it again.');
          const current=await N.sweepSource(p.coin,state.key.address,{compressed:state.key.compressed});
          if(token!==generation||source!==envelope||sweepState!==state||!state.key)return;
          const identity=items=>items.map(u=>u.txid+':'+u.pos+':'+u.value).sort().join('|');
          if(identity(current.utxos)!==identity(p.inputs))throw Error('Source outputs changed. Build a fresh sweep review.');
          if(T.sweepFee(p.estimatedBytes,current.snapshot.feeRate,p.coin).requiredFee>p.fee)throw Error('The required network fee increased beyond the reviewed cushion. Build a fresh sweep review.');
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
          if(draft.komodo&&!komodoVerified())throw Error('Komodo session expired or recovery was disabled.');
          signed=T.signSweep(p,state.key,candidate,state.destinationIndex);
        }else signed=T.sign(p,candidate);
        if(automatic&&!draft.sweep){
          const relay=await N.client(p.coin).call('blockchain.relayfee');
          if(token!==generation||source!==envelope||!liveEnabled())return;
          if(!Number.isFinite(relay)||relay<0||relay>Number(T.policy(p.coin).maxRate)/1e8)throw Error('Could not verify the current relay fee. Try again later.');
          const rate=BigInt(Math.max(Number(T.policy(p.coin).minRate),Math.ceil(relay*1e8)));
          const billedBytes=T.policy(p.coin).roundKilobyte?Math.ceil(signed.raw.length/2/1000)*1000:signed.raw.length/2;
          if((BigInt(billedBytes)*rate+999n)/1000n>p.fee)throw Error('The network now requires a higher fee. Build a fresh review; your fee has not been changed.');
          checkFee();
        }
        // Record before the broadcast. An uncertain response must never auto-retry.
        const outpoints = p.inputs.map(i=>i.txid+':'+i.pos);
        await withWalletLock(() => {
          if(draft.komodo&&!komodoVerified())throw Error('Komodo session expired or recovery was disabled.');
          if (token !== generation || source !== envelope || walletStorage.getItem(STORE) !== JSON.stringify(source) || !liveEnabled() || Date.now()-p.createdAt > 90000) throw Error('Wallet changed or review expired. Build a fresh transaction.');
          checkFee();
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
        if ($('broadcast-send')) {
          syncFeeUi();
          if(attempted){$('broadcast-send').disabled=true;$('broadcast-send').textContent='Check transaction status before retrying';}
        }
      }
    };
  }
  const title = (name, description, action = '') => `<div class="page-head"><div><p class="eyebrow">SAFECORE · MULTI-COIN</p><h1>${name}</h1><p class="subtle">${description}</p></div>${action}</div>`;
  const protectionIcon = protectedMode => `<span id="seed-lock" class="seed-lock ${protectedMode ? 'protected' : 'unprotected'}" role="img" aria-label="${protectedMode ? 'Password protected' : 'No password protection'}" title="${protectedMode ? 'Password protected' : 'No password protection'}">${icon(protectedMode ? 'lock' : 'unlock')}</span>`;
  // Navigation and review utilities share one style; final approvals and
  // destructive actions intentionally retain their primary/danger treatment.
  const glowUtilities=new Set(['security-cta','add-wallet','setup-security','receive-setup','wallet-information','information-back','hide-seed','cancel-setup','review-sweep','review-komodo-sweep']);
  const button = (id, text, kind = '', glyph = '') => {
    if(glowUtilities.has(id))kind=[...new Set([...kind.split(/\s+/).filter(c=>c&&c!=='primary'),'glow-control'])].join(' ');
    return `<button id="${id}" class="${kind}"><span class="button-content">${glyph ? icon(glyph) : ''}${text}</span></button>`;
  };
  const recoveryNotice = '<div class="notice">Your recovery phrase controls your funds. Keep a backup somewhere safe and never share it.</div>';
  function bindCoins() {
    document.querySelectorAll('[data-coin]').forEach(el => el.addEventListener('click', () => {
      receiveCoin = el.dataset.coin; render();
      $('receive-selected-name')?.focus({preventScroll:true});window.scrollTo(0,0);
    }));
  }
  function activityRows(coinFilter = null) {
    if (mode !== 'demo' && liveEnabled()) {
      const coins = (coinFilter ? [coinFilter] : assetOrder).filter(liveCoin);
      let attempts;
      try { attempts = sendAttempts(); } catch (e) { return `<p class="notice">${escape(e.message)}</p>`; }
      const listings=coins.map(coin => {
        const snap = snapshots[coin];
        // Reconcile saved sends against all history; paginate only the display.
        const history = snap ? [...new Map(snap.rows.flatMap(r=>r.history).map(h=>[h.tx_hash,h])).values()].sort((a,b)=>(b.height>0?b.height:Infinity)-(a.height>0?a.height:Infinity)) : [];
        const seen = new Set(history.map(h=>h.tx_hash));
        const pages=Math.max(1,Math.ceil(history.length/10)),page=Math.max(1,Math.min(activityPages[coin]||1,pages));
        activityPages[coin]=page;
        const txLink=hash=>EXPLORERS[coin]&&/^[0-9a-f]{64}$/i.test(hash)?`<a href="${EXPLORERS[coin]}${hash.toLowerCase()}${coin==='pep'?'/':''}" target="${window.SafeCorePlatform?'_self':'_blank'}" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="View ${escape(E.NETWORKS[coin].name)} transaction ${hash}"><code>${hash}</code></a>`:`<code>${escape(hash)}</code>`;
        const outstanding=attempts.filter(a=>a.coin===coin&&!seen.has(a.txid));
        if(!history.length&&!outstanding.length)return '';
        const recorded = outstanding.map(a=>`<div class="live-tx">${txLink(a.txid)}<small>${a.status==='unknown' ? 'Submission uncertain — do not resend until checked.' : 'Submitted — awaiting appearance in server history.'}</small></div>`).join('');
        const rows=snap ? (history.slice((page-1)*10,page*10).map(h=>`<div class="live-tx">${txLink(h.tx_hash)}<small>${h.height>0 ? `${Math.max(0,snap.tip-h.height+1)} confirmations` : 'Pending'}</small></div>`).join('') || (!outstanding.length?'<p class="subtle">No transactions yet.</p>':'')) : `<p class="subtle">${networkErrors[coin] ? 'Unable to refresh. Try again shortly.' : 'Checking transactions…'}</p>`;
        const pager=pages>1?`<form class="activity-pager" data-page-coin="${coin}" aria-label="${E.NETWORKS[coin].name} history pages"><button type="button" data-page-step="-1" ${page===1?'disabled':''}>Previous</button><div class="activity-page-jump"><label>Page <input type="number" inputmode="numeric" min="1" max="${pages}" step="1" value="${page}" required aria-label="${E.NETWORKS[coin].name} history page"></label><span class="activity-page-total">of ${pages}</span><button type="submit">Go</button></div><button type="button" data-page-step="1" ${page===pages?'disabled':''}>Next</button></form>`:'';
        return `<details class="activity-asset" data-activity-coin="${coin}"><summary class="coin-picker">${coinMark(coin)}<span>${E.NETWORKS[coin].name}<small>${E.NETWORKS[coin].ticker}</small></span><span class="picker-chevron" aria-hidden="true"></span></summary><div class="activity-outstanding" ${recorded?'':'hidden'}>${recorded}</div><div class="activity-list" role="region" aria-label="${E.NETWORKS[coin].name} transaction history">${snap&&!fresh(coin)?`<p class="subtle">Last updated ${escape(new Date(snap.at).toLocaleString())}</p>`:''}${rows}</div>${pager}</details>`;
      }).join('');
      const status=mode==='locked'?'Unlock your wallet to refresh transaction history.':connectionProblem||coins.some(coin=>networkErrors[coin])?'Some transaction history could not be refreshed. Try again shortly.':coins.some(coin=>!fresh(coin))?'Checking transactions…':!listings?'No transactions yet.':'';
      return listings+`<p id="activity-status" class="subtle" role="status" ${status?'':'hidden'}>${escape(status)}</p>`;
    }
    return `<div class="empty">${icon('activity')}<br>Your transactions will appear here.</div>`;
  }
  function patchOverview(html){
    // Overview contains no editable fields. Patch its existing nodes so live
    // balances don't discard keyboard focus, taps or running glow animations.
    const next=document.createElement('template');next.innerHTML=html;
    function patch(parent,desired){
      for(let i=0;i<desired.childNodes.length;i++){
        const b=desired.childNodes[i],a=parent.childNodes[i];
        if(!a){parent.appendChild(b.cloneNode(true));continue;}
        const same=a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName&&a.id===b.id&&a.getAttribute('data-overview-coin')===b.getAttribute('data-overview-coin'));
        if(!same){a.replaceWith(b.cloneNode(true));continue;}
        if(a.nodeType!==1){if(a.nodeValue!==b.nodeValue)a.nodeValue=b.nodeValue;continue;}
        for(const attr of [...a.attributes])if(!b.hasAttribute(attr.name))a.removeAttribute(attr.name);
        for(const attr of b.attributes)if(a.getAttribute(attr.name)!==attr.value)a.setAttribute(attr.name,attr.value);
        patch(a,b);
      }
      while(parent.childNodes.length>desired.childNodes.length)parent.lastChild.remove();
    }
    patch($('main'),next.content);
  }
  function overview() {
    const visible = visibleCoins();
    if (!visible.length) {
      $('main').innerHTML = '<p id="coin-empty" class="subtle">No coins shown. Use Add coins above to choose assets.</p>' + (mode === 'demo' ? '<a id="security-cta" href="#setup" class="text-button">Create or restore a wallet →</a>' : '');
      return;
    }
    const now=Date.now(),conversion=WalletReporting.displayQuote(displayPrices.usdt,now);
    const displayed=Object.fromEntries(assetOrder.map(coin=>[coin,WalletReporting.displayQuote(displayPrices[coin],now)]));
    const pepUsd=displayed.pep.value,usdtUsd=conversion.value;
    const shicUsd=displayed.shic.value,ltcUsd=displayed.ltc.value,dogeUsd=displayed.doge.value;
    const btcUsd=displayed.btc.value,belUsd=displayed.bel.value,dingoUsd=displayed.dingo.value;
    const extraUsd=Object.fromEntries(Object.keys(EXTRA_PRICE_IDS).map(coin=>[coin,displayed[coin]?.value??null]));
    const lastKnown=coin=>usdtUsd!==null&&displayed[coin]?.value!=null&&(conversion.stale||displayed[coin].stale);
    const oldestPrice=coin=>[displayPrices[coin],displayPrices.usdt].reduce((a,b)=>Math.min(a.at,a.updated)<=Math.min(b.at,b.updated)?a:b);
    const valuation=WalletReporting.worth(Object.fromEntries(assetOrder.filter(liveCoin).map(c=>[c,reported(c)])),pepUsd,usdtUsd,shicUsd,ltcUsd,dogeUsd,btcUsd,belUsd,dingoUsd,extraUsd);
    const worth=WalletReporting.formatWorth(valuation.value);
    const hidden=balancesHidden();
    const stalePrices=assetOrder.filter(liveCoin).filter(coin=>{const s=reported(coin);return s&&s.confirmed+s.unconfirmed>0n&&lastKnown(coin);}).map(oldestPrice);
    const oldest=stalePrices.sort((a,b)=>Math.min(a.at,a.updated)-Math.min(b.at,b.updated))[0];
    const heading = `<div class="page-head home-heading"><section class="wallet-worth" aria-label="Estimated wallet value"><small>Wallet value</small><div id="wallet-worth">${hidden?hiddenBalance:(valuation.value!==null?'≈ ':'')+escape(worth)} <span>USDT${valuation.incomplete&&valuation.value!==null?'*':''}</span></div>${oldest&&!hidden?`<small id="wallet-price-status">Last known · ${WalletReporting.formatPriceAge(oldest,now)}</small>`:''}</section></div>`;
    const rescanControl=mode==='unlocked'?`<div class="overview-actions"><button id="rescan" class="overview-rescan glow-control" ${rescanning?'disabled':''}>${rescanning?'Rescanning…':'Rescan'}</button></div>`:'';
    const holdings=`<section class="holdings" aria-label="Coin balances"><h2>Your coins</h2>${visible.map(coin=>{
      const n=COINS[coin],s=reported(coin),total=s?s.confirmed+s.unconfirmed:null;
      const unitPrice=WalletReporting.valueInUsdt(coin,100000000n,pepUsd,usdtUsd,shicUsd,ltcUsd,dogeUsd,btcUsd,belUsd,dingoUsd,extraUsd);
      const price=unitPrice!==null?WalletReporting.formatUnitPrice(unitPrice)+' USDT'+(lastKnown(coin)?` · Last known · ${WalletReporting.formatPriceAge(oldestPrice(coin),now)}`:''):'*';
      const estimate=total!==null?WalletReporting.valueInUsdt(coin,total,pepUsd,usdtUsd,shicUsd,ltcUsd,dogeUsd,btcUsd,belUsd,dingoUsd,extraUsd):null;
      const value=estimate!==null?WalletReporting.formatWorth(estimate)+' USDT':'*';
      const status=!liveCoin(coin)?'Set a custom connection in Settings.':connectionProblem?'Check connection settings.':s?[s.unconfirmed?hidden?'Pending':`Pending ${T.formatDisplay(s.unconfirmed)} ${n.ticker}`:'',networkErrors[coin]?'Unable to refresh':''].filter(Boolean).join(' · '):n.comingSoon?'':!envelope?'Create a wallet to get started.':mode==='locked'?'Open wallet to refresh.':networkErrors[coin]?'Unable to refresh':'Checking balance…';
      return `<button type="button" class="holding-row" data-overview-coin="${coin}" aria-label="${!liveCoin(coin)?n.name+' connection required':'View '+n.name}" ${!liveCoin(coin)?'disabled':''}>${coinMark(coin)}<span class="holding-name"><strong>${n.name}</strong><small>${n.comingSoon?'Coming soon':price}</small><small class="holding-status">${status}</small></span><span class="holding-values"><strong class="holding-balance">${hidden?hiddenBalance:total!==null?T.formatDisplay(total):'*'} <small>${n.ticker}</small></strong><small>${hidden?hiddenBalance:n.comingSoon?'*':value}</small></span></button>`;
    }).join('')}<p class="subtle holdings-note">* Price not available</p></section>`;
    const full=assetOrder.filter(liveCoin).filter(c=>receiveBooks?.[c]?.view().exhausted);
    patchOverview(heading + full.map(c=>`<p class="notice">${E.NETWORKS[c].ticker} wallet addresses are full (200 used). Existing addresses still receive funds. Create another wallet for new addresses.</p>`).join('') + holdings + rescanControl + (mode === 'demo' ? button('security-cta','Create or restore a wallet','wide home-security','plus') : ''));
    if($('rescan'))$('rescan').onclick=async()=>{
      if(rescanning)return;rescanning=true;const epoch=networkEpoch;clearError();overview();
      try{let complete=true;for(const coin of assetOrder.filter(liveCoin)){if(epoch!==networkEpoch)return;const before=fullScanCompletions[coin]||0;await refreshLive(coin,true);if((fullScanCompletions[coin]||0)===before)complete=false;}if(epoch===networkEpoch)toast(!complete||Object.keys(networkErrors).length?'Rescan incomplete. Check your connection and try again.':'Rescan complete: checked 200 addresses per asset.');}
      finally{if(epoch===networkEpoch){rescanning=false;if(['','#wallet'].includes(location.hash))render();}}
    };
    document.querySelectorAll('[data-overview-coin]').forEach(el=>el.onclick=()=>{
      if(!E.NETWORKS[el.dataset.overviewCoin]||!liveCoin(el.dataset.overviewCoin))return;
      go('asset/'+el.dataset.overviewCoin);
    });
    if ($('security-cta')) $('security-cta').onclick = () => go('setup');
  }
  function assetDetail(){
    const coin=selectedAsset();
    if(!coin){history.replaceState(null,'','#wallet');render();return;}
    const n=COINS[coin],s=reported(coin),total=s?s.confirmed+s.unconfirmed:null,hidden=balancesHidden();
    const now=Date.now(),q=WalletReporting.displayQuote(displayPrices[coin],now),conversion=WalletReporting.displayQuote(displayPrices.usdt,now);
    const value=total===null?null:WalletReporting.convertValue(total,q.value,conversion.value);
    const stale=value!==null&&(q.stale||conversion.stale);
    const older=stale?[displayPrices[coin],displayPrices.usdt].sort((a,b)=>Math.min(a.at,a.updated)-Math.min(b.at,b.updated))[0]:null;
    const ready=mode==='unlocked'&&liveCoin(coin)&&!connectionProblem;
    const status=!liveCoin(coin)?'Set a custom connection in Settings.':connectionProblem?'Check connection settings.':mode!=='unlocked'?'Unlock your wallet to refresh.':networkErrors[coin]?'Unable to refresh balance. Showing the last available balance.':!s?'Checking balance…':s.unconfirmed?hidden?'Pending transaction':`${T.formatDisplay(s.unconfirmed)} ${n.ticker} pending`:'';
    patchOverview(`<div class="asset-detail" data-asset="${coin}"><a id="asset-back" href="#wallet" class="text-button">← Overview</a>
      <div class="asset-focus"><section class="asset-summary" aria-labelledby="asset-name">${coinMark(coin)}<h1 id="asset-name">${escape(n.name)}</h1>
      <div id="asset-balance" class="asset-balance">${hidden?hiddenBalance:total!==null?T.formatDisplay(total):'—'}</div>
      <div id="asset-worth" class="asset-worth">${hidden?hiddenBalance:value!==null?'≈ '+WalletReporting.formatWorth(value)+' USDT':'Price unavailable'}</div>
      <p id="asset-price-age" class="subtle" ${stale&&!hidden?'':'hidden'}>${stale&&!hidden?'Last known · '+WalletReporting.formatPriceAge(older,now):''}</p>
      <p id="asset-status" class="subtle" ${status?'':'hidden'}>${escape(status)}</p></section>
      <div class="asset-actions">${button('asset-receive','Receive','glow-control', 'receive')}${button('asset-send','Send','glow-control','send')}</div>
      ${mode==='locked'?'<a href="#unlock" class="text-button asset-unlock">Unlock wallet</a>':''}</div></div>`);
    $('asset-receive').disabled=!ready;$('asset-send').disabled=!ready||total===null||total<=0n;
    $('asset-receive').onclick=()=>{if(selectedAsset()!==coin||!ready)return;receiveCoin=coin;go('receive');};
    $('asset-send').onclick=()=>{if(selectedAsset()!==coin||!ready||!fundedCoins().includes(coin))return;assetSendSelection={coin,source:envelope,epoch:networkEpoch};go('send');};
  }
  function coins() {
    $('main').innerHTML = `<div class="page-head"><h1>Coins</h1><a class="text-button" href="#wallet">Done</a></div>
      <label class="coin-search-label" for="coin-search">Find a coin</label><input id="coin-search" type="search" placeholder="Search name or symbol" autocomplete="off" maxlength="80">
      <p class="subtle coin-help">Show or hide coins on your home screen. Your keys and addresses stay unchanged.</p>
      <div id="coin-results"></div><p id="coin-result-count" class="subtle" role="status" aria-live="polite"></p>`;
    function results() {
      const query = $('coin-search').value.trim().toLowerCase();
      const matches = Object.entries(COINS).filter(([coin])=>catalogEnabled(coin)).filter(([,n]) => `${n.name} ${n.ticker}`.toLowerCase().includes(query));
      $('coin-results').innerHTML = matches.map(([coin,n]) => `<div class="coin-row">
        <button class="coin-choice" data-select-coin="${coin}" aria-label="Select ${n.name}" ${n.comingSoon?'disabled':''}>${coinMark(coin)}<span>${n.name}<small>${n.ticker}${n.comingSoon ? ' · Network unavailable' : ''}</small></span></button>
        ${n.comingSoon?'<small class="subtle">Send and receive unavailable</small>':`<label class="coin-visibility"><input type="checkbox" data-show-coin="${coin}" ${hiddenCoins.includes(coin) ? '' : 'checked'}><span>Show ${n.name} on home</span></label>`}</div>`).join('');
      $('coin-result-count').textContent = matches.length ? `${matches.length} coin${matches.length === 1 ? '' : 's'}` : 'No coins match your search.';
      document.querySelectorAll('[data-show-coin]').forEach(el => el.onchange = () => {
        const coin = el.dataset.showCoin;
        const next = el.checked ? hiddenCoins.filter(c => c !== coin) : [...hiddenCoins, coin];
        try { localStorage.setItem(coinPrefsKey(), JSON.stringify(next)); hiddenCoins = next; results(); document.querySelector(`[data-show-coin="${coin}"]`).focus(); }
        catch (_) { el.checked = !el.checked; error('Could not save coin visibility on this browser.'); }
      });
      document.querySelectorAll('[data-select-coin]').forEach(el => el.onclick = () => {
        const coin = el.dataset.selectCoin;
        if (!Object.hasOwn(E.NETWORKS,coin)||!catalogEnabled(coin)) return;
        try {
          const next = hiddenCoins.filter(c => c !== coin);
          localStorage.setItem(coinPrefsKey(), JSON.stringify(next)); hiddenCoins = next;
          go('wallet');
        } catch (_) { error('Could not save coin visibility on this browser.'); }
      });
    }
    $('coin-search').oninput = results;
    results();
  }
  function receive() {
    const visible = visibleCoins().filter(liveCoin);
    if (!visible.length) {
      $('main').innerHTML = '<div class="page-head transfer-heading"><h1>Receive</h1></div><a class="text-button" href="#coins">Add coins →</a>'; return;
    }
    if (!visible.includes(receiveCoin)) receiveCoin = null;
    const coin = receiveCoin;
    const selector = `<section class="wallet-coin-switch" aria-labelledby="receive-coin"><h2 id="receive-coin">Choose an asset</h2><div class="wallet-coin-options">${visible.map(coin => `<button data-coin="${coin}" aria-pressed="${coin===receiveCoin}">${coinMark(coin)}<span>${COINS[coin].name}<small>${COINS[coin].ticker}</small></span></button>`).join('')}</div></section>`;
    if (!coin) {
      $('main').innerHTML = '<div class="page-head transfer-heading"><h1>Receive</h1></div>' + selector;
      bindCoins(); return;
    }
    const book = receiveBooks?.[coin], view = book?.view();
    const receivingRow=snapshots[coin]?.rows[view?.index];
    const receivingReady=liveSnapshot(coin)&&receivingRow&&receivingRow.checked!==false;
    const waitingLive = liveEnabled() && mode === 'unlocked' && !receivingReady;
    // Ownership comes from local authenticated derivation, not Electrum history.
    // Unknown/stale history must not hide our own address or claim it is unused.
    const account = view && mode==='unlocked' && !(view.exhausted && view.automatic) ? view.account : null;
    const selected=`<section class="receive-selected-coin" aria-labelledby="receive-selected-name"><a id="receive-overview" href="#wallet" class="text-button">← Overview</a><div class="receive-selected-label">${coinMark(coin)}<span><strong id="receive-selected-name" tabindex="-1">${escape(COINS[coin].name)}</strong><small>${COINS[coin].ticker}</small></span></div></section>`;
    $('main').innerHTML = '<div class="page-head transfer-heading"><h1>Receive</h1></div>' + selected +
      `<section class="receive-card"><div id="qr" class="qr">${account ? '' : `<div class="qr-empty">${icon('lock')}<span>${waitingLive ? escape(connectionProblem || networkErrors[coin] || 'Checking receiving-address history…') : view?.exhausted ? 'Wallet addresses are full (200 used). Existing addresses still work.' : mode === 'locked' ? 'Open your wallet to see its address' : 'Create or restore a wallet first'}</span></div>`}</div>
      <div class="address-navigation">${button('previous-address','← Previous','text-button')}<span id="address-number">Address #${(view?.index || 0) + 1}</span>${button('next-address','Next →','text-button')}</div>
      ${account ? `<code class="address" id="address">${escape(account.address)}</code>${button('copy-address','Copy address','wide glow-control','copy')}` : `<h2>No payment address yet</h2>${view?.exhausted || waitingLive ? '' : button('receive-setup',mode === 'locked' ? 'Open wallet' : 'Create or restore','primary')}`}
      </section><label class="check reuse-check"><input id="reuse-first" type="checkbox" ${view?.pinned ? 'checked' : ''} ${!book ? 'disabled' : ''}><span><strong>Keep using the first address</strong><small>Use the same receiving address until you uncheck this.</small></span></label>
      ${view?.browsing ? button('latest-address','Return to current address','text-button') : ''}
      <p class="subtle">${view?.pinned ? 'Receiving is locked to Address #1 until you uncheck this.' : 'A new address becomes available after a payment arrives. Previous addresses still work.'}</p>${view?.exhausted?'<p class="notice">Wallet addresses are full (200 used). You can keep receiving at existing addresses, or create another wallet.</p>':''}${mode==='unlocked'?button('sweep-open','Sweep private key','wide glow-control'):''}`;
    if($('sweep-open')){
      $('sweep-open').onclick=()=>go('sweep');
      if(WalletKomodo.supports(coin)&&komodoEnabled()){
        $('sweep-open').insertAdjacentHTML('afterend',button('komodo-open','Sweep Komodo seed','wide glow-control'));
        $('komodo-open').onclick=()=>go('komodo-sweep');
      }
    }
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
      if(waitingLive)$('qr').insertAdjacentHTML('afterend','<p id="receive-history-status" class="subtle">Address verified locally. History refresh pending.</p>');
      new QRCode($('qr'), { text: account.address, width:184, height:184, colorDark:'#0b1724', colorLight:'#ffffff', correctLevel: QRCode.CorrectLevel.M });
      $('copy-address').onclick = async () => {
        try { if(window.SafeCorePlatform)await SafeCorePlatform.copyAddress(account.address);else await navigator.clipboard.writeText(account.address); toast('Address copied.'); }
        catch (_) { error('Clipboard access was denied. Select the address to copy it manually.'); }
      };
    } else if ($('receive-setup')) $('receive-setup').onclick = () => go(mode === 'locked' ? 'unlock' : 'setup');
  }
  function activity() {
    const current=[...document.querySelectorAll('[data-activity-coin]')];
    const expanded=new Set(current.filter(el=>el.open).map(el=>el.dataset.activityCoin));
    const content=document.createElement('template');
    content.innerHTML='<div class="page-head transfer-heading"><h1>Activity</h1></div><div class="wallet-coin-switch activity-coin-heading"><h2>Choose an asset</h2></div>'+activityRows();
    const next=[...content.content.querySelectorAll('[data-activity-coin]')];
    if(current.length&&current.length===next.length&&current.every((el,i)=>el.dataset.activityCoin===next[i].dataset.activityCoin)){
      // Keep expanded sections and paging controls attached across refreshes,
      // preserving the page position and focused input without nested scrolling.
      current.forEach((el,i)=>{
        const list=el.querySelector('.activity-list'),html=next[i].querySelector('.activity-list').innerHTML;
        if(list.innerHTML!==html)list.innerHTML=html;
        const outstanding=el.querySelector('.activity-outstanding'),updated=next[i].querySelector('.activity-outstanding');
        if(outstanding.innerHTML!==updated.innerHTML)outstanding.innerHTML=updated.innerHTML;
        outstanding.hidden=updated.hidden;
        const pager=el.querySelector('.activity-pager'),nextPager=next[i].querySelector('.activity-pager');
        if(pager&&nextPager){
          for(const step of ['-1','1'])pager.querySelector(`[data-page-step="${step}"]`).disabled=nextPager.querySelector(`[data-page-step="${step}"]`).disabled;
          const input=pager.querySelector('input'),nextInput=nextPager.querySelector('input');
          input.max=nextInput.max;if(document.activeElement!==input)input.value=nextInput.value;
          pager.querySelector('.activity-page-total').textContent=nextPager.querySelector('.activity-page-total').textContent;
        }else if(pager)pager.remove();else if(nextPager)el.append(nextPager);
      });
      const status=$('activity-status'),nextStatus=content.content.querySelector('#activity-status');
      if(status&&nextStatus){status.textContent=nextStatus.textContent;status.hidden=nextStatus.hidden;}
    }else {
      $('main').replaceChildren(content.content);
      document.querySelectorAll('[data-activity-coin]').forEach(el=>{el.open=expanded.has(el.dataset.activityCoin);});
    }
    document.querySelector('.activity-coin-heading').hidden=!next.length;
    document.querySelectorAll('.activity-pager').forEach(form=>{
      const coin=form.dataset.pageCoin,input=form.querySelector('input');
      const jump=value=>{
        if(!Number.isSafeInteger(value)||value<1||value>Number(input.max))return;
        activityPages[coin]=value;input.value=String(value);activity();
      };
      form.onsubmit=event=>{event.preventDefault();if(input.checkValidity())jump(Number(input.value));};
      form.querySelectorAll('[data-page-step]').forEach(button=>button.onclick=()=>jump(activityPages[coin]+Number(button.dataset.pageStep)));
    });
  }
  function security() {
    const exists = Boolean(envelope);
    const protectedMode = protectedWallet(envelope);
    const protectionAction=exists?(protectedMode?button('unlock-security',mode==='locked'?'Unlock wallet':'Lock wallet','','lock'):''):button('setup-security','Create or restore','primary');
    let walletName='this wallet';
    try{walletName=library.list().find(item=>item.id===WalletLibrary.id(envelope))?.name||walletName;}catch(_){}
    $('main').innerHTML = `<div class="page-head settings-heading"><div><h1>Settings</h1><p class="subtle">${exists?escape(walletName):'Appearance and wallet protection'}</p></div>${protectionIcon(protectedMode)}</div>` +
      `<section id="password-protection" class="panel"><h2>${exists ? protectedMode ? 'Password protection on' : 'Password protection off' : 'No wallet yet'}</h2><p class="subtle">${exists ? protectedMode ? (walletStorage.deviceProtected ? 'Device-encrypted storage. Your wallet password adds another layer.' : 'Encrypted on this device. Password required to view recovery words.') : (walletStorage.deviceProtected ? 'Device-encrypted storage. No separate wallet password.' : 'Not encrypted. Your recovery phrase is stored as readable text.') : 'Create or restore a wallet to get started.'}</p>${protectionAction?`<div class="settings-actions">${protectionAction}</div>`:''}</section>` +
      `<div class="theme-control"><span id="appearance-label">Appearance</span><div id="theme-choice" role="group" aria-labelledby="appearance-label">${[['system','Device'],['dark','Dark'],['light','Light']].map(([value,label])=>`<button type="button" data-theme-choice="${value}" aria-pressed="${themePreference()===value}">${label}</button>`).join('')}</div></div>` +
      (window.SafeCorePlatform?.getDeviceAuthentication?'<label class="check screenshot-setting"><input id="device-authentication" type="checkbox" disabled><span><strong>Use device authentication</strong><small id="device-authentication-note">Loading…</small></span></label>':'') +
      `<label class="check screenshot-setting"><input id="hide-balances" type="checkbox" ${balancesHidden()?'checked':''}><span><strong>Hide balances</strong><small>Payment amounts stay visible.</small></span></label>` +
      `<label class="check screenshot-setting"><input id="screen-protection" type="checkbox" disabled ${window.SafeCorePlatform?.getScreenProtection?'checked':''}><span><strong>Block screenshots</strong><small id="screen-protection-note">${window.SafeCorePlatform?.getScreenProtection?'Loading…':''}</small></span></label>` +
      `<div id="recovery-preferences"></div><section class="settings-connections">
      <details id="legacy-assets"><summary>Legacy assets</summary>${Object.keys(LEGACY_ASSETS).sort((a,b)=>COINS[a].name.localeCompare(COINS[b].name,'en')).map(coin=>`<label class="check screenshot-setting"><input id="enable-${coin}" type="checkbox" ${legacyEnabled(coin)?'checked':''}><span><strong>${COINS[coin].name} (${COINS[coin].ticker})</strong><small>Show in Add coins. Your own secure Electrum endpoint is required.</small></span></label>`).join('')}<p class="subtle">No default servers. Configure and test a connection below before receiving or sending.</p></details>
      <details id="custom-connections"><summary>Network connections</summary><p class="subtle">Automatic server failover when available. Bellscoin uses an HTTPS API by default. You can use your own Electrum server below. Servers can see your address queries and IP address.</p><p class="inline-info" id="connection-error" role="status"></p>${assetOrder.filter(catalogEnabled).map(coin=>`<form class="connection-form" data-connection="${coin}"><label for="endpoint-${coin}">${E.NETWORKS[coin].name}</label><input id="endpoint-${coin}" type="url" required maxlength="2048" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="wss://server:port/path"><small id="endpoint-current-${coin}" class="subtle"></small><div class="connection-actions"><button type="submit" data-test-connection="${coin}">Test connection</button><button type="button" data-use-connection="${coin}" disabled>Use connection</button></div><p class="inline-info" data-connection-status="${coin}" role="status"></p></form>`).join('')}<button id="restore-connections" class="text-button" type="button">Restore default connections</button></details>
      ${['localhost','127.0.0.1'].includes(location.hostname)&&location.port==='8787'?'<a href="#reset-tests" class="text-button coin-empty-link">Reset all local test data</a>':''}<div class="settings-actions">${button('wallet-information','Information')}</div></section>`;
    bindConnections();
    for(const coin of Object.keys(LEGACY_ASSETS))$('enable-'+coin).onchange=event=>{
      try{
        localStorage.setItem(LEGACY_ASSETS[coin],String(event.target.checked));
        reloadConnections();render();$('legacy-assets').open=true;
        if(legacyEnabled(coin))$('custom-connections').open=true;
      }catch(_){event.target.checked=legacyEnabled(coin);error('Could not save the legacy asset setting.');}
    };
    document.querySelectorAll('.connection-actions button, #restore-connections').forEach(el=>el.classList.add('glow-control'));
    if (exists) {
      $('recovery-preferences').innerHTML=`<label class="check komodo-setting"><input id="komodo-recovery-enabled" type="checkbox" ${komodoEnabled()?'checked':''} ${mode!=='unlocked'?'disabled':''}><span><strong>Komodo recovery (PEP / SHIC)</strong><small>Recover legacy Pepecoin or Shibacoin funds.</small></span></label>`;
      $('komodo-recovery-enabled').onchange=event=>{
        try{if(event.target.checked)localStorage.setItem(komodoPreference(),'true');else localStorage.removeItem(komodoPreference());clearKomodo();toast(event.target.checked?'Komodo Sweep enabled for this wallet’s Pepecoin and Shibacoin.':'Komodo recovery disabled.');}
        catch(_){event.target.checked=komodoEnabled();error('Could not save the recovery setting.');}
      };
      if($('unlock-security'))$('unlock-security').onclick = () => mode === 'locked' ? go('unlock') : lock('Wallet locked.');
    } else $('setup-security').onclick = () => go('setup');
    $('wallet-information').onclick = () => go('information');
    $('hide-balances').onchange=event=>{try{localStorage.setItem(BALANCE_PRIVACY,String(event.target.checked));}catch(_){event.target.checked=balancesHidden();error('Could not save balance visibility.');}};
    $('theme-choice').onclick = event => {const choice=event.target.closest('[data-theme-choice]');if(!choice||!$('theme-choice').contains(choice))return;try{localStorage.setItem('corevault.theme',choice.dataset.themeChoice);applyTheme();}catch(_){error('Could not save your appearance preference.');}};
    const screenControl=$('screen-protection'),screenNote=$('screen-protection-note'),platform=window.SafeCorePlatform;
    const authControl=$('device-authentication'),authNote=$('device-authentication-note');
    if(authControl){
      let authEnabled=false;
      const load=async()=>{
        authControl.disabled=true;
        try {
          const status=await platform.getDeviceAuthentication();authEnabled=status.enabled;
          if(authControl.isConnected){authControl.checked=authEnabled;authControl.disabled=!status.available;authNote.textContent=status.available?'Fingerprint or phone screen lock. All wallets.':'Set up a phone screen lock to enable.';}
        }catch(_){if(authNote.isConnected)authNote.textContent='Device authentication unavailable. Reopen Settings to retry.';}
      };
      void load();
      authControl.onchange=async()=>{
        const enabled=authControl.checked;authControl.checked=authEnabled;authControl.disabled=true;
        try{await withWalletLock(()=>walletStorage.setAuthentication(enabled));await load();toast(enabled?'Device authentication enabled.':'Device authentication off. Storage remains encrypted.');}
        catch(e){if(walletStorage.failed){envelope=null;mode='storage-error';lock(undefined,false);}else if(authControl.isConnected){error(e.message);await load();}}
      };
    }
    if(platform?.getScreenProtection&&platform?.setScreenProtection){
      let enabled=true;
      const load=async()=>{
        screenControl.disabled=true;
        try{enabled=await platform.getScreenProtection();if(screenControl.isConnected){screenControl.checked=enabled;screenControl.disabled=false;screenNote.textContent='All wallets on this device.';}}
        catch(_){if(screenNote.isConnected)screenNote.textContent='Screenshot setting unavailable. Reopen Settings to retry.';}
      };
      void load();
      screenControl.onchange=async()=>{
        const requested=screenControl.checked;screenControl.checked=enabled;screenControl.disabled=true;
        try{enabled=await platform.setScreenProtection(requested);}
        catch(e){if(screenControl.isConnected)error(e.message);}
        finally{if(screenControl.isConnected){screenControl.checked=enabled;await load();}}
      };
    }
  }
  function reloadConnections(){
    cancelConnectionTests();generation++;pending=null;busy=false;sendDraft=null;sendCoin=null;
    clearSweep();clearKomodo();clearSweepReceipt();clearReports();rescanning=false;sendRefreshRun=null;
    N.close();networkEpoch++;snapshots={};networkErrors={};scans={};lastRefresh={};
    try{N.configure(activeConnections());connectionProblem=null;}
    catch(_){connectionProblem='Check your saved connections in Settings.';}
    initialDiscovery=new Set(Object.keys(receivePools||{}).filter(liveCoin));
    if(receivePools)for(const coin of Object.keys(receivePools))receiveBooks[coin]=ReceiveBook.create(receivePools[coin],receiveBooks[coin].preferences());
    if(mode==='unlocked'&&!connectionProblem)for(const coin of initialDiscovery)void refreshLive(coin);
  }
  function bindConnections(){
    $('connection-error').textContent=connectionProblem||'';
    for(const coin of assetOrder.filter(catalogEnabled)){
      const form=document.querySelector(`[data-connection="${coin}"]`),input=$('endpoint-'+coin),test=form.querySelector('[data-test-connection]'),use=form.querySelector('[data-use-connection]'),status=form.querySelector('[data-connection-status]');
      let tested=null,controller=null;
      const configured=N.endpoint(coin),isDefault=configured===N.CONFIG[coin].url;
      input.value=isDefault?'':N.endpoint(coin);$('endpoint-current-'+coin).textContent=connectionProblem?'Saved connection needs attention.':!configured?'Custom endpoint required':isDefault?'Using default server':'Using custom server';
      input.oninput=()=>{controller?.abort();tested=null;use.disabled=true;test.disabled=false;test.textContent='Test connection';status.textContent='';};
      form.onsubmit=async event=>{
        event.preventDefault();controller?.abort();tested=null;use.disabled=true;
        let url;try{url=N.validateEndpoint(input.value);}catch(e){status.textContent=e.message;return;}
        const run=new AbortController();controller=run;connectionTests.add(run);test.disabled=true;test.textContent='Testing…';status.textContent='';
        try{
          const result=await N.testConnection(coin,url,{signal:run.signal});
          if(run.signal.aborted||controller!==run||!input.isConnected||N.validateEndpoint(input.value)!==url)return;
          tested={url,at:Date.now()};use.disabled=false;status.textContent=`Connected · Block ${result.height.toLocaleString()}`;
        }catch(e){if(controller===run&&!run.signal.aborted&&status.isConnected)status.textContent=e.message;}
        finally{connectionTests.delete(run);if(controller===run&&test.isConnected){test.disabled=false;test.textContent='Test connection';}}
      };
      use.onclick=()=>{
        try{
          const url=N.validateEndpoint(input.value);
          if(!tested||tested.url!==url||Date.now()-tested.at>120000){use.disabled=true;throw Error('Test this connection again before using it.');}
          const values=savedConnections();if(url===N.CONFIG[coin].url)delete values[coin];else values[coin]=url;
          localStorage.setItem(CONNECTION_PREFS,JSON.stringify(values));reloadConnections();render();$('custom-connections').open=true;toast(`${E.NETWORKS[coin].name} connection updated.`);
        }catch(e){status.textContent=e.message;}
      };
    }
    $('restore-connections').onclick=()=>{
      try{localStorage.removeItem(CONNECTION_PREFS);reloadConnections();render();$('custom-connections').open=true;toast('Default connections restored.');}
      catch(_){$('connection-error').textContent='Could not save connections. Your existing settings are unchanged.';}
    };
  }
  function information() {
    $('main').innerHTML = title('Information', 'Wallet risks & disclaimer', icon('shield')) +
      `<section class="panel risk-copy">${riskContent()}</section>` +
      `<p class="subtle">Market price data provided by <a href="https://www.coingecko.com/en/coins/shibacoin" target="${window.SafeCorePlatform?'_self':'_blank'}" rel="noopener noreferrer" referrerpolicy="no-referrer">CoinGecko</a>. Coin logos identify their respective projects; upstream copyright/license notices are included in the source and APK assets.</p>` +
      button('information-back', 'Back to Settings', 'primary');
    $('information-back').onclick = () => go('security');
  }
  function iconGallery(choice=savedBrand()){
    applyBrand(choice);
    const tile=(name,i)=>`<button class="brand-option" data-brand="${i+1}" aria-label="Preview ${name}" aria-pressed="${choice===i+1}"><img src="${brandPath(i+1)}" alt=""><span><small>${String(i+1).padStart(2,'0')}</small>${name}</span></button>`;
    const groups=[['SafeCore · New',30,31],['Nodes & networks',20,30],['Coins & crypto',10,20],['Original designs',0,10]].map(([label,start,end])=>`<h2>${label}</h2><div class="brand-grid" aria-label="${label}">${BRAND_ICONS.slice(start,end).map((name,i)=>tile(name,i+start)).join('')}</div>`).join('');
    $('main').innerHTML=title('Choose your icon',`${BRAND_ICONS.length} SafeCore designs. Tap one to preview it in the header.`)+
      `<div class="brand-preview"><img src="${brandPath(choice)}" alt="${escape(choice?BRAND_ICONS[choice-1]:'Original')} icon preview"><div><strong>SafeCore</strong><p class="subtle">${choice?`${String(choice).padStart(2,'0')} · ${BRAND_ICONS[choice-1]}`:'Original icon'}</p></div></div><div class="form-actions">${button('save-brand','Use this icon','primary')}<a href="#security" class="text-button">Cancel</a></div>${groups}${button('original-brand','Restore original icon','text-button')}`;
    document.querySelectorAll('[data-brand]').forEach(el=>el.onclick=()=>iconGallery(Number(el.dataset.brand)));
    $('original-brand').onclick=()=>iconGallery(0);
    $('save-brand').onclick=()=>{try{localStorage.setItem(BRAND_PREF,String(choice));go('wallet');toast('Icon updated.');}catch(_){error('Could not save the icon. Your previous choice is unchanged.');}};
  }
  const exportStamp=vault=>ethers.utils.sha256(ethers.utils.toUtf8Bytes(JSON.stringify(vault)));
  function beginExport(id) {
    try {
      const item=library.list().find(item=>item.id===id);
      if(!item)throw Error('This wallet is no longer saved. Choose a wallet again.');
      if(protectedWallet(item.vault)){void exportBackup(item);return;}
      // Keep only identity/revision in UI state, never another copy of the seed.
      exportSelection={id:item.id,stamp:exportStamp(item.vault)};go('export');
    }catch(e){error(e.message);}
  }
  function selectedExport() {
    const item=exportSelection&&library.list().find(item=>item.id===exportSelection.id);
    if(!item||exportStamp(item.vault)!==exportSelection.stamp)throw Error('The export selection expired or changed. Choose the wallet again.');
    return item;
  }
  async function exportBackup(item) {
    const vault=item.vault;
    if(window.SafeCorePlatform){
      try{await SafeCorePlatform.exportBackup(JSON.stringify(vault,null,2)+'\n');toast('Backup saved. Keep it private and safe.');}
      catch(e){error(e.message);}
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(vault, null, 2) + '\n'], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = protectedWallet(vault) ? 'safecore-encrypted-backup.json' : 'safecore-UNPROTECTED-backup.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(protectedWallet(vault) ? 'Encrypted backup exported. Keep its password safe.' : 'Unprotected backup exported. Anyone with this file can read the seed.');
  }
  function exportConfirm() {
    let item;
    try{item=selectedExport();}catch(e){go('wallets');error(e.message);return;}
    $('main').innerHTML = title('Export unprotected backup', 'This file contains your recovery phrase in readable form.', protectionIcon(false)) + `<p class="inline-info">Wallet: <strong id="export-wallet-name">${escape(item.name)}</strong></p><p class="notice">Anyone with this file can recover the wallet. Keep it private and offline. Never share it in chat.</p><div class="export-actions">` + button('confirm-export','Download unprotected backup','danger wide') + '<a class="text-button" href="#wallets">Cancel</a></div>';
    $('confirm-export').onclick = () => {try{void exportBackup(selectedExport());}catch(e){error(e.message);}};
  }
  function wallets() {
    let entries;
    try { entries = library.list(); }
    catch (e) { $('main').innerHTML = title('Wallet list needs attention','Saved data has not been overwritten.'); error(e.message); return; }
    const activeId = envelope ? WalletLibrary.id(envelope) : null;
    const currentName = entries.find(item => item.id === activeId)?.name || 'My wallet';
    const currentTools = '<div class="wallet-management-tools"><details id="wallet-rename"><summary>Rename wallet</summary><form id="rename-wallet" class="form-panel"><label for="current-wallet-name">Wallet name</label><div class="wallet-name-editor"><input id="current-wallet-name" maxlength="50" required><button class="text-button" type="submit">Save</button></div></form></details>' + button('wallet-seed',`View recovery phrase for ${escape(currentName)}`,'wide text-button','shield') + '</div>';
    $('main').innerHTML = '<section class="wallet-manager">'+title('Your wallets', 'Open, back up or remove a wallet from this device.') +
      `<div class="wallet-list">${entries.map(item => `<details class="saved-wallet" name="wallet-selection"><summary class="wallet-summary">${icon(protectedWallet(item.vault) ? 'lock' : 'unlock')}<strong>${escape(item.name)}</strong>${item.id === activeId ? '<span class="wallet-current">(current)</span>' : ''}<span class="wallet-chevron" aria-hidden="true">›</span><small>${protectedWallet(item.vault) ? 'Password protected' : 'No password protection'}</small></summary><div class="wallet-actions"><button data-open-wallet="${item.id}" class="text-button" ${item.id === activeId ? 'disabled' : ''}>Open</button><button data-export-wallet="${item.id}" class="text-button" aria-label="Export backup for ${escape(item.name)}">Export</button><button data-delete-wallet="${item.id}" class="text-button wallet-delete">Delete</button></div>${item.id === activeId ? currentTools : ''}</details>`).join('') || '<p class="subtle">No wallets saved yet.</p>'}</div>
      <div class="wallet-management-tools">${button('add-wallet','Create or restore wallet','wide home-security','plus')}</div>
      <p class="subtle wallet-list-note">Saved on this device. Keep a separate backup for each wallet.</p></section>`;
    $('add-wallet').onclick = () => { addingWallet = true; setupType = 'create'; go('setup'); };
    document.querySelectorAll('[data-export-wallet]').forEach(el=>el.onclick=()=>beginExport(el.dataset.exportWallet));
    document.querySelectorAll('[data-delete-wallet]').forEach(el=>el.onclick=()=>{deleteTarget=el.dataset.deleteWallet;go('remove');});
    document.querySelectorAll('[data-open-wallet]').forEach(el => el.onclick = async () => {
      const token = generation;
      try {
        await changeWallet(() => library.activate(el.dataset.openWallet), next => {
          const interrupted = token !== generation || document.hidden;
          generation++; pending = null; revealed = false; receiveBooks = null;
          clearReports();
          N.close();networkEpoch++;receivePools=null;snapshots={};networkErrors={};scans={};lastRefresh={};sendDraft=null;
          destinationFingerprint=null;
          envelope = next; mode = 'locked'; if (!interrupted) openUnprotected();
        });
        resetIdle(); go(mode === 'locked' ? 'unlock' : 'wallet');
      } catch (e) { error(e.message); }
    });
    if (activeId) {
      $('current-wallet-name').value = entries.find(item => item.id === activeId)?.name || 'My wallet';
      $('rename-wallet').onsubmit = async event => { event.preventDefault(); const name = $('current-wallet-name').value; try { await changeWallet(() => library.rename(activeId,name)); render(); if ($('wallet-rename')) { $('wallet-rename').closest('.saved-wallet').open = true; $('wallet-rename').querySelector('summary').focus(); } toast('Wallet renamed.'); } catch (e) { error(e.message); } };
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
      const password=needsPassword ? $('seed-password').value : '';
      busy = true; clearError(); $('reveal-seed').disabled = true;
      try {
        if(window.SafeCorePlatform?.authenticateWalletAction)await SafeCorePlatform.authenticateWalletAction('reveal');
        if(token!==generation||source!==envelope)return;
        const candidate = E.validateRecipe(ethers, await E.decrypt(crypto, source, password));
        if (token !== generation || source !== envelope) return;
        revealed = true;
        $('reveal-form').outerHTML = `<section class="seed-display"><div id="revealed-words" class="word-grid">${candidate.mnemonic.split(' ').map((word,i) => `<div class="word"><span>${i+1}</span>${escape(word)}</div>`).join('')}</div>${candidate.passphrase ? `<p class="notice">This wallet also needs its exact BIP39 passphrase:</p><pre id="revealed-passphrase">${escape(candidate.passphrase)}</pre>` : ''}${button('hide-seed','Hide recovery phrase','wide')}</section>`;
        $('hide-seed').onclick = () => { revealed = false; go('security'); }; resetIdle();
      } catch (e) { if (token === generation) error(e.message); }
      finally { busy = false; if ($('reveal-seed')) $('reveal-seed').disabled = false; }
    };
  }
  function setup() {
    restoreEntry?.destroy();restoreEntry=null;
    document.body.classList.remove('restore-mode','restore-typing');
    if ((envelope && !addingWallet) || mode === 'storage-error') { go('security'); return; }
    const restoring=setupType==='import';
    document.body.classList.toggle('restore-mode',restoring);
    const restoreFields='<div class="restore-length"><label for="restore-count">Recovery words</label><select id="restore-count" aria-label="Recovery phrase length">'+[12,15,18,21,24].map(n=>`<option value="${n}">${n} words</option>`).join('')+'</select></div><input id="phrase" type="hidden" hidden><div id="restore-grid" class="restore-grid" role="group" aria-label="Recovery words in order"></div><p id="phrase-status" class="inline-info" aria-live="polite"></p><details id="restore-options"><summary>Advanced settings</summary><p class="subtle">Optional wallet name, backup file and extra protection.</p>';
    $('main').innerHTML = (restoring?button('restore-back','← Back','text-button'):'')+title(restoring?'Restore wallet':'Create or restore', restoring?'Enter your 12–24 recovery words in order.':'Your recovery phrase belongs to this wallet.', protectionIcon(false)) +
      `<section class="panel form-panel">${restoring?'':recoveryNotice}<div class="tabs" ${restoring?'hidden':''}><button data-setup="create" class="${setupType === 'create' ? 'selected wht' : ''}">Create new</button><button data-setup="import" class="${setupType === 'import' ? 'selected wht' : ''}">Restore</button></div><form id="setup-form" autocomplete="off">${restoring?restoreFields:''}
      <label for="wallet-name">Wallet name</label><input id="wallet-name" maxlength="50" placeholder="My wallet">
      ${setupType === 'create' ? '<label for="words">Recovery phrase length</label><select id="words"><option value="12">12 words</option><option value="24">24 words</option></select>' : '<label for="backup-file">Backup file (optional)</label><input id="backup-file" type="file" accept=".json,application/json"><p id="file-status" class="inline-info"></p>'}
      <label class="check"><input id="use-passphrase" type="checkbox"><span>Extra seed passphrase (advanced)</span></label><div id="passphrase-fields" hidden><label for="passphrase">BIP39 passphrase</label><input id="passphrase" type="password" autocomplete="off"><small>This changes your addresses. Losing it can mean losing your coins. It is not the app password.</small></div>
      <label class="check"><input id="password-lock" type="checkbox"><span>Password lock (optional)</span></label><div id="password-fields" hidden><label for="password">Wallet password</label><input id="password" type="password" minlength="12" autocomplete="new-password"><small>At least 12 characters. Required to open this wallet or reveal its recovery phrase.</small><label for="confirm">Confirm password</label><input id="confirm" type="password" minlength="12" autocomplete="new-password"></div>
      <p id="protection-notice" class="inline-info"></p>
      ${restoring?'</details>':''}${setupType==='create'?'<label class="check"><input id="ack" type="checkbox" required><span>I understand that losing my recovery phrase may mean losing access to my funds.</span></label>':''}
      <div class="form-actions">${button('cancel-setup','Cancel')}${button('submit-setup',setupType === 'create' ? 'Create wallet' : 'Restore wallet','primary')}</div></form></section>${restoring?'<div id="restore-keyboard" class="restore-keyboard" aria-label="Recovery word keyboard" hidden><div id="phrase-suggestions" class="restore-suggestions" role="group" aria-label="Recovery word suggestions"></div></div>':''}`;
    document.querySelectorAll('[data-setup]').forEach(el => el.onclick = () => { generation++; busy = false; setupType = el.dataset.setup; stagedFile = null; clearError(); setup(); });
    $('cancel-setup').type = 'button'; $('cancel-setup').onclick = () => go('wallet');
    $('submit-setup').type = 'submit';
    if($('restore-back'))$('restore-back').onclick=()=>go('wallet');
    const recovery=$('phrase')?WalletRecovery.attachGrid(ethers,{input:$('phrase'),grid:$('restore-grid'),count:$('restore-count'),keyboard:$('restore-keyboard'),list:$('phrase-suggestions'),status:$('phrase-status'),onEdit:clearError,onValidity:valid=>{$('submit-setup').disabled=busy||(!stagedFile&&!valid);}}):null;
    restoreEntry=recovery;
    function syncProtection() {
      const enabled = $('password-lock').checked;
      $('password-fields').hidden = !enabled;
      $('password').required = enabled; $('confirm').required = enabled;
      if (!enabled) { $('password').value = ''; $('confirm').value = ''; }
      $('seed-lock').outerHTML = protectionIcon(enabled);
      $('protection-notice').textContent = enabled ? 'This wallet will be encrypted. Save its recovery phrase separately: the app password cannot recover a lost backup.' : walletStorage.deviceProtected ? 'Device-encrypted storage. No wallet password. Exported backups contain readable recovery words; keep them private.' : 'Password lock is off. This wallet and its backups will contain an unencrypted recovery phrase. Anyone with access to this browser profile can read it.';
    }
    $('password-lock').onchange = syncProtection;
    syncProtection();
    $('use-passphrase').onchange = () => { $('passphrase-fields').hidden = !$('use-passphrase').checked; if (!$('use-passphrase').checked) $('passphrase').value = ''; };
    if ($('backup-file')) $('backup-file').onchange = async event => {
      const token = ++generation;
      try {
        stagedFile = null; clearError();
        $('restore-options').open=true;
        $('password-lock').disabled = false;
        $('phrase').value = ''; $('passphrase').value = '';
        $('phrase').disabled = false; $('passphrase').disabled = false;
        recovery?.refresh();
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
        if(walletStorage.deviceProtected && !library.list().length){
          const auth=await window.SafeCorePlatform.getDeviceAuthentication();
          if(token!==generation)return;
          if(auth.firstWalletDefault){
            $('submit-setup').textContent='Confirm phone authentication…';
            await withWalletLock(()=>walletStorage.setAuthentication(true));
            if(token!==generation)return;
          }
        }
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
        } else { await persist(candidate, sealed, $('wallet-name').value, token); if(token !== generation)return; go('wallet'); toast('Wallet restored.'); }
      } catch (e) { if(walletStorage.failed){envelope=null;mode='storage-error';lock(undefined,false);}else if (token === generation) error(e.message); }
      finally { busy = false; if ($('submit-setup')) { $('submit-setup').disabled = false; $('submit-setup').textContent = setupType === 'create' ? 'Create wallet' : 'Restore wallet'; recovery?.refresh(); } }
    };
  }
  async function persist(candidate, sealed, name, token = generation) {
    await changeWallet(() => {
      if (token !== generation) throw new Error('Wallet changed or was closed. Please try again.');
      if (JSON.stringify(library.active()) !== JSON.stringify(envelope)) throw new Error('Another tab changed the active wallet. Reload before saving.');
      if (!library.list().some(item => item.id === WalletLibrary.id(sealed))) {
        localStorage.setItem(WALLET_COIN_PREFS + WalletLibrary.id(sealed), JSON.stringify(assetOrder));
      }
      library.save(sealed, name);
    }, () => {
      if (token !== generation || document.hidden) { envelope = sealed; mode = 'locked'; lock(undefined, false); return; }
      envelope = sealed; prepareAddresses(candidate, sealed); pending = null; stagedFile = null; addingWallet = false;
      mode = 'unlocked'; resetIdle();
    });
  }
  function backup() {
    if (!pending) { go('wallet'); return; }
    $('main').innerHTML = title('Write down your recovery phrase', 'Keep the words in order. Never share them.', protectionIcon(protectedWallet(pending.sealed))) +
      `<section class="panel form-panel"><p class="notice" id="wallet-saved">Your wallet is saved on this device. Find these words again in Your wallets → select your wallet → View recovery phrase.</p><p class="subtle">Keep a separate backup of these words. You will need it if this device is lost or its browser data is cleared.</p><div class="word-grid" id="recovery-words">${pending.candidate.mnemonic.split(' ').map((word,i) => `<div class="word"><span>${i+1}</span>${escape(word)}</div>`).join('')}</div>
      ${pending.candidate.passphrase ? '<div class="notice">A BIP39 passphrase is set. Keep it with your recovery instructions; these words alone will recover different addresses.</div>' : ''}
      <section id="recovery-copy-question"><h2>Save an encrypted recovery copy on this device?</h2><p class="subtle">It can help you restore after reinstalling the app. A separate manual backup is strongly recommended.</p><div class="form-actions">${button('recovery-copy-yes','Yes','primary')}${button('finish','No, continue')}</div></section></section>`;
    $('finish').onclick = () => { pending = null; go('wallet'); };
    $('recovery-copy-yes').onclick=()=>{
      const source=pending,token=generation;
      $('recovery-copy-question').innerHTML='<h2>Protect your recovery copy</h2><p class="subtle">Choose a local folder and a backup password. You need this password to restore the file. We do not save it. This copy cannot recover a lost or reset device; keep a separate manual backup.</p><form id="recovery-copy-form" autocomplete="off"><label for="recovery-copy-password">Backup password</label><input id="recovery-copy-password" type="password" minlength="12" maxlength="1000" required autocomplete="new-password"><label for="recovery-copy-confirm">Confirm backup password</label><input id="recovery-copy-confirm" type="password" minlength="12" maxlength="1000" required autocomplete="new-password"><div class="form-actions">'+button('save-recovery-copy','Choose location and save','primary')+button('skip-recovery-copy','No, continue')+'</div></form>';
      $('skip-recovery-copy').type='button';$('skip-recovery-copy').onclick=()=>{pending=null;go('wallet');};
      $('save-recovery-copy').type='submit';
      $('recovery-copy-form').onsubmit=async event=>{
        event.preventDefault();if(busy)return;clearError();
        const password=$('recovery-copy-password').value;
        if(password.length<12||password.length>1000){error('Use a backup password of at least 12 characters.');return;}
        if(password!==$('recovery-copy-confirm').value){error('The backup passwords do not match.');return;}
        $('recovery-copy-password').value='';$('recovery-copy-confirm').value='';busy=true;$('save-recovery-copy').disabled=true;
        const active=()=>token===generation&&source===pending&&envelope===source.sealed&&!document.hidden&&location.hash==='#backup';
        try{
          const copy=await E.encrypt(crypto,source.candidate,password);
          if(!active())return;
          const data=JSON.stringify(copy,null,2)+'\n';
          if(window.SafeCorePlatform){
            if(!SafeCorePlatform.exportRecoveryCopy)throw Error('Update the Android app to save a local recovery copy.');
            await SafeCorePlatform.exportRecoveryCopy(data);
          }else{
            const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');
            a.href=url;a.download='safecore-encrypted-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
          }
          if(active()){pending=null;go('wallet');toast(window.SafeCorePlatform?'Encrypted recovery copy saved. Keep its password and a separate backup safe.':'Encrypted copy downloaded. Verify the file and keep a separate backup.');}
        }catch(e){if(active())error(e.message);}
        finally{busy=false;if($('save-recovery-copy'))$('save-recovery-copy').disabled=false;}
      };
      $('recovery-copy-password').focus();
    };
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
          const exact=[STORE,'corevault.wallets.v1','corevault.hidden-coins.v1','corevault.theme','corevault.icon.v1',BRAND_PREF,RISK_ACK,CONNECTION_PREFS,...Object.values(LEGACY_ASSETS),BALANCE_PRIVACY,DISPLAY_PRICE_STORE];
          const prefixes=[E.PUBLIC_CACHE_PREFIX,'corevault.balance.','corevault.receive.','corevault.send-attempts.','corevault.live.','corevault.komodo-recovery.',WALLET_COIN_PREFS];
          const keys=Object.keys(localStorage).filter(k=>exact.includes(k)||prefixes.some(p=>k.startsWith(p)));
          for(const key of keys)localStorage.removeItem(key);
          priceEpoch++;displayPrices={};displayPricesSaved='';
          pepPrice=usdtPrice=shicPrice=ltcPrice=dogePrice=btcPrice=belPrice=dingoPrice=null;
          for(const coin of Object.keys(extraQuotes))delete extraQuotes[coin];
          envelope=null;mode='demo';lock();reloadConnections();loadCoinPrefs();applyTheme();
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
      `<section class="panel form-panel delete-confirmation"><div class="notice">${item?`Delete <strong>${escape(item.name)}</strong> from this device? Its saved recovery phrase and local history will be removed. Other wallets and on-chain funds are not changed.`:'The saved vault could not be parsed. Export the original data before removing it.'}</div>${isActive ? button('backup-before-remove','Export this wallet first','wide') : ''}<label for="delete-confirm">Type REMOVE to confirm</label><input id="delete-confirm" data-focus-position="upper" autocomplete="off"><label class="check"><input id="delete-ack" type="checkbox"><span>I have a working recovery backup or accept losing access to this wallet.</span></label><div class="form-actions">${button('cancel-remove','Cancel')}${button('confirm-remove','Delete wallet','danger')}</div></section>`;
    if ($('backup-before-remove')) $('backup-before-remove').onclick = () => beginExport(target);
    $('cancel-remove').onclick = () => {deleteTarget=null;go('wallets');};
    $('confirm-remove').onclick = async () => {
      if ($('delete-confirm').value !== 'REMOVE' || !$('delete-ack').checked) { error('Type REMOVE and confirm your backup first.'); return; }
      const token = generation;
      let cleanupFailed=false;
      try {
        await changeWallet(() => {
          if (token !== generation) throw new Error('The active wallet changed. Review before removing it.');
          if (storageFailure) walletStorage.removeItem(STORE);
          else {
            if (JSON.stringify(library.active()) !== JSON.stringify(envelope)) throw new Error('Another tab changed the active wallet. Reload before removing it.');
            const current=library.list().find(w=>w.id===target);
            if(!current||JSON.stringify(current.vault)!==JSON.stringify(item.vault))throw Error('This wallet changed. Review it again before deleting.');
            library.remove(target);
          }
        }, () => {
          if (!storageFailure) {
            try{
              for(const coin of Object.keys(E.NETWORKS))localStorage.removeItem('corevault.balance.'+target+'.'+coin);
              for(const prefix of [E.PUBLIC_CACHE_PREFIX,'corevault.receive.','corevault.send-attempts.','corevault.live.','corevault.komodo-recovery.',WALLET_COIN_PREFS])localStorage.removeItem(prefix+target);
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
    if (nativeStorage) { deviceStorageError(); return; }
    $('main').innerHTML = title('Saved wallet needs attention', 'Your existing data has not been overwritten.') + '<section class="panel form-panel"><div class="notice">The saved wallet could not be read. Export the original data before removing or replacing it. An unprotected wallet export contains readable recovery words; keep it private.</div>' + button('export-raw','Export saved data','wide') + button('remove-raw','Remove local copy','danger space-top') + '</section>';
    $('export-raw').onclick = () => {
      const raw = walletStorage.getItem(STORE); if (!raw) return;
      if(window.SafeCorePlatform){SafeCorePlatform.exportBackup(raw).then(()=>toast('Backup saved.')).catch(e=>error(e.message));return;}
      const url = URL.createObjectURL(new Blob([raw], {type:'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = 'safecore-unreadable-vault.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    };
    $('remove-raw').onclick = () => {deleteTarget=null;go('remove');};
  }
  function render() {
    if (walletStorage.failed || (nativeStorage && mode === 'storage-error')) { deviceStorageError(); return; }
    loadCoinPrefs();
    cancelConnectionTests();
    let route = assetRoute()?'asset':location.hash.slice(1) || 'wallet';
    if(route==='asset'&&!selectedAsset()){history.replaceState(null,'','#wallet');route='wallet';}
    if(route!=='export')exportSelection=null;
    if(route!=='setup'){restoreEntry?.destroy();restoreEntry=null;document.body.classList.remove('restore-mode','restore-typing');}
    if (!['wallet','asset','wallets','live','send','sweep','komodo-sweep','reveal','export','coins','receive','activity','security','information','setup','backup','unlock','remove','reset-tests','icons'].includes(route)) route = 'wallet';
    if(!['sweep','komodo-sweep'].includes(route)){clearSweep();clearSweepReceipt();}
    if(route!=='komodo-sweep')clearKomodo();
    if (route !== 'send') sendCoin = null;
    if (!['receive','sweep','komodo-sweep'].includes(route)) receiveCoin = null;
    if (pending && route !== 'backup') pending = null;
    document.documentElement.dataset.walletState = mode;
    if(route!=='icons')applyBrand(savedBrand());
    const shortcut = document.querySelector('.wallets-shortcut');
    $('header-add-coins').hidden=route!=='wallet';
    try {
      const name = envelope && library.list().find(item => item.id === WalletLibrary.id(envelope))?.name;
      $('current-wallet-label').textContent = name || 'No wallet selected';
      shortcut.title = name ? `Switch wallets · Current: ${name}` : 'Manage saved wallets';
    } catch (_) { $('current-wallet-label').textContent = 'Wallets'; }
    if(route==='wallets')shortcut.setAttribute('aria-current','page');else shortcut.removeAttribute('aria-current');
    $('lock').disabled = mode === 'demo' && !pending;
    $('lock').hidden = !protectedWallet(envelope);
    $('breadcrumb').textContent = ({wallet:'Overview',asset:'Asset',coins:'Coins',receive:'Receive',activity:'Activity',security:'Settings',setup:'Setup',backup:'Recovery',unlock:'Unlock',remove:'Remove'})[route];
    document.querySelectorAll('[data-nav]').forEach(el => {
      const active = el.dataset.nav === (['sweep','komodo-sweep'].includes(route)?'receive':['asset','coins','wallets','export'].includes(route) ? 'wallet' : ['information','setup','backup','unlock','remove','reveal','reset-tests','icons'].includes(route) ? 'security' : route);
      el.classList.toggle('active', active); if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    if (mode === 'storage-error' && !['remove','reset-tests'].includes(route)) storageError();
    else ({wallet:overview,asset:assetDetail,wallets,live:()=>go('wallet'),send,sweep,'komodo-sweep':komodo,reveal,export:exportConfirm,coins,receive,activity,security,information,setup,backup,unlock,remove,'reset-tests':resetTests,icons:iconGallery})[route]();
    showRiskNotice();
    document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
    if (['wallet','asset','receive','activity','send'].includes(route) && liveEnabled() && mode === 'unlocked') {
      const targets = route !== 'receive' ? Object.keys(E.NETWORKS) : [receiveCoin];
      for (const coin of targets) if (E.NETWORKS[coin] && !scans[coin] && Date.now()-(lastRefresh[coin]||0)>WalletReporting.POLL_MS) void refreshLive(coin);
      if(route==='wallet'||route==='asset')void refreshPrice();
    }
  }
  $('lock').onclick = () => mode === 'locked' ? go('unlock') : lock('Wallet locked.');
  window.addEventListener('hashchange', event => {
    // Native resume/import can replace a route before an older hash event arrives.
    // That stale event must not discard a freshly staged backup or rebuilt form.
    if(event.newURL&&new URL(event.newURL).hash!==location.hash)return;
    const selection=assetSendSelection;assetSendSelection=null;
    sendCoin=location.hash==='#send'&&selection?.source===envelope&&selection.epoch===networkEpoch&&fundedCoins().includes(selection.coin)?selection.coin:null;
    // Only an explicit asset-detail Receive click may preselect a deposit asset.
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
    if(document.hidden){if(!window.SafeCorePlatform?.cameraPermissionPending&&!window.SafeCorePlatform?.deviceAuthenticationPending)lock();}
    else resumeUnprotected();
  });
  window.addEventListener('pagehide', () => lock(undefined, false));
  window.addEventListener('pageshow', resumeUnprotected);
  window.addEventListener('safecore-pause', () => lock(undefined, false));
  window.addEventListener('safecore-resume', resumeUnprotected);
  window.addEventListener('safecore-auth-prompt',()=>clearTimeout(idleTimer));
  window.addEventListener('safecore-auth-end',resetIdle);
  window.addEventListener('safecore-import', event => {
    if(!window.SafeCorePlatform||typeof event.detail!=='string'||event.detail.length>65536)return;
    if(!riskAccepted()){
      showRiskNotice();
      $('risk-error').textContent='After acknowledging this notice, reopen your backup file to import it.';
      $('risk-error').hidden=false;
      return;
    }
    addingWallet=Boolean(envelope);setupType='import';
    history.replaceState(null,'','#setup');render();
    const input=$('backup-file'),transfer=new DataTransfer();
    transfer.items.add(new File([event.detail],'backup.json',{type:'application/json'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change'));
  });
  window.addEventListener('storage', event => {
    if(event.key===CONNECTION_PREFS||Object.values(LEGACY_ASSETS).includes(event.key)){reloadConnections();render();return;}
    if(event.key===null){lock(undefined,false);reloadConnections();}
    if(event.key===BALANCE_PRIVACY){
      if(priceScreen())render();
      else if(location.hash==='#send')updateSendPicker();
      else if($('hide-balances'))$('hide-balances').checked=balancesHidden();
    }
    if(event.key===RISK_ACK)render();
    if(event.key===komodoPreference()){
      clearKomodo();clearSweep();sendDraft=null;generation++;busy=false;
      if(location.hash==='#komodo-sweep')go('security');else if(['#security','#receive','#sweep'].includes(location.hash))render();
    }
    if(event.key===BRAND_PREF) {applyBrand(savedBrand());if(location.hash==='#icons')iconGallery();}
    if (event.key === 'corevault.theme'||event.key===null) applyTheme();
    if (event.key === COIN_PREFS || event.key === coinPrefsKey()) { loadCoinPrefs(); if (['', '#wallet', '#coins', '#receive'].includes(location.hash)||assetRoute()) render(); }
    if (!nativeStorage && (event.key === STORE || event.key === WalletLibrary.COLLECTION || event.key === null)) { lock(undefined, false); try { const raw = walletStorage.getItem(STORE); envelope = raw ? E.validateEnvelope(JSON.parse(raw)) : null; mode = envelope ? 'locked' : 'demo'; if(!document.hidden)openUnprotected(); } catch (_) { envelope = null; mode = 'storage-error'; } render(); resetIdle(); }
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
      const active = ['', '#wallet', '#receive', '#activity', '#send'].includes(location.hash)||assetRoute();
      const routine = !active ? [] : location.hash !== '#receive' ? Object.keys(E.NETWORKS) : receiveCoin ? [receiveCoin] : [];
      const targets = new Set([...initialDiscovery, ...routine]);
      for (const coin of targets) void refreshLive(coin);
      void checkSentBalances();
      if(priceScreen())void refreshPrice();
    }
  },WalletReporting.POLL_MS);
})();
