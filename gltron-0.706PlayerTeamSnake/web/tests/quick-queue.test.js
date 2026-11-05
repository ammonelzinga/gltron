import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accepts,rankedRooms,updateQueue,prepareQuickMatch,randomBotDifficulty} from '../src/quick-queue.js';
const entry=(id,prefs={},required={},time=1000)=>({id,joinedAt:time,seenAt:time,localPlayers:1,preferences:prefs,required});
test('soft preferences relax only after ten seconds; required preferences never relax',()=>{
  const e=entry('a',{gridSize:'960',mode:'snake',speed:'14'},{mode:true});
  assert.equal(accepts({gridSize:720,mode:'snake',speed:6},e,10999),false);
  assert.equal(accepts({gridSize:720,mode:'snake',speed:6},e,11000),true);
  assert.equal(accepts({gridSize:960,mode:'classic',speed:14},e,1000000),false);
});
test('fallback ranks the closest open room and excludes closed, full, protected rooms',()=>{
  const make=(gridSize,extra={})=>({meta:{public:true,kind:'game',gridSize,mode:'classic',speed:8.5,createdAt:1,...extra},players:{}});
  const rooms={far:make(240),near:make(720),private:make(960,{public:false}),password:make(960,{passwordRequired:true}),started:make(960,{started:true})};
  assert.deepEqual(rankedRooms(rooms,entry('a',{gridSize:'960'}),11000),[rooms.near,rooms.far]);
});
test('pool groups compatible browsers once; conflicting required settings remain queued',()=>{
  const a=entry('a',{mode:'classic'},{mode:true}),b=entry('b',{mode:'snake'},{mode:true});
  let state=updateQueue(null,a,1000,{id:'g1',code:'AAAAAA'});
  state=updateQueue(state,b,1001,{id:'g2',code:'BBBBBB'});
  assert.equal(Object.keys(state.groups).length,0);
  state=updateQueue(state,entry('c',{mode:'classic'},{mode:true}),1002,{id:'g3',code:'CCCCCC'});
  assert.deepEqual(state.groups.g3.entryIds,['a','c']);assert.equal(state.entries.b.groupId,undefined);
});
test('pool counts physical local riders, never overfills six',()=>{
  const a={...entry('a'),localPlayers:4},b={...entry('b'),localPlayers:3};
  const state=updateQueue({entries:{b},groups:{}},a,1000,{id:'g',code:'AAAAAA'});
  assert.ok(state.groups.g.entryIds.length===1);assert.equal(state.groups.g.entryIds[0],'a');
});

test('solo casual waits thirty seconds before creating a bot match; ranked keeps waiting',()=>{
  const proposal={id:'g',code:'ABCDEF'},solo=entry('solo',{mode:'snake'},{mode:true});
  assert.equal(Object.keys(updateQueue(null,solo,30999,proposal).groups).length,0);
  const group=updateQueue(null,solo,31000,proposal).groups.g;
  assert.equal(group.deadline,31000);assert.equal(group.riders,1);assert.equal(group.config.mode,'snake');
  assert.equal(Object.keys(updateQueue(null,{...solo,preferences:{competition:'ranked'}},31000,proposal).groups).length,0);
});

test('bot difficulty weighted draw favors Insane and includes every native level',()=>{
  const counts=[0,0,0,0];for(let i=0;i<1000;i++)counts[randomBotDifficulty(()=>(i+.5)/1000)]++;
  assert.deepEqual(counts,[50,150,300,500]);
});

test('late queue entry reserves a forming or just-ready pool instead of splitting local riders',()=>{
  for(const status of ['forming','ready']){
    const a={...entry('a'),uid:'a',localPlayers:3},b={...entry('b'),uid:'b',localPlayers:3};
    let state=updateQueue(null,a,1000,{id:'first',code:'AAAAAA'});state.groups.first.status=status;
    state=updateQueue(state,b,1100,{id:'second',code:'BBBBBB'});
    assert.equal(Object.keys(state.groups).length,1);assert.deepEqual(state.groups.first.entryIds,['a','b']);assert.equal(state.groups.first.riders,6);
  }
});

test('atomic quick start fills six only at deadline, preserves humans, and locks further admission',()=>{
  const room={meta:{createdAt:0,quickDeadline:30000,competition:'casual'},players:{a:{id:'a',slot:0},b:{id:'b',slot:3}}};
  const bots=Array.from({length:6},(_,i)=>({id:'bot'+i,authUid:'host',bot:true,botDifficulty:i%4}));
  assert.throws(()=>prepareQuickMatch(room,29999,bots),/waiting/);
  const ready=prepareQuickMatch(room,30000,bots);assert.equal(Object.keys(ready.players).length,6);assert.equal(ready.players.b.slot,3);assert.equal(ready.meta.starting,true);assert.equal(Object.keys(room.players).length,2);assert.equal(Object.keys(ready.slots).length,4);
  assert.equal(Object.values(ready.players).filter(p=>p.bot).length,4);
  const ranked=prepareQuickMatch({...room,meta:{...room.meta,competition:'ranked',mode:'classic'}},30000,bots);assert.equal(Object.keys(ranked.players).length,2);
  assert.throws(()=>prepareQuickMatch({...room,meta:{...room.meta,competition:'ranked',mode:'teams'}},30000,bots),/human/);
  const full={...room,players:Object.fromEntries(Array.from({length:6},(_,i)=>[i,{id:String(i),slot:i}]))};assert.equal(Object.keys(prepareQuickMatch(full,1000,bots).players).length,6);
});

test('four or five humans start early without any bots; existing quick-lobby bots are removed',()=>{
  for(const count of [4,5]){
    const room={meta:{createdAt:0,quickDeadline:30000,competition:'casual'},players:Object.fromEntries(Array.from({length:count},(_,i)=>['p'+i,{id:'p'+i,slot:i}]))};
    room.players.bot={id:'bot',slot:count,bot:true};room.slots={[count]:{playerId:'bot'}};
    const ready=prepareQuickMatch(room,1000,[]);assert.equal(Object.keys(ready.players).length,count);assert.ok(Object.values(ready.players).every(p=>!p.bot));assert.equal(ready.slots[count],undefined);
  }
});
