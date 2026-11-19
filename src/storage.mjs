const database = new Promise((resolve,reject)=>{
 const request=indexedDB.open('health-agent',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('workspace');
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error);
});
const key='workouts';
export async function load(){
 const db=await database;
 return new Promise((resolve,reject)=>{
  const req=db.transaction('workspace').objectStore('workspace').get(key);
  req.onsuccess=()=>resolve(req.result??{active:null,history:[],revision:0});
  req.onerror=()=>reject(req.error);
 });
}
export async function save(snapshot){
 const db=await database;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('workspace','readwrite');
  const store=tx.objectStore('workspace');
  const get=store.get(key);
  get.onsuccess=()=>{
   if((get.result?.revision??0)!==snapshot.revision-1){tx.abort();return;}
   store.put(snapshot,key);
  };
  tx.oncomplete=resolve;
  tx.onabort=tx.onerror=()=>reject(tx.error??Error('다른 탭에서 기록을 변경했습니다.'));
 });
}
