// ── IndexedDB lead + enrichment cache ────────────────────────────────────────
const IDB_NAME='m2_hybrid_v1', IDB_VERSION=1;
let _idbPromise=null, _idbTimer=null;
function openHybridDB(){
  if(_idbPromise)return _idbPromise;
  _idbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(IDB_NAME,IDB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('leads'))db.createObjectStore('leads',{keyPath:'id'});
      if(!db.objectStoreNames.contains('enrichment'))db.createObjectStore('enrichment',{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
  return _idbPromise;
}
async function idbPutMany(storeName,rows){
  if(!rows?.length)return;
  const db=await openHybridDB();
  await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite'),st=tx.objectStore(storeName);rows.forEach(x=>st.put(x));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
async function idbReplaceAll(storeName,rows){
  const db=await openHybridDB();
  await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite'),st=tx.objectStore(storeName);st.clear();rows.forEach(x=>st.put(x));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
async function idbGetAll(storeName){
  const db=await openHybridDB();
  return await new Promise((resolve,reject)=>{const req=db.transaction(storeName,'readonly').objectStore(storeName).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});
}
function scheduleLeadPersistence(leads){
  clearTimeout(_idbTimer); const snapshot=(leads||[]).map(x=>({...x}));
  _idbTimer=setTimeout(()=>idbReplaceAll('leads',snapshot).catch(e=>console.warn('IndexedDB save:',e)),180);
}
async function hydrateLeadsFromIndexedDB(){
  try{
    const rows=await idbGetAll('leads'); if(!rows.length)return 0;
    const mapById=new Map((state.leads||[]).map(l=>[l.id,l]));
    rows.forEach(r=>{const old=mapById.get(r.id);if(!old||new Date(r.updated_at||0)>new Date(old.updated_at||0))mapById.set(r.id,r);});
    state.leads=[...mapById.values()]; return rows.length;
  }catch(e){console.warn('IndexedDB hydrate:',e);return 0;}
}
async function enrichmentCacheGet(keys){
  const wanted=new Set(keys||[]), rows=await idbGetAll('enrichment'); const out=new Map(); const now=Date.now();
  rows.forEach(r=>{if(wanted.has(r.key)&&(!r.expires_at||r.expires_at>now))out.set(r.key,r.value);}); return out;
}
async function enrichmentCachePut(entries,ttlDays=30){
  const expires_at=Date.now()+ttlDays*86400000;
  await idbPutMany('enrichment',entries.map(([key,value])=>({key,value,expires_at,updated_at:Date.now()})));
}
