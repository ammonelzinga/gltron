import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accepts,rankedRooms,updateQueue} from '../src/quick-queue.js';
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
