export const REPORT_WINDOW=30000;
export const ladderForMode=mode=>mode.includes('team')?'team':mode==='snake'?'snake':'normal';

export function validBallotMeta(meta){
  if(meta?.scoring!==undefined&&!['survival-v1','traps-half-v1','traps-tiered-v2'].includes(meta.scoring))return false;
  if(meta?.version!==1||!['classic','snake','teams','team-snake'].includes(meta.mode)||!Array.isArray(meta.players)||meta.players.length<2||meta.players.length>6)return false;
  if(!Number.isInteger(meta.points)||meta.points<1||meta.points>99||!Number.isFinite(meta.createdAt)||!Number.isInteger(meta.game)||meta.game<1)return false;
  if(meta.voterCount<2||meta.voterCount>6||!Array.isArray(meta.voterIds)||meta.voterIds.length!==meta.voterCount||new Set(meta.voterIds).size!==meta.voterCount)return false;
  const ids=new Set(),uids=new Set(),browsers=new Set();
  for(const [i,p] of meta.players.entries()){
    if(!p||p.slot!==i||typeof p.id!=='string'||typeof p.browserId!=='string'||typeof p.name!=='string'||ids.has(p.id))return false;
    ids.add(p.id);
    if(p.primary){
      if(!p.uid||uids.has(p.uid)||browsers.has(p.browserId)||!meta.voterIds.includes(p.browserId)||meta.voters?.[p.browserId]?.uid!==p.uid||meta.voters?.[p.browserId]?.playerId!==p.id)return false;
      uids.add(p.uid);browsers.add(p.browserId);
    }else if(p.uid)return false;
  }
  return browsers.size===meta.voterCount&&meta.players.every(p=>browsers.has(p.browserId));
}

export function validateRankedRoster(players){
  if(players.some(p=>p.bot))throw Error('Bots are available in casual games.');
  const browsers=new Map();
  for(const p of players){
    if(!browsers.has(p.browserId))browsers.set(p.browserId,[]);
    browsers.get(p.browserId).push(p);
  }
  const primaries=[...browsers.values()].map(group=>group.find(p=>p.localIndex===0));
  if(primaries.length<2)throw Error('Ranked needs at least two signed-in browsers.');
  if(primaries.some(p=>!p.ratedUid||p.ratedUid!==p.authUid))throw Error('Every browser’s Player 1 must sign in with Google for ranked.');
  if(new Set(primaries.map(p=>p.ratedUid)).size!==primaries.length)throw Error('Each ranked browser needs a different Google account.');
  return primaries;
}

export function ballotMeta(room,players,now){
  const primary=validateRankedRoster(players);
  if(room.meta.mode.includes('team')&&new Set(players.map(p=>Math.floor(p.slot/2))).size<2)throw Error('Team ranked needs at least two teams (three or more riders).');
  return {version:1,room:room.meta.code,hostUid:room.authority.uid,mode:room.meta.mode,scoring:room.meta.scoring||'survival-v1',points:room.meta.matchPoints||25,createdAt:now,
    players:players.map(p=>({id:p.id,name:p.name,browserId:p.browserId,slot:p.slot,uid:p.localIndex===0?p.ratedUid:'',primary:p.localIndex===0})),
    voterIds:primary.map(p=>p.browserId),voterCount:primary.length,
    voters:Object.fromEntries(primary.map(p=>[p.browserId,{uid:p.ratedUid,playerId:p.id}]))};
}

export function ranksFromScores(scores,traps){
  if(!Array.isArray(scores)||scores.length<2||scores.length>6||scores.some(s=>!Number.isFinite(s)||s<0))throw Error('Invalid final scores');
  if(traps!==undefined&&(!Array.isArray(traps)||traps.length!==scores.length||traps.some(n=>!Number.isInteger(n)||n<0)))throw Error('Invalid trap counts');
  return scores.map((score,i)=>1+scores.filter((other,j)=>other>score||(other===score&&traps&&traps[j]>traps[i])).length);
}
export function reportKey(ranks){
  if(!Array.isArray(ranks)||ranks.length<2||ranks.length>6||ranks.some(r=>!Number.isInteger(r)||r<1||r>ranks.length))throw Error('Invalid placements');
  // Competition ranks: [1,1,3] is a real tie, [1,1,2] is not canonical.
  if(ranks.some(rank=>rank!==1+ranks.filter(other=>other<rank).length))throw Error('Noncanonical placements');
  return JSON.stringify(ranks);
}
export function tallyBallot(ballot,now=ballot?.final?.at??ballot?.closing?.at??0){
  const meta=ballot?.meta,groups=new Map(),seen=new Set();
  if(!validBallotMeta(meta))return {status:'invalid',received:0,total:0,candidates:[]};
  let received=0;
  for(const id of meta.voterIds){
    const voter=meta.voters?.[id],report=ballot.reports?.[id];
    if(!voter||seen.has(voter.uid))return {status:'invalid',received,total:meta.voterCount,candidates:[]};
    seen.add(voter.uid);
    if(!report)continue;
    try{
      if(report.uid!==voter.uid||report.placements.length!==meta.players.length||report.key!==reportKey(report.placements))continue;
      if(!Number.isFinite(ballot.closing?.at)||!Number.isFinite(report.at)||report.at<ballot.closing.at||report.at>ballot.closing.at+REPORT_WINDOW)continue;
      if(ballot.final&&report.at>ballot.final.at)continue;
      if(meta.mode.includes('team')&&meta.players.some((p,i)=>meta.players.some((q,j)=>Math.floor(p.slot/2)===Math.floor(q.slot/2)&&report.placements[i]!==report.placements[j])))continue;
      received++;const group=groups.get(report.key)||{key:report.key,placements:report.placements,votes:0};group.votes++;groups.set(report.key,group);
    }catch{ /* Invalid reports never count as votes. */ }
  }
  const highest=Math.max(0,...[...groups.values()].map(g=>g.votes));
  const candidates=[...groups.values()].filter(g=>g.votes===highest).sort((a,b)=>a.key.localeCompare(b.key));
  const remaining=meta.voterCount-received,second=Math.max(0,...[...groups.values()].filter(g=>g!==candidates[0]).map(g=>g.votes));
  const unbeatable=candidates.length===1&&highest>second+remaining;
  const closed=now>=ballot.closing?.at+REPORT_WINDOW&&received>meta.voterCount/2;
  const ready=received===meta.voterCount||unbeatable||closed;
  return {status:ready?(candidates.length===1?'resolved':'tie'):'waiting',received,total:meta.voterCount,candidates};
}

export function acceptedResult(ballot){
  if(!ballot?.final||!Number.isFinite(ballot.final.at)||ballot.final.method==='void')return null;
  const tally=tallyBallot(ballot);
  if(!Object.values(ballot.meta?.voters||{}).some(v=>v.uid===ballot.final.uid))return null;
  if(!['resolved','tie'].includes(tally.status))return null;
  const winner=tally.candidates.find(c=>c.key===ballot.final.key);
  if(!winner||ballot.final.at<ballot.closing.at)return null;
  if(ballot.final.method!==(tally.status==='tie'?'host-tiebreak':'vote'))return null;
  return winner;
}
