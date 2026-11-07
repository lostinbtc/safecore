/* Narrow Android adapter. In a browser this does nothing. */
(() => {
  'use strict';
  if (location.origin !== 'https://appassets.androidplatform.net' || !window.SafeCoreNative) return;
  const pending = new Map();
  let cameraPermissionPending=false;
  window.addEventListener('safecore-camera-prompt',()=>{cameraPermissionPending=true;});
  window.addEventListener('safecore-camera-prompt-end',()=>{cameraPermissionPending=false;});
  let next = 0;
  SafeCoreNative.onmessage = event => {
    try {
      const reply = JSON.parse(event.data), task = pending.get(reply.id);
      if (!task) return;
      pending.delete(reply.id);
      reply.ok ? task.resolve(reply) : task.reject(Error(reply.error || 'Android action failed.'));
    } catch (_) { /* Do not log payloads containing backup data. */ }
  };
  function request(action, value) {
    return new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, {resolve, reject});
      SafeCoreNative.postMessage(JSON.stringify({id, action, value}));
    });
  }
  async function screenProtection(action,value){
    const reply=await request(action,value);
    if(typeof reply.enabled!=='boolean')throw Error('Could not read screenshot protection.');
    return reply.enabled;
  }
  window.SafeCorePlatform = Object.freeze({
    get cameraPermissionPending(){return cameraPermissionPending;},
    copyAddress: address => request('copyAddress', address),
    exportBackup: data => request('exportBackup', data),
    getScreenProtection: () => screenProtection('getScreenProtection',''),
    setScreenProtection: enabled => {
      if(typeof enabled!=='boolean')return Promise.reject(Error('Invalid screenshot setting.'));
      return screenProtection('setScreenProtection',String(enabled));
    }
  });
})();
