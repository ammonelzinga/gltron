import {prepareQuickMatch} from './quick-queue.js';
import {admitParty} from './party-admission.js';
import { initializeApp } from '@firebase/app';
import { getAuth, signInAnonymously, GoogleAuthProvider, linkWithPopup, signInWithPopup, signInWithCredential, signOut, onAuthStateChanged, connectAuthEmulator } from '@firebase/auth';
import { getDatabase, get, onDisconnect, onValue, ref, query, orderByChild, equalTo, remove, runTransaction, set, serverTimestamp, connectDatabaseEmulator } from '@firebase/database';

const LOCAL_KEY = 'gltrof-lobbies-v2';
const LOCAL_PATCH = `${LOCAL_KEY}:path:`;
const cleanCode = code => code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const clone = value => value === undefined ? undefined : structuredClone(value);

function readPath(root, path) {
  return path.split('/').filter(Boolean).reduce((value, key) => value?.[key], root);
}

function writePath(root, path, value) {
  const keys = path.split('/').filter(Boolean);
  let cursor = root;
  keys.slice(0, -1).forEach(key => { cursor[key] ??= {}; cursor = cursor[key]; });
  const last = keys.at(-1);
  if (value === null) delete cursor[last]; else cursor[last] = value;
}

class LocalStore {
  constructor() { this.mode = 'local'; this.listeners = new Set(); this.uid = crypto.randomUUID(); }
  async init() {
    if (!localStorage.getItem(LOCAL_KEY)) localStorage.setItem(LOCAL_KEY, JSON.stringify({ rooms: {} }));
    addEventListener('storage', event => { if (event.key === LOCAL_KEY || event.key?.startsWith(LOCAL_PATCH)) this.emit(); });
    this.timer = setInterval(() => this.emit(), 350);
  }
  state() {
    const root=JSON.parse(localStorage.getItem(LOCAL_KEY)||'{"rooms":{}}');
    const patches=Object.keys(localStorage).filter(key=>key.startsWith(LOCAL_PATCH)).map(key=>JSON.parse(localStorage.getItem(key))).filter(Boolean).sort((a,b)=>a.version-b.version);
    for(const patch of patches)writePath(root,patch.path,patch.value);
    return root;
  }
  save(state) {
    localStorage.setItem(LOCAL_KEY,JSON.stringify(state));
    Object.keys(localStorage).filter(key=>key.startsWith(LOCAL_PATCH)).forEach(key=>localStorage.removeItem(key));
    this.emit();
  }
  emit() { this.listeners.forEach(listener => listener()); }
  async get(path) { return clone(readPath(this.state(), path)); }
  async cas(path,revision,value){return navigator.locks.request(LOCAL_KEY,()=>{const state=this.state();if((readPath(state,path)?.revision||0)!==revision)return false;writePath(state,path,value);this.save(state);return true;});}
  async set(path, value) { return navigator.locks.request(LOCAL_KEY,()=>{
    const version=Number(localStorage.getItem(`${LOCAL_KEY}:sequence`)||0)+1;
    localStorage.setItem(`${LOCAL_KEY}:sequence`,String(version));
    localStorage.setItem(LOCAL_PATCH+path,JSON.stringify({path,value:clone(value),version}));
    this.emit();
  }); }
  watch(path, callback) {
    let serialized;
    const listener = () => { const value = readPath(this.state(), path); const next = JSON.stringify(value); if (next !== serialized) { serialized = next; callback(clone(value)); } };
    this.listeners.add(listener); listener(); return () => this.listeners.delete(listener);
  }
  async join(code, player) {
    return navigator.locks.request(LOCAL_KEY,()=>{
    const state = this.state(); const room = state.rooms[code];
    if (!room) throw new Error('That lobby no longer exists.');
    if(room.meta.started||room.meta.starting)throw Error('That match has already started.');
    const players = room.players || {};
    if(room.meta.starting)throw Error('That match has already started.');
    const entrantCapacity = room.meta.kind === 'tournament' ? room.tournament.config.maxEntrants + (room.meta.hostParticipates ? 0 : 1) : 6;
    const capacity = player.role === 'spectator' ? entrantCapacity + 64 : entrantCapacity;
    if (Object.keys(players).length >= capacity) throw new Error('That lobby is full.');
    const used = new Set(Object.values(players).map(entry => entry.slot));
    player.slot = Array.from({ length: capacity }, (_, index) => index).find(slot => !used.has(slot));
    players[player.id] = player; room.players = players; this.save(state); return player.slot;
    });
  }
  async prepareQuickMatch(code,now,bots){return navigator.locks.request(LOCAL_KEY,()=>{const state=this.state();state.rooms[code]=prepareQuickMatch(state.rooms[code],now,bots);this.save(state);return true;});}
  async admitParty(code,request,players){return navigator.locks.request(LOCAL_KEY,()=>{const state=this.state();state.rooms[code]=admitParty(state.rooms[code],request,players);this.save(state);return true;});}
  async create(room) { return navigator.locks.request(LOCAL_KEY,()=>{ const state = this.state(); if (state.rooms[room.meta.code]) return false; state.rooms[room.meta.code] = room; this.save(state); return true; }); }
  registerHostDisconnect() {}
  registerPlayerDisconnect() {}
}

class LocalServerStore {
  constructor(){this.mode='local-server';this.uid=crypto.randomUUID();this.listeners=new Set();this.cache={rooms:{}};this.version=-1;}
  receive(payload){if((payload.version??0)>=this.version){this.version=payload.version??0;this.cache=payload.state;this.emit();}}
  async init(){await this.refresh();this.timer=setInterval(()=>this.refresh().catch(()=>{}),300);}
  emit(){for(const listener of this.listeners)listener();}
  async refresh(){if(this.refreshing)return;this.refreshing=true;try{const response=await fetch('/__gltrof_local',{cache:'no-store'});if(!response.ok)throw Error('Local lobby service unavailable');this.receive(await response.json());}finally{this.refreshing=false;}}
  async request(payload){
    const body=JSON.stringify({...payload,requestId:crypto.randomUUID()});
    for(let attempt=0;;attempt++){
      let response;
      try{response=await fetch('/__gltrof_local',{method:'POST',headers:{'Content-Type':'application/json','x-gltrof-local':'1'},body});}
      catch(error){if(attempt>=3)throw error;await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));continue;}
      const data=await response.json();if(!response.ok)throw Error(data.error||'Local lobby request failed');this.receive(data);return data.result;
    }
  }
  get(path){return this.request({action:'get',path});}
  cas(path,revision,value){return this.request({action:'cas',path,revision,value});}
  set(path,value){return this.request({action:'set',path,value});}
  create(room){return this.request({action:'create',room});}
  prepareQuickMatch(code,now,bots){return this.request({action:'prepareQuickMatch',code,now,bots});}
  admitParty(code,request,players){return this.request({action:'admitParty',code,request,players});}
  join(code,player){return this.request({action:'join',code,player});}
  watch(path,callback){let serialized;const listener=()=>{const value=readPath(this.cache,path),next=JSON.stringify(value);if(next!==serialized){serialized=next;callback(clone(value));}};this.listeners.add(listener);listener();return()=>this.listeners.delete(listener);}
  removeOnLeave(path){
    addEventListener('pagehide',()=>fetch('/__gltrof_local',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','x-gltrof-local':'1'},body:JSON.stringify({action:'set',path,value:null})}).catch(()=>{}),{once:true});
  }
  registerHostDisconnect(code){
    // Session presence and authority leases replace deleting the host's room.
  }
  registerPlayerDisconnect(code,player){this.removeOnLeave(`rooms/${code}/players/${player}`);}
}

class FirebaseStore {
  constructor(config) { this.config = config; this.mode = 'firebase'; }
  async init() {
    const app = initializeApp(this.config);
    this.auth=getAuth(app);
    if(import.meta.env.DEV&&import.meta.env.VITE_AUTH_EMULATOR_URL)connectAuthEmulator(this.auth,import.meta.env.VITE_AUTH_EMULATOR_URL,{disableWarnings:true});
    this.db=getDatabase(app);
    if(import.meta.env.DEV&&import.meta.env.VITE_DATABASE_EMULATOR_HOST){const [host,port]=import.meta.env.VITE_DATABASE_EMULATOR_HOST.split(':');connectDatabaseEmulator(this.db,host,Number(port));}
    await this.auth.authStateReady();
    if(!this.auth.currentUser)await signInAnonymously(this.auth);
    this.syncUser(this.auth.currentUser);
    await this.ensureGoogleIdentity();
    onAuthStateChanged(this.auth,user=>this.syncUser(user));
    onValue(ref(this.db,'.info/serverTimeOffset'),snapshot=>{this.timeOffset=snapshot.val()||0;});
  }
  syncUser(user){
    this.uid=user?.uid;this.user={uid:user?.uid,google:Boolean(user?.providerData.some(p=>p.providerId==='google.com')),name:user?.displayName||''};
    this.authListeners?.forEach(fn=>fn(this.user));
  }
  async signInGoogle(){
    const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
    try{if(this.auth.currentUser?.isAnonymous)await linkWithPopup(this.auth.currentUser,provider);else await signInWithPopup(this.auth,provider);}
    catch(error){const credential=GoogleAuthProvider.credentialFromError(error);if(error.code==='auth/credential-already-in-use'&&credential)await signInWithCredential(this.auth,credential);else throw error;}
    await this.auth.currentUser.getIdToken(true);this.syncUser(this.auth.currentUser);await this.ensureGoogleIdentity();
  }
  async signOutGoogle(){await signOut(this.auth);await signInAnonymously(this.auth);this.syncUser(this.auth.currentUser);}
  timestamp(){return serverTimestamp();}
  async putOnce(path,value){const result=await runTransaction(ref(this.db,path),current=>current===null?{...value,revision:1}:undefined,{applyLocally:false});return result.committed;}

  async get(path) { const target=path==='rooms'?query(ref(this.db,path),orderByChild('meta/public'),equalTo(true)):ref(this.db,path);const snapshot = await get(target); return snapshot.val(); }
  async transact(path,change){
    const target=ref(this.db,path);let stop;
    try{
      await new Promise((resolve,reject)=>{stop=onValue(target,()=>resolve(),reject);});
      const result=await runTransaction(target,current=>{
        const next=change(current===null?null:structuredClone(current));
        if(next===undefined)return;
        return {...next,revision:(current?.revision||0)+1};
      },{applyLocally:false});
      return result.committed?result.snapshot.val():null;
    }finally{stop?.();}
  }
  async prepareQuickMatch(code,now,bots){await this.transact('rooms/'+code,room=>prepareQuickMatch(room,now,bots));return true;}
  async cas(path,revision,value){const result=await runTransaction(ref(this.db,path),current=>(current?.revision||0)===revision?value:undefined,{applyLocally:false});return result.committed;}
  async set(path,value){
    if(value!==null)return set(ref(this.db,path),value);
    const player=/^(rooms\/[^/]+)\/players\/[^/]+$/.exec(path),old=player?await this.get(path):null;
    await remove(ref(this.db,path));
    if(old)await remove(ref(this.db,`${player[1]}/slots/${old.slot}`));
  }
  watch(path, callback, onError) { const target=path==='rooms'?query(ref(this.db,path),orderByChild('meta/public'),equalTo(true)):ref(this.db,path);return onValue(target, snapshot => callback(snapshot.val()), onError||(()=>{})); }
  async admitParty(code,request,players){let failure;const result=await runTransaction(ref(this.db,'rooms/'+code),room=>{if(!room)return;try{return admitParty(room,request,players);}catch(error){failure=error;return;}},{applyLocally:false});if(!result.committed)throw failure||Error('Group admission failed. Try again.');return true;}
  registerPartyDisconnect(code,id){onDisconnect(ref(this.db,'parties/'+code+'/members/'+id)).remove();}
  async ensureGoogleIdentity(){if(this.user.google)await runTransaction(ref(this.db,'rankedIdentities/'+this.uid),current=>current===null?{uid:this.uid,createdAt:serverTimestamp()}:undefined,{applyLocally:false});}
  async create(room) {
    const target = ref(this.db, `rooms/${room.meta.code}`);
    const result = await runTransaction(target, current => current === null ? {...room,slots:Object.fromEntries(Object.values(room.players).map(p=>[p.slot,{uid:p.authUid,playerId:p.id,slot:p.slot}]))} : undefined);
    return result.committed;
  }
  async join(code, player) {
    let assigned;
    const room = await this.get(`rooms/${code}`);
    if (!room) throw new Error('That lobby no longer exists.');
    const entrantCapacity = room.meta.kind === 'tournament' ? room.tournament.config.maxEntrants + (room.meta.hostParticipates ? 0 : 1) : 6;
    const capacity = player.role === 'spectator' ? entrantCapacity + 64 : entrantCapacity;
    const used=new Set(Object.values(room.players||{}).map(p=>p.slot));
    for(let slot=0;slot<capacity;slot++){
      if(used.has(slot))continue;
      const claim=ref(this.db,`rooms/${code}/slots/${slot}`);
      const result=await runTransaction(claim,current=>current===null?{uid:this.uid,playerId:player.id,slot}:undefined,{applyLocally:false});
      if(!result.committed)continue;
      try{
        await onDisconnect(claim).remove();
        await set(ref(this.db,`rooms/${code}/players/${player.id}`),{...player,slot});
        return slot;
      }catch(error){await remove(claim).catch(()=>{});throw error;}
    }
    throw new Error('That lobby is full.');
  }
  registerHostDisconnect() { /* Authority is leased, never tied to one tab's lifetime. */ }
  registerPresenceDisconnect(code,browserId){onDisconnect(ref(this.db,`rooms/${code}/presence/${browserId}`)).remove();}
  async registerPlayerDisconnect(code,id){await onDisconnect(ref(this.db,`rooms/${code}/players/${id}`)).remove();const p=await this.get(`rooms/${code}/players/${id}`);if(p)await onDisconnect(ref(this.db,`rooms/${code}/slots/${p.slot}`)).remove();}
}

function firebaseConfig() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
  return config.databaseURL && config.apiKey ? config : null;
}

export async function createStore() {
  const config = firebaseConfig();
  const store = config ? new FirebaseStore(config) : import.meta.env.DEV ? new LocalServerStore() : new LocalStore();
  await store.init();store.now=()=>Date.now()+(store.timeOffset||0);
  store.user??={uid:store.uid,google:false,name:''};store.authListeners??=new Set();
  store.watchAuth=fn=>{store.authListeners.add(fn);fn(store.user);return()=>store.authListeners.delete(fn);};
  store.timestamp??=()=>store.now();
  store.putOnce??=((path,value)=>store.cas(path,0,{...value,revision:1}));
  store.signInGoogle??=async()=>{throw Error('Configure Firebase Google sign-in to play ranked. Casual play is available locally.');};
  store.signOutGoogle??=async()=>{};
  return store;
}

export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => alphabet[byte % alphabet.length]).join('');
}

export { cleanCode };
