/* Narrow Android adapter. In a browser this does nothing. */
(() => {
  'use strict';
  if (location.origin !== 'https://appassets.androidplatform.net' || !window.SafeCoreNative) return;
  const pending = new Map();
  let cameraPermissionPending=false;
  let deviceAuthenticationPending=false;
  window.addEventListener('safecore-auth-prompt',()=>{
    deviceAuthenticationPending=true;
    for(const task of pending.values())if(task.timer){clearTimeout(task.timer);task.timer=null;}
  });
  window.addEventListener('safecore-auth-end',()=>{
    deviceAuthenticationPending=false;
    for(const [id,task] of pending)if(task.storage&&!task.timer)task.timer=setTimeout(()=>{pending.delete(id);task.reject(Error('Device wallet storage timed out. Reopen the app.'));},20000);
  });
  window.addEventListener('safecore-camera-prompt',()=>{cameraPermissionPending=true;});
  window.addEventListener('safecore-camera-prompt-end',()=>{cameraPermissionPending=false;});
  let next = 0;
  SafeCoreNative.onmessage = event => {
    try {
      const reply = JSON.parse(event.data), task = pending.get(reply.id);
      if (!task) return;
      pending.delete(reply.id);
      if (task.timer) clearTimeout(task.timer);
      if(reply.ok)task.resolve(reply);
      else {const error=Error(reply.error || 'Android action failed.');error.code=reply.code;task.reject(error);}
    } catch (_) { /* Do not log payloads containing backup data. */ }
  };
  function request(action, value) {
    return new Promise((resolve, reject) => {
      const id = ++next;
      const storage=action.endsWith('WalletStore');
      const timer = storage && !deviceAuthenticationPending ? setTimeout(() => {
        pending.delete(id); reject(Error('Device wallet storage timed out. Reopen the app.'));
      }, 20000) : null;
      pending.set(id, {resolve, reject, timer, storage});
      try { SafeCoreNative.postMessage(JSON.stringify({id, action, value})); }
      catch (_) { pending.delete(id); if (timer) clearTimeout(timer); reject(Error('Android action unavailable.')); }
    });
  }
  async function screenProtection(action,value){
    const reply=await request(action,value);
    if(typeof reply.enabled!=='boolean')throw Error('Could not read screenshot protection.');
    return reply.enabled;
  }
  window.SafeCorePlatform = Object.freeze({
    get cameraPermissionPending(){return cameraPermissionPending;},
    get deviceAuthenticationPending(){return deviceAuthenticationPending;},
    getDeviceAuthentication: async () => {
      const reply=await request('getDeviceAuthentication','');
      if(typeof reply.enabled!=='boolean'||typeof reply.available!=='boolean')throw Error('Device authentication is unavailable.');
      return {enabled:reply.enabled,available:reply.available,firstWalletDefault:reply.firstWalletDefault===true};
    },
    setDeviceAuthentication: async (revision,enabled) => {
      const reply=await request('setDeviceAuthentication',JSON.stringify({revision,enabled}));
      if(typeof reply.revision!=='string'||!reply.revision)throw Error('Could not confirm device authentication.');
      return reply.revision;
    },
    authenticateWalletAction: purpose => request('authenticateWalletAction',purpose),
    copyAddress: address => request('copyAddress', address),
    readWalletStore: async () => (await request('readWalletStore', '')).state,
    writeWalletStore: async (revision, records) => {
      const reply = await request('writeWalletStore', JSON.stringify({revision, records}));
      if (typeof reply.revision !== 'string' || !reply.revision) throw Error('Could not confirm device wallet storage.');
      return reply.revision;
    },
    exportBackup: data => request('exportBackup', data),
    getScreenProtection: () => screenProtection('getScreenProtection',''),
    setScreenProtection: enabled => {
      if(typeof enabled!=='boolean')return Promise.reject(Error('Invalid screenshot setting.'));
      return screenProtection('setScreenProtection',String(enabled));
    }
  });
})();
