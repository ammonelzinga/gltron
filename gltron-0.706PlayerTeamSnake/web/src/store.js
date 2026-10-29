import { initializeApp } from '@firebase/app';
import { getAuth, signInAnonymously } from '@firebase/auth';
import { getDatabase, get, onDisconnect, onValue, ref, remove, runTransaction, set } from '@firebase/database';

const LOCAL_KEY = 'gllitebike-lobbies-v1';
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
    addEventListener('storage', event => { if (event.key === LOCAL_KEY) this.emit(); });
    this.timer = setInterval(() => this.emit(), 350);
  }
  state() { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{"rooms":{}}'); }
  save(state) { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); this.emit(); }
  emit() { this.listeners.forEach(listener => listener()); }
  async get(path) { return clone(readPath(this.state(), path)); }
  async set(path, value) { const state = this.state(); writePath(state, path, clone(value)); this.save(state); }
  watch(path, callback) {
    let serialized;
    const listener = () => { const value = readPath(this.state(), path); const next = JSON.stringify(value); if (next !== serialized) { serialized = next; callback(clone(value)); } };
    this.listeners.add(listener); listener(); return () => this.listeners.delete(listener);
  }
  async join(code, player) {
    const state = this.state(); const room = state.rooms[code];
    if (!room) throw new Error('That lobby no longer exists.');
    const players = room.players || {};
    const entrantCapacity = room.meta.kind === 'tournament' ? room.tournament.config.maxEntrants + (room.meta.hostParticipates ? 0 : 1) : 6;
    const capacity = player.role === 'spectator' ? entrantCapacity + 64 : entrantCapacity;
    if (Object.keys(players).length >= capacity) throw new Error('That lobby is full.');
    const used = new Set(Object.values(players).map(entry => entry.slot));
    player.slot = Array.from({ length: capacity }, (_, index) => index).find(slot => !used.has(slot));
    players[player.id] = player; room.players = players; this.save(state); return player.slot;
  }
  async create(room) { const state = this.state(); if (state.rooms[room.meta.code]) return false; state.rooms[room.meta.code] = room; this.save(state); return true; }
  registerHostDisconnect() {}
  registerPlayerDisconnect() {}
}

class FirebaseStore {
  constructor(config) { this.config = config; this.mode = 'firebase'; }
  async init() {
    const app = initializeApp(this.config);
    const credential = await signInAnonymously(getAuth(app));
    this.uid = credential.user.uid;
    this.db = getDatabase(app);
  }
  async get(path) { const snapshot = await get(ref(this.db, path)); return snapshot.val(); }
  async set(path, value) { return value === null ? remove(ref(this.db, path)) : set(ref(this.db, path), value); }
  watch(path, callback) { return onValue(ref(this.db, path), snapshot => callback(snapshot.val())); }
  async create(room) {
    const target = ref(this.db, `rooms/${room.meta.code}`);
    const result = await runTransaction(target, current => current === null ? room : undefined);
    return result.committed;
  }
  async join(code, player) {
    let assigned;
    const room = await this.get(`rooms/${code}`);
    if (!room) throw new Error('That lobby no longer exists.');
    const entrantCapacity = room.meta.kind === 'tournament' ? room.tournament.config.maxEntrants + (room.meta.hostParticipates ? 0 : 1) : 6;
    const capacity = player.role === 'spectator' ? entrantCapacity + 64 : entrantCapacity;
    const target = ref(this.db, `rooms/${code}/players`);
    const result = await runTransaction(target, currentPlayers => {
      const players = currentPlayers || {};
      if (players[player.id]) { assigned = players[player.id].slot; return players; }
      if (Object.keys(players).length >= capacity) return;
      const used = new Set(Object.values(players).map(entry => entry.slot));
      assigned = Array.from({ length: capacity }, (_, index) => index).find(slot => !used.has(slot));
      players[player.id] = { ...player, slot: assigned };
      return players;
    });
    if (!result.committed) throw new Error('That lobby is full.');
    return assigned;
  }
  registerHostDisconnect(code) { onDisconnect(ref(this.db, `rooms/${code}`)).remove(); onDisconnect(ref(this.db, `signals/${code}`)).remove(); }
  registerPlayerDisconnect(code, id) { onDisconnect(ref(this.db, `rooms/${code}/players/${id}`)).remove(); }
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
  const store = config ? new FirebaseStore(config) : new LocalStore();
  await store.init();
  return store;
}

export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => alphabet[byte % alphabet.length]).join('');
}

export { cleanCode };
