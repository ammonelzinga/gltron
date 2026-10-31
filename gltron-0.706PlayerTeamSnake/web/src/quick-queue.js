export const PREFERENCE_WINDOW=10000;
const dimensions=['gridSize','mode','speed'];
const choices={gridSize:[720,240,480,960],mode:['classic','snake','teams','team-snake'],speed:[8.5,6,11,14]};
export function distance(config,preferences){
  return dimensions.reduce((score,key)=>{
    if(!preferences[key])return score;
    if(key==='mode')return score+(config[key]===preferences[key]?0:2);
    return score+Math.abs(Number(config[key])-Number(preferences[key]))/(key==='gridSize'?720:8);
  },0);
}
export function accepts(config,entry,now){
  return dimensions.every(key=>!entry.preferences[key]||(!entry.required[key]&&now-entry.joinedAt>=PREFERENCE_WINDOW)||String(config[key])===String(entry.preferences[key]));
}
export function rankedRooms(rooms,entry,now){
  return Object.values(rooms||{}).filter(room=>{
    const m=room?.meta;
    return m?.public&&m.kind==='game'&&!m.started&&!m.passwordRequired&&(!room.authority||room.authority.leaseUntil>now)&&Object.keys(room.players||{}).length+entry.localPlayers<=6&&accepts(m,entry,now);
  }).sort((a,b)=>distance(a.meta,entry.preferences)-distance(b.meta,entry.preferences)||a.meta.createdAt-b.meta.createdAt);
}

export function updateQueue(current,entry,now,proposal){
  const state=current||{entries:{},groups:{}};state.entries??={};state.groups??={};
  for(const [id,e] of Object.entries(state.entries))if(now-e.seenAt>7000)delete state.entries[id];
  for(const [id,g] of Object.entries(state.groups)){
    if(now-g.createdAt>60000||(!state.entries[g.leaderId]&&g.status!=='ready')||(g.status!=='ready'&&now-g.createdAt>14000)){
      for(const e of Object.values(state.entries))if(e.groupId===id)delete e.groupId;
      delete state.groups[id];
    }
  }
  const previous=state.entries[entry.id];state.entries[entry.id]={...entry,seenAt:now,...(previous?.groupId&&state.groups[previous.groupId]?{groupId:previous.groupId}:{})};
  if(state.entries[entry.id].groupId)return state;
  const pending=Object.values(state.entries).filter(e=>!e.groupId).sort((a,b)=>a.joinedAt-b.joinedAt||a.id.localeCompare(b.id));
  for(const first of pending){
    let best=null;
    for(const gridSize of choices.gridSize)for(const mode of choices.mode)for(const speed of choices.speed){
      const config={gridSize,mode,speed};if(!accepts(config,first,now))continue;
      const compatible=pending.filter(e=>e.id!==first.id&&accepts(config,e,now)).sort((a,b)=>distance(config,a.preferences)-distance(config,b.preferences)||a.joinedAt-b.joinedAt);
      const members=[first];let riders=first.localPlayers;
      for(const other of compatible)if(riders+other.localPlayers<=6){members.push(other);riders+=other.localPlayers;}
      if(riders<2)continue;
      const score=members.reduce((sum,e)=>sum+distance(config,e.preferences),0);
      if(!best||riders>best.riders||(riders===best.riders&&score<best.score))best={members,riders,score,config};
    }
    if(best){
      const group={id:proposal.id,code:proposal.code,createdAt:now,leaderId:first.id,entryIds:best.members.map(e=>e.id),config:best.config,status:'forming'};
      state.groups[group.id]=group;for(const e of best.members)state.entries[e.id].groupId=group.id;
      break;
    }
  }
  return state;
}
