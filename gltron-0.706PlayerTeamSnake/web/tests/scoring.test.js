import test from 'node:test';
import assert from 'node:assert/strict';
import {readGameScores,TRAP_SCORING} from '../src/scoring.js';
import {ranksFromScores} from '../src/result-votes.js';
import {rankMatch} from '../src/tournament.js';
const players=Array.from({length:4},(_,slot)=>({id:'p'+slot,slot}));
test('tiered totals use awarded quarter-points, not a fixed multiplier of trap count',()=>{
  const survival=[10,12],traps=[4,1],points=[3.25,2];
  const module={ccall(name,_,__,[slot]){return name==='web_player_survival'?survival[slot]:name==='web_player_traps'?traps[slot]:name==='web_player_trap_points'?points[slot]:survival[slot]+points[slot];}};
  const result=readGameScores(module,players.slice(0,2),'classic',TRAP_SCORING);assert.deepEqual(result.totals,[13.25,14]);assert.deepEqual(result.ranks,[2,1]);assert.equal(result.stats.p0.trapPoints,3.25);
});
test('half-point totals use trap count to resolve equal points; exact ties stay shared',()=>{
  const survival=[24,25,24,23],traps=[2,0,2,4];
  const module={ccall(name,_,__,[slot]){return name==='web_player_survival'?survival[slot]:name==='web_player_traps'?traps[slot]:survival[slot]+.5*traps[slot];}};
  const result=readGameScores(module,players,'classic','traps-half-v1');
  assert.deepEqual(result.totals,[25,25,25,25]);assert.deepEqual(result.ranks,[2,4,2,1]);assert.deepEqual(result.stats.p3,{survival:23,traps:4,trapPoints:2});
  assert.deepEqual(ranksFromScores([25,25,24]),[1,1,3]);
  assert.throws(()=>ranksFromScores([25,25],[0,.5]),/trap counts/);
});
test('team placements use shared team score and combined teammate traps',()=>{
  const traps=[1,1,3,1],module={ccall(name,_,__,[slot]){return name==='web_team_score'?25:name==='web_player_traps'?traps[slot]:0;}};
  const result=readGameScores(module,players,'teams',TRAP_SCORING);assert.deepEqual(result.ranks,[3,3,1,1]);assert.deepEqual(result.traps,[2,2,4,4]);
});
test('tournament qualifiers preserve half points and break a cutoff tie using traps',()=>{
  const match={playerIds:['a','b','c'],advanceCount:1,pointsToWin:25,traps:{a:1,b:2,c:0}};
  const result=rankMatch(match,{a:25.5,b:25.5,c:20});assert.deepEqual(result.winners,['b']);assert.equal(result.scores.b,25.5);
  assert.throws(()=>rankMatch({...match,traps:{a:2,b:2}},{a:25.5,b:25.5,c:20}),/tie/);
});
