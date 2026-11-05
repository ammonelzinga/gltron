import {initialRating,rateGlicko} from './glicko2.js';
import {acceptedResult,ladderForMode} from './result-votes.js';

export function deriveRatings(records){
  const ladders={normal:{},snake:{},team:{}};
  const history=Object.entries(records||{}).filter(([,b])=>acceptedResult(b)).sort(([id,a],[other,b])=>a.final.at-b.final.at||id.localeCompare(other));
  for(const [,ballot] of history){
    const {meta}=ballot,result=acceptedResult(ballot),ladder=ladders[ladderForMode(meta.mode)],players=meta.players;
    const rated=players.filter(p=>p.primary&&p.uid),previous=Object.fromEntries(rated.map(p=>[p.uid,ladder[p.uid]||initialRating()]));
    if(rated.length<2||new Set(rated.map(p=>p.uid)).size!==rated.length)continue;
    const groups=meta.mode.includes('team')?[...new Set(players.map(p=>Math.floor(p.slot/2)))].map(team=>{
      const members=players.filter(p=>Math.floor(p.slot/2)===team),known=members.filter(p=>p.primary&&p.uid),ratings=known.map(p=>previous[p.uid]);
      return {members,rank:result.placements[players.indexOf(members[0])],rating:ratings.length?ratings.reduce((s,r)=>s+r.rating,0)/ratings.length:1500,rd:ratings.length?Math.sqrt(ratings.reduce((s,r)=>s+r.rd*r.rd,0))/ratings.length:350};
    }):null;
    for(const p of rated){
      let opponents;
      if(groups){
        const own=groups.find(g=>g.members.includes(p)),others=groups.filter(g=>g!==own&&g.members.some(q=>q.primary&&q.uid));
        opponents=others.map(g=>({rating:g.rating,rd:g.rd,score:own.rank<g.rank?1:own.rank===g.rank?.5:0,offset:own.rating-previous[p.uid].rating,share:1/own.members.length,weight:1/others.length}));
      }else{
        const rank=result.placements[players.indexOf(p)],others=rated.filter(q=>q!==p);
        opponents=others.map(q=>({...previous[q.uid],score:rank<result.placements[players.indexOf(q)]?1:rank===result.placements[players.indexOf(q)]?.5:0,weight:1/others.length}));
      }
      if(opponents.length)ladder[p.uid]={...rateGlicko(previous[p.uid],opponents),name:p.name,lastPlayed:ballot.final.at};
    }
  }
  return ladders;
}
