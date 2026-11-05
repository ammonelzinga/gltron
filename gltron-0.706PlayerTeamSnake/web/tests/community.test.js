import test from 'node:test';
import assert from 'node:assert/strict';
import {leaderboard} from '../src/community.js';
import {admitParty} from '../src/party-admission.js';
import {updateQueue,rankedRooms} from '../src/quick-queue.js';
test('leaderboards share rounded ranks, retain own rank outside top ten, exclude unplayed',()=>{
  const ratings=Object.fromEntries(Array.from({length:120},(_,i)=>['u'+i,{rating:2000-i,games:3,name:'Rider '+i}]));ratings.u1.rating=1999.8;ratings.none={rating:3000,games:0};
  const board=leaderboard(ratings,'u119',10);assert.equal(board.rows.length,10);assert.equal(board.total,120);assert.equal(board.rows[1].rank,1);assert.equal(board.rows[2].rank,3);assert.equal(board.own.rank,120);assert.equal(leaderboard(ratings,'u119',100).rows.length,100);
});
const member=(id,index=0)=>({id:id+'_'+index,browserId:id,authUid:id,localIndex:index,ratedUid:index===0?id:'',name:id,role:'player'});
const room=()=>({meta:{kind:'game',competition:'casual',started:false},players:{host:{...member('host'),slot:0}}});
test('party admission reserves every local seat in one transaction, no partial full-lobby joins',()=>{
  const original=room(),players=[member('a'),member('a',1),member('b')],joined=admitParty(original,{id:'r'},players);
  assert.equal(Object.keys(joined.players).length,4);assert.equal(Object.keys(original.players).length,1);assert.equal(new Set(Object.values(joined.players).map(p=>p.slot)).size,4);
  assert.equal(Object.keys(admitParty(joined,{id:'r'},players).players).length,4);
  assert.throws(()=>admitParty(joined,{id:'over'},[member('c'),member('c',1),member('d')]),/whole group/);
  joined.meta.starting=true;assert.throws(()=>admitParty(joined,{id:'late'},[member('d')]),/started/);
});
test('ranked group pooling counts browser accounts and physical seats independently',()=>{
  const entry={id:'party',uid:'a',localPlayers:3,browserCount:2,accountUids:['a','b'],joinedAt:0,seenAt:0,preferences:{competition:'ranked'},required:{}};
  const queue=updateQueue(null,entry,0,{id:'g',code:'ABCDEF'});assert.equal(queue.groups.g.entryIds.length,1);
  const r=room();r.meta={...r.meta,competition:'ranked',public:true};r.players.host.authUid='b';r.players.host.localIndex=0;
  assert.equal(rankedRooms({r},entry,0).length,0);
});
