// Pure transaction: either every party rider receives a seat, or nobody does.
export function admitParty(room,request,players){
  if(!room)throw Error('That lobby no longer exists.');
  if(room.meta.started||room.meta.starting)throw Error('That match has already started.');
  if(!players.length||players.length>6)throw Error('Groups support up to six riders.');
  const next=structuredClone(room),current=Object.values(next.players||{}),extra=players.filter(p=>!current.some(old=>old.browserId===p.browserId&&old.localIndex===p.localIndex));
  const capacity=next.meta.kind==='game'?6:next.tournament.config.maxEntrants+(next.meta.hostParticipates===false?1:0);
  if(current.length+extra.length>capacity)throw Error('Not enough open slots for your whole group.');
  if(next.meta.competition==='ranked'){
    const primaries=[...current,...extra].filter(p=>p.localIndex===0),uids=primaries.map(p=>p.ratedUid);
    if(uids.some(uid=>!uid)||new Set(uids).size!==uids.length)throw Error('Ranked needs a different Google account for every browser.');
  }
  next.players??={};next.slots??={};const used=new Set(current.map(p=>p.slot));
  for(const player of extra){const slot=Array.from({length:capacity},(_,i)=>i).find(i=>!used.has(i));used.add(slot);next.players[player.id]={...player,slot};next.slots[slot]={uid:player.authUid,playerId:player.id,slot};}
  next.joinRequests??={};next.joinRequests[request.id]={...request,response:{status:'admitted'}};
  return next;
}
