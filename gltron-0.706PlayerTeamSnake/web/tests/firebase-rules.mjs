// Run against the local database emulator: firebase emulators:start --only database --project demo-gltrof
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from '@firebase/app';
import {getDatabase,connectDatabaseEmulator,ref,runTransaction,goOffline} from '@firebase/database';
let checks=0;
const base='http://127.0.0.1:9000',namespace='demo-gltrof-default-rtdb';
async function request(uid,path,method='GET',value){
  const query=new URLSearchParams({ns:namespace});
  if(uid){const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);query.set('auth',encode({alg:'none',typ:'JWT'})+'.'+encode({aud:'demo-gltrof',iss:'https://securetoken.google.com/demo-gltrof',sub:uid,user_id:uid,iat:now,exp:now+3600,auth_time:now,firebase:{identities:{},sign_in_provider:'custom'}})+'.');}
  const response=await fetch(base+'/'+path+'.json?'+query,{method,headers:{'Content-Type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
  const result=await response.json();return {status:response.status,value:result};
}
async function allowed(uid,path,method,value){checks++;const r=await request(uid,path,method,value);assert.equal(r.status,200,JSON.stringify({uid,path,...r}));return r.value;}
async function denied(uid,path,method,value){checks++;const r=await request(uid,path,method,value);assert.equal(r.status,401,JSON.stringify({uid,path,...r}));}
const code='RULES'+Date.now(),room='rooms/'+code,now=Date.now();
const player=(uid,slot)=>({authUid:uid,name:uid,slot,role:'player',browserId:uid});
await allowed('host',room,'PUT',{meta:{hostUid:'host',code,createdAt:now,public:false,kind:'game'},players:{host:player('host',0)},slots:{0:{uid:'host',playerId:'host',slot:0}},authority:{revision:1,term:1,uid:'host',browserId:'host',playerId:'host',leaseUntil:now+4000}});
await denied(null,room);
const apps=['raceA','raceB'].map(uid=>{const app=initializeApp({projectId:'demo-gltrof',databaseURL:'https://demo-gltrof-default-rtdb.firebaseio.com'},code+uid),db=getDatabase(app);connectDatabaseEmulator(db,'127.0.0.1',9000,{mockUserToken:{sub:uid,user_id:uid}});return {app,db,uid};});
try{
  const results=await Promise.all(apps.map(({db,uid})=>runTransaction(ref(db,room+'/slots/2'),current=>current===null?{uid,playerId:uid,slot:2}:undefined,{applyLocally:false})));
  assert.equal(results.filter(r=>r.committed).length,1);checks++;
  await allowed(apps[results.findIndex(r=>r.committed)].uid,room+'/slots/2','DELETE');
}finally{for(const {app,db} of apps){goOffline(db);await deleteApp(app);}}

await denied('guest',room+'/players/guest','PUT',player('guest',1));
await allowed('guest',room+'/slots/1','PUT',{uid:'guest',playerId:'guest',slot:1});
await allowed('guest',room+'/players/guest','PUT',player('guest',1));
await denied('other',room+'/slots/1','PUT',{uid:'other',playerId:'other',slot:1});
await denied('other',room+'/slots/6','PUT',{uid:'other',playerId:'other',slot:6});
await denied('guest',room+'/players/host','DELETE');
await denied('guest',room+'/meta/name','PUT','stolen');
await allowed('guest',room+'/presence/guest','PUT',{uid:'guest',playerId:'guest',seenAt:Date.now()});
const signal='signals/'+code+'/mesh-host_guest';
await allowed('guest',signal);
await allowed('host',signal,'PUT',{kind:'mesh',aId:'host',bId:'guest',authUid:'host',hostUid:'guest',offer:'encrypted'});
await allowed('guest',signal+'/answer','PUT',{offerId:'x',description:'encrypted'});
await denied('other',signal);
await denied('other',signal+'/answer','PUT','stolen');
await allowed('host',room+'/authority/leaseUntil','PUT',Date.now()-1);
await denied('other',room+'/authority','PUT',{revision:2,term:2,uid:'other',browserId:'other',playerId:'guest',leaseUntil:Date.now()+4000});
await allowed('guest',room+'/authority','PUT',{revision:2,term:2,uid:'guest',browserId:'guest',playerId:'guest',leaseUntil:Date.now()+4000});
await allowed('guest',room+'/scores','PUT',{guest:1});
await denied('host',room+'/scores','PUT',{host:99});
await allowed('host',room+'/players/host','DELETE');
await allowed('guest',room+'/players/guest','DELETE');
await allowed('guest','signals/'+code,'DELETE');
await allowed('guest',room,'DELETE');
console.log('Firebase emulator rules:',checks,'access/concurrency checks passed');
