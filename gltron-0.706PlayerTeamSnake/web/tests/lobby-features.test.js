import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quickCandidates,roomConfiguration} from '../src/lobby-features.js';
const room=(meta={},count=1)=>({meta:{code:'ABC123',kind:'game',public:true,mode:'classic',gridSize:720,speed:8.5,clearTrails:true,...meta},players:Object.fromEntries(Array.from({length:count},(_,i)=>[i,{slot:i,bot:i>0}]))});
test('quick match excludes protected, private, full, started and tournament rooms',()=>{
  const rooms={good:room(),private:room({public:false}),password:room({passwordRequired:true}),full:room({},6),started:room({started:true}),tournament:room({kind:'tournament'})};
  assert.deepEqual(quickCandidates(rooms,{localPlayers:1}),[rooms.good]);
});
test('quick match respects all preferences and reserves local rider capacity',()=>{
  const r=room({},4);
  assert.equal(quickCandidates({r},{localPlayers:2,gridSize:'720',mode:'classic',speed:'8.5'}).length,1);
  for(const preferences of [{localPlayers:3},{gridSize:'960'},{mode:'snake'},{speed:'14'}])assert.equal(quickCandidates({r},preferences).length,0);
});
test('quick match excludes expired local hosts',()=>{
  assert.equal(quickCandidates({old:room({hostSeenAt:Date.now()-20000}),live:room({hostSeenAt:Date.now()})},{}).length,1);
});
test('public configuration exposes size, speed, points, bots and crash rule',()=>{
  const text=roomConfiguration(room({matchPoints:7,botDifficulty:3},3)).join(' / ');
  for(const part of ['Large grid','Classic speed','7 points','2 bots · Insane','Crash trails clear'])assert.ok(text.includes(part));
});
