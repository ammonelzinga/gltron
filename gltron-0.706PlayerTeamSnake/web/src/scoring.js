import {ranksFromScores} from './result-votes.js';
export const TRAP_SCORING='traps-tiered-v2';
export const usesTrapScoring=scoring=>[TRAP_SCORING,'traps-half-v1'].includes(scoring);
export function readGameScores(module,players,mode,scoring){
  const team=mode.includes('team'),trapScoring=usesTrapScoring(scoring);
  const call=(name,index)=>module.ccall(name,'number',['number'],[index]);
  const stats=Object.fromEntries(players.map(p=>[p.id,{survival:call('web_player_survival',p.slot),traps:call('web_player_traps',p.slot),trapPoints:scoring===TRAP_SCORING?call('web_player_trap_points',p.slot):scoring==='traps-half-v1'?0.5*call('web_player_traps',p.slot):0}]));
  const totals=players.map(p=>call(team?'web_team_score':'web_player_score',team?Math.floor(p.slot/2):p.slot));
  const traps=players.map(p=>team?players.filter(q=>Math.floor(q.slot/2)===Math.floor(p.slot/2)).reduce((sum,q)=>sum+stats[q.id].traps,0):stats[p.id].traps);
  return {scores:Object.fromEntries(players.map((p,i)=>[p.id,totals[i]])),stats,totals,traps,ranks:ranksFromScores(totals,trapScoring?traps:undefined)};
}
