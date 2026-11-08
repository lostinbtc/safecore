/* Secret-bearing records only. Android never falls back to browser persistence.
   The library stays synchronous inside a transaction; publication waits for the
   native atomic write and authenticated readback. Preferences remain separate. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./library.js'));
  else root.WalletStorage = factory(root.WalletLibrary);
})(typeof globalThis === 'object' ? globalThis : this, function(L) {
  'use strict';
  const KEYS = [L.ACTIVE, L.COLLECTION], MARKER = 'corevault.device-storage.v1';
  function validate(records) {
    if (!records || Object.keys(records).length !== 2 || KEYS.some(k => !(records[k] === null || typeof records[k] === 'string'))) throw Error('Invalid device wallet records.');
    L.create({getItem:k=>records[k]}).list();
    return {...records};
  }
  async function open(browser, platform, nativeRequired) {
    if (!nativeRequired) return {deviceProtected:false, getItem:k=>browser.getItem(k), setItem:(k,v)=>browser.setItem(k,v), removeItem:k=>browser.removeItem(k), transaction:task=>task()};
    if (!platform?.readWalletStore || !platform?.writeWalletStore) throw Error('Device wallet protection is unavailable.');
    let state = await platform.readWalletStore();
    const legacy = Object.fromEntries(KEYS.map(k=>[k,browser.getItem(k)]));
    if (state === null) {
      if (browser.getItem(MARKER) !== null) throw Error('Device wallet storage is missing.');
      const records = validate(legacy);
      const revision = await platform.writeWalletStore(null, records);
      state = await platform.readWalletStore();
      if (!state || state.revision !== revision || KEYS.some(k=>state.records[k] !== records[k])) throw Error('Device wallet migration could not be verified.');
    }
    if (typeof state.revision !== 'string' || !state.revision) throw Error('Invalid device wallet revision.');
    let committed = validate(state.records), revision = state.revision, staged = null, inTransaction = false, failed = false;
    // A crash during cleanup leaves a matching subset, which is safe to retry.
    // Conflicting copies are never guessed at, merged or overwritten.
    if (KEYS.some(k=>legacy[k] !== null && legacy[k] !== committed[k])) throw Error('Conflicting wallet copies need recovery.');
    browser.setItem(MARKER, '1');
    if (browser.getItem(MARKER) !== '1') throw Error('Could not mark device wallet migration.');
    for (const k of KEYS) {
      browser.removeItem(k);
      if (browser.getItem(k) !== null) throw Error('Could not finish device wallet migration.');
    }
    function writable(k) {
      if (!staged || !KEYS.includes(k) || failed) throw Error('Wallet changes require a device-storage transaction.');
    }
    return {
      deviceProtected:true,
      get failed(){return failed;},
      getItem:k=>(staged || committed)[k] ?? null,
      setItem(k,v){writable(k);staged[k]=String(v);},
      removeItem(k){writable(k);staged[k]=null;},
      async setAuthentication(enabled) {
        if(inTransaction||failed)throw Error('Wallet storage is busy. Try again.');
        inTransaction=true;
        try {revision=await platform.setDeviceAuthentication(revision,enabled);}
        catch(e){if(e.code!=='AUTH_CANCELLED')failed=true;throw e;}
        finally {inTransaction=false;}
      },
      async transaction(task) {
        if (inTransaction || failed) throw Error('Reopen the app before changing wallet storage.');
        inTransaction = true;
        staged = {...committed};
        try {
          // No asynchronous callbacks: all library changes form one snapshot.
          const result = task();
          if (result?.then) throw Error('Wallet storage transactions must be synchronous.');
          const next = validate(staged);
          staged = null; // Readers continue to see the committed snapshot while I/O is pending.
          if (KEYS.some(k=>next[k] !== committed[k])) {
            try { revision = await platform.writeWalletStore(revision, next); }
            catch (e) { if(e.code==='AUTH_CANCELLED')throw e; failed = true; throw Error('Wallet storage could not be confirmed. Close and reopen the app.'); }
          }
          committed = next;
          return result;
        } finally { staged = null; inTransaction = false; }
      }
    };
  }
  return {open, MARKER};
});
