import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ballotMeta,ranksFromScores,reportKey,tallyBallot,acceptedResult,validateRankedRoster,ladderForMode} from '../src/result-votes.js';
import {initialRating,rateGlicko} from '../src/glicko2.js';
import {deriveRatings} from '../src/rating-history.js';
import {RankedSession} from '../src/ranked-session.js';

const players=n=>Array.from({length:n},(_,slot)=>({id:'p'+slot,name:'Rider '+slot,slot,browserId:'b'+slot,authUid:'u'+slot,ratedUid:'u'+slot,localIndex:0}));
const room=(roster,mode='classic')=>({meta:{code:'RANKED',mode,matchPoints:1,competition:'ranked'},authority:{uid:'u0'},players:Object.fromEntries(roster.map(p=>[p.id,p])),match:{status:'finished',number:1}});
function fixture(votes,mode='classic',roster=players(votes.length)){
  const meta={...ballotMeta(room(roster,mode),roster,100000),game:1},closing={at:100001};
  const reports=Object.fromEntries(meta.voterIds.map((id,i)=>[id,{uid:meta.voters[id].uid,placements:votes[i],key:reportKey(votes[i]),at:100002}]));
  return {meta,closing,reports};
}
const finish=(b,key,method='vote')=>({...b,final:{key,method,at:100003,uid:'u0'}});

test('all six FFA placements count: higher places earn more, tied placements receive equal updates',()=>{
  const ranks=[1,2,3,4,5,6],b=fixture(Array.from({length:6},()=>ranks)),ratings=deriveRatings({game:finish(b,JSON.stringify(ranks))}).normal;
  for(let i=0;i<5;i++)assert.ok(ratings['u'+i].rating>ratings['u'+(i+1)].rating);
  assert.ok(ratings.u2.rating>1500);assert.ok(ratings.u3.rating<1500);
  const tied=[1,2,2,4,5,6],record=fixture(Array.from({length:6},()=>tied)),r=deriveRatings({game:finish(record,JSON.stringify(tied))}).normal;
  assert.equal(r.u1.rating,r.u2.rating);
});

test('Glicko-2 matches Glickman’s published worked example',()=>{
  const result=rateGlicko({...initialRating(),rd:200},[{rating:1400,rd:30,score:1},{rating:1550,rd:100,score:0},{rating:1700,rd:300,score:0}]);
  assert.ok(Math.abs(result.rating-1464.06)<.01);assert.ok(Math.abs(result.rd-151.52)<.01);assert.ok(Math.abs(result.volatility-.059996)<.000001);
});
test('majority defeats host minority; fake host override never affects ratings',()=>{
  const b=fixture([[2,1,3],[1,2,3],[1,2,3]]),t=tallyBallot(b);
  assert.equal(t.status,'resolved');assert.equal(t.candidates[0].votes,2);
  assert.equal(acceptedResult(finish(b,'[2,1,3]')),null);
  const records={game:finish(b,'[1,2,3]')},r=deriveRatings(records);
  assert.ok(r.normal.u0.rating>1500);assert.ok(r.normal.u2.rating<1500);assert.deepEqual(r.snake,{});assert.deepEqual(r.team,{});
});
test('equal top vote counts require host tie-break; genuine placement ties survive',()=>{
  const b=fixture([[1,2,3,4],[1,2,3,4],[2,1,3,4],[2,1,3,4]]);
  assert.equal(tallyBallot(b).status,'tie');assert.equal(acceptedResult(finish(b,'[1,2,3,4]')),null);
  assert.ok(acceptedResult(finish(b,'[2,1,3,4]','host-tiebreak')));
  assert.deepEqual(ranksFromScores([5,5,2]),[1,1,3]);assert.throws(()=>reportKey([1,1,2]));
});
test('full placement lists count together, not separate votes for each position',()=>{
  const b=fixture([[1,2,3],[1,3,2],[1,2,3]]);
  assert.equal(tallyBallot(b).candidates[0].key,'[1,2,3]');
  b.reports.b2.uid='attacker';assert.equal(tallyBallot(b).status,'waiting');
  b.reports.b2.uid='u2';b.reports.b2.key='[2,1,3]';assert.equal(tallyBallot(b).received,2);
  b.reports.b2.key='[1,2,3]';b.reports.b2.at=140000;assert.equal(tallyBallot(b).status,'waiting');
});
test('one browser vote for split screen, only Player 1 earns MMR',()=>{
  const roster=[players(2)[0],{...players(2)[0],id:'guest0',name:'Local guest',slot:1,localIndex:1,ratedUid:''},{...players(2)[1],slot:2},{...players(2)[1],id:'guest1',name:'Local guest 2',slot:3,localIndex:1,ratedUid:''}];
  const b=fixture([[1,2,3,4],[1,2,3,4]],'snake',roster);
  assert.equal(b.meta.voterCount,2);assert.deepEqual(Object.keys(deriveRatings({a:finish(b,'[1,2,3,4]')}).snake).sort(),['u0','u1']);
  const team=fixture([[1,1,3,3],[1,1,3,3]],'teams',roster),r=deriveRatings({t:finish(team,'[1,1,3,3]')});
  assert.ok(r.team.u0.rating>1500);assert.ok(r.team.u1.rating<1500);assert.equal(ladderForMode('team-snake'),'team');
});
test('ranked roster rejects bots, missing Google identity, duplicate accounts',()=>{
  assert.throws(()=>validateRankedRoster([{...players(2)[0],bot:true},players(2)[1]]));
  assert.throws(()=>validateRankedRoster([{...players(2)[0],ratedUid:''},players(2)[1]]));
  assert.throws(()=>validateRankedRoster([players(2)[0],{...players(2)[1],authUid:'u0',ratedUid:'u0'}]));
});
test('disconnect cannot block an unbeatable majority; timeout still requires a reporting quorum',()=>{
  const b=fixture([[1,2,3],[1,2,3],[2,1,3]]);delete b.reports.b2;
  assert.equal(tallyBallot(b).status,'resolved');assert.ok(acceptedResult(finish(b,'[1,2,3]')));
  const partial=fixture([[1,2,3,4],[1,2,3,4],[2,1,3,4],[3,2,1,4]]);delete partial.reports.b3;
  assert.equal(tallyBallot(partial).status,'waiting');assert.equal(tallyBallot(partial,140000).status,'resolved');
  delete partial.reports.b2;assert.equal(tallyBallot(partial,140000).status,'waiting');
});
test('immutable match replay counted once; independent ladders',()=>{
  const a=finish(fixture([[1,2],[1,2]]),'[1,2]'),b=finish(fixture([[2,1],[2,1]],'snake'),'[2,1]');
  const r=deriveRatings({a,b});assert.equal(r.normal.u0.games,1);assert.equal(r.snake.u0.games,1);
  const invalid=structuredClone(a);invalid.meta.players[0].uid='victim';assert.deepEqual(deriveRatings({invalid}),{normal:{},snake:{},team:{}});
});
test('three browser sessions report independently and host commits peer majority',async()=>{
  const roster=players(3),sharedRoom=room(roster),root={rooms:{RANKED:sharedRoom},rankedMatches:{}},listeners=new Set();let now=100000;
  const read=path=>path.split('/').reduce((v,k)=>v?.[k],root),write=(path,value)=>{const keys=path.split('/');let cursor=root;for(const key of keys.slice(0,-1))cursor=cursor[key]??={};cursor[keys.at(-1)]=structuredClone(value);for(const fn of listeners)fn();};
  const sessions=roster.map((p,index)=>{
    const store={uid:p.authUid,user:{uid:p.authUid,google:true},now:()=>now,timestamp:()=>now,get:async path=>structuredClone(read(path)),set:async(path,value)=>write(path,value),putOnce:async(path,value)=>{if(read(path))return false;write(path,value);return true;},watch:(path,fn)=>{const callback=()=>fn(structuredClone(read(path)));listeners.add(callback);callback();return()=>listeners.delete(callback);}};
    const scores=index===0?[1,3,2]:[3,2,1],state={store,browserId:p.browserId,host:index===0,room:sharedRoom,module:{}};
    state.module.ccall=(name,_return,_types,args)=>name==='web_round_finished'?1:scores[args[0]];
    return new RankedSession(state,()=>{});
  });
  try{
    await sessions[0].prepare(roster);for(const s of sessions)s.update(sharedRoom);
    await sessions[0].tick();now++;
    for(const s of sessions)await s.tick();now++;
    await sessions[0].tick();
    const saved=root.rankedMatches[sharedRoom.meta.ballotId];assert.equal(Object.keys(saved.reports).length,3);assert.equal(saved.final.key,'[1,2,3]');assert.equal(saved.final.method,'vote');
    assert.equal(sessions[0].ratings.normal.u0.games,1);
    await sessions[0].tick();assert.equal(sessions[0].ratings.normal.u0.games,1);
  }finally{for(const s of sessions)s.close();}
});
