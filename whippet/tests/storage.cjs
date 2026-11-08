// Public fixture words only. No filesystem, phone or network wallet data.
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const E=require('../www/engine.js'),L=require('../www/library.js'),S=require('../www/storage.js');
const ethers=require('../www/assets/ethers.umd.min.js');
function browser(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
function native(){let state=null,sequence=0;return {
 get state(){return structuredClone(state);},fail:false,failRead:false,gate:null,
 async readWalletStore(){if(this.failRead)throw Error('Fixture read failure');return this.state;},
 async writeWalletStore(revision,records){if(this.gate)await this.gate;if(this.fail)throw Error('Fixture disk failure');assert.equal(revision,state?.revision??null);state={revision:String(++sequence),records:structuredClone(records)};return state.revision;}
};}
(async()=>{
 const recipe=E.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
 const open=E.unprotected(webcrypto,recipe),locked=await E.encrypt(webcrypto,recipe,'Public-test-password-123');
 const b=browser(),n=native(),old=L.create(b);old.save(open,'Open fixture');old.save(locked,'Locked fixture');
 b.setItem('corevault.theme','dark');const originals=Object.fromEntries([L.ACTIVE,L.COLLECTION].map(k=>[k,b.getItem(k)]));
 const store=await S.open(b,n,true),lib=L.create(store);
 assert.equal(store.deviceProtected,true);assert.equal(lib.list().length,2);assert.equal(lib.active().format,E.FORMAT);
 assert.deepEqual(n.state.records,originals);assert.equal(b.getItem(L.ACTIVE),null);assert.equal(b.getItem(L.COLLECTION),null);assert.equal(b.getItem('corevault.theme'),'dark');
 assert.throws(()=>lib.rename(L.id(open),'Forbidden'),/transaction/);
 let release;n.gate=new Promise(resolve=>release=resolve);
 const saving=store.transaction(()=>lib.activate(L.id(open)));
 assert.equal(lib.active().format,E.FORMAT,'Do not publish staged data before native durability');
 await assert.rejects(store.transaction(()=>{}),/Reopen/);release();await saving;n.gate=null;
 assert.equal(lib.active().format,E.OPEN_FORMAT);
 await store.transaction(()=>lib.rename(L.id(open),'Renamed'));
 let reopened=await S.open(b,n,true);assert.equal(L.create(reopened).list().find(w=>w.id===L.id(open)).name,'Renamed');
 assert.deepEqual(await E.decrypt(webcrypto,L.create(reopened).active(),''),recipe,'Portable unprotected backup unchanged');
 assert.deepEqual(await E.decrypt(webcrypto,L.create(reopened).list().find(w=>w.id===L.id(locked)).vault,'Public-test-password-123'),recipe,'Portable password backup unchanged');
 await assert.rejects(store.transaction(()=>{lib.remove(L.id(open));throw Error('Cancelled');}),/Cancelled/);assert.equal(lib.list().length,2);
 const before=n.state;n.fail=true;await assert.rejects(store.transaction(()=>lib.remove(L.id(open))),/could not be confirmed/);
 assert.equal(store.failed,true);assert.deepEqual(n.state,before);assert.equal(lib.list().length,2);
 await assert.rejects(store.transaction(()=>lib.save(open)),/Reopen/);assert.equal(b.getItem(L.ACTIVE),null);
 n.fail=false;reopened=await S.open(b,n,true);await reopened.transaction(()=>L.create(reopened).remove(L.id(open)));
 assert.equal(L.create(reopened).list().length,1);assert.equal(L.create(reopened).active(),null);
 // Failed native bootstrap/migration keeps every old record untouched.
 for(const failure of ['fail','failRead']){
  const legacy=browser(),backend=native();legacy.setItem(L.ACTIVE,JSON.stringify(open));backend[failure]=true;
  await assert.rejects(S.open(legacy,backend,true));assert.equal(legacy.getItem(L.ACTIVE),JSON.stringify(open));assert.equal(legacy.getItem(S.MARKER),null);
 }
 const malformed=browser(),fresh=native();malformed.setItem(L.COLLECTION,'broken');await assert.rejects(S.open(malformed,fresh,true));assert.equal(fresh.state,null);
 // Interrupted cleanup: native persisted already, only a subset remains in localStorage.
 const partial=browser(),p=native();L.create(partial).save(open,'Fixture');const remove=partial.removeItem;partial.removeItem=k=>{if(k===L.COLLECTION)throw Error('Fixture cleanup failure');remove(k);};
 await assert.rejects(S.open(partial,p,true));assert.equal(partial.getItem(L.ACTIVE),null);assert.notEqual(partial.getItem(L.COLLECTION),null);
 partial.removeItem=remove;assert.equal(L.create(await S.open(partial,p,true)).list().length,1);assert.equal(partial.getItem(L.COLLECTION),null);
 partial.setItem(L.ACTIVE,JSON.stringify(locked));await assert.rejects(S.open(partial,p,true),/Conflicting/);assert.equal(partial.getItem(L.ACTIVE),JSON.stringify(locked));
 const lost=browser();lost.setItem(S.MARKER,'1');await assert.rejects(S.open(lost,native(),true),/missing/);
 await assert.rejects(S.open(browser(),null,true),/unavailable/);
 const ordinary=browser(),web=await S.open(ordinary,null,false);await web.transaction(()=>L.create(web).save(open,'Browser'));assert.equal(ordinary.getItem(L.ACTIVE),JSON.stringify(open));assert.equal(web.deviceProtected,false);
 const authBackend=native(),authStore=await S.open(browser(),authBackend,true);
 authBackend.setDeviceAuthentication=async()=>{const e=Error('Cancelled');e.code='AUTH_CANCELLED';throw e;};
 await assert.rejects(authStore.setAuthentication(true),/Cancelled/);assert.equal(authStore.failed,false);
 authBackend.setDeviceAuthentication=async revision=>authBackend.writeWalletStore(revision,authBackend.state.records);
 await authStore.setAuthentication(true);await authStore.transaction(()=>L.create(authStore).save(open));
 const snapshot=authBackend.state;
 authBackend.writeWalletStore=async()=>{const e=Error('Cancelled');e.code='AUTH_CANCELLED';throw e;};
 await assert.rejects(authStore.transaction(()=>L.create(authStore).remove(L.id(open))),/Cancelled/);
 assert.equal(authStore.failed,false);assert.equal(L.create(authStore).list().length,1);assert.deepEqual(authBackend.state,snapshot);
 console.log('PASS: device migration/readback, interrupted cleanup, conflict/key-loss fail-closed, atomic publication/rollback, multiple wallets, portable exports and browser compatibility.');
})().catch(e=>{console.error(e);process.exitCode=1;});
