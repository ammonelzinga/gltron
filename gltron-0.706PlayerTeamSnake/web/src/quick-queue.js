export const PREFERENCE_WINDOW=10000;
export const PLAYER_WAIT=30000;
export const QUICK_HUMAN_TARGET=4;
export const BOT_DIFFICULTIES=['Dumb','Fair','Smart','Insane'];
export function randomBotDifficulty(random=Math.random){
  const roll=random();return roll<.05?0:roll<.20?1:roll<.50?2:3;
}
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
  if((config.competition||'casual')!==(entry.preferences.competition||'casual'))return false;
  return dimensions.every(key=>!entry.preferences[key]||(!entry.required[key]&&now-entry.joinedAt>=PREFERENCE_WINDOW)||String(config[key])===String(entry.preferences[key]));
}
export function rankedRooms(rooms,entry,now){
  return Object.values(rooms||{}).filter(room=>{
    const m=room?.meta;
    if(m?.competition==='ranked'&&Object.values(room.players||{}).some(p=>p.localIndex===0&&(entry.accountUids||[entry.uid]).includes(p.authUid)))return false;
    return m?.public&&m.kind==='game'&&!m.started&&!m.starting&&!m.passwordRequired&&(!room.authority||room.authority.leaseUntil>now)&&Object.keys(room.players||{}).length+entry.localPlayers<=6&&accepts(m,entry,now);
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
  // Reserve an existing pool before creating another one. Its lobby may still
  // be in flight, or may have appeared just after this browser searched rooms.
  const available=Object.values(state.groups).filter(g=>
    ['forming','ready'].includes(g.status)&&now<g.deadline&&
    !(entry.avoidGroups||[]).includes(g.id)&&(g.riders||0)+entry.localPlayers<=6&&accepts(g.config,entry,now)&&
    !(g.config.competition==='ranked'&&(entry.accountUids||[entry.uid]).some(uid=>(g.accountUids||[]).includes(uid)))
  ).sort((a,b)=>distance(a.config,entry.preferences)-distance(b.config,entry.preferences)||a.createdAt-b.createdAt);
  if(available.length){
    const group=available[0];group.entryIds.push(entry.id);group.riders+=entry.localPlayers;
    group.accountUids=[...(group.accountUids||[]),...(entry.accountUids||[entry.uid])];
    state.entries[entry.id].groupId=group.id;return state;
  }
  const pending=Object.values(state.entries).filter(e=>!e.groupId).sort((a,b)=>a.joinedAt-b.joinedAt||a.id.localeCompare(b.id));
  for(const first of pending){
    let best=null;
    for(const gridSize of choices.gridSize)for(const mode of choices.mode)for(const speed of choices.speed){
      const config={gridSize,mode,speed,competition:first.preferences.competition||'casual'};if(!accepts(config,first,now))continue;
      const compatible=pending.filter(e=>e.id!==first.id&&accepts(config,e,now)).sort((a,b)=>distance(config,a.preferences)-distance(config,b.preferences)||a.joinedAt-b.joinedAt);
      const members=[first];let riders=first.localPlayers;
      for(const other of compatible)if(riders+other.localPlayers<=6&&!(config.competition==='ranked'&&members.some(member=>(member.accountUids||[member.uid]).some(uid=>(other.accountUids||[other.uid]).includes(uid))))){members.push(other);riders+=other.localPlayers;}
      if(riders<(config.competition==='ranked'&&mode.includes('team')?3:2)&&!(config.competition==='casual'&&now-first.joinedAt>=PLAYER_WAIT))continue;
      if(config.competition==='ranked'&&members.reduce((sum,e)=>sum+(e.browserCount||1),0)<2)continue;
      const score=members.reduce((sum,e)=>sum+distance(config,e.preferences),0);
      if(!best||riders>best.riders||(riders===best.riders&&score<best.score))best={members,riders,score,config};
    }
    if(best){
      const group={id:proposal.id,code:proposal.code,createdAt:now,deadline:first.joinedAt+PLAYER_WAIT,riders:best.riders,accountUids:best.members.flatMap(e=>e.accountUids||[e.uid]).filter(Boolean),leaderId:first.id,entryIds:best.members.map(e=>e.id),config:best.config,status:'forming'};
      state.groups[group.id]=group;for(const e of best.members)state.entries[e.id].groupId=group.id;
      break;
    }
  }
  return state;
}

export function prepareQuickMatch(room,now,bots){
  if(!room)throw Error('That lobby no longer exists.');
  if(room.meta.started)throw Error('That match has already started.');
  const next=structuredClone(room),players=Object.values(next.players||{}),humans=players.filter(p=>!p.bot),ranked=next.meta.competition==='ranked';
  const deadline=next.meta.quickDeadline??next.meta.createdAt+PLAYER_WAIT;
  if(humans.length<QUICK_HUMAN_TARGET&&now<deadline)throw Error('Still waiting for players.');
  if(ranked&&(humans.length<2||(next.meta.mode.includes('team')&&humans.length<3)))throw Error('Ranked is waiting for human opponents. Bots never affect MMR.');
  if(ranked&&players.some(p=>p.bot))throw Error('Ranked games cannot include bots.');
  next.players??={};next.slots??={};
  if(humans.length>=QUICK_HUMAN_TARGET){
    for(const player of players.filter(p=>p.bot)){delete next.players[player.id];delete next.slots[player.slot];}
  }
  if(!ranked&&humans.length<QUICK_HUMAN_TARGET){
    const used=new Set(players.map(p=>p.slot));let index=0;
    for(let slot=0;slot<6;slot++)if(!used.has(slot)){
      const bot=bots[index++];if(!bot)throw Error('Could not prepare bot roster.');
      next.players[bot.id]={...bot,slot};next.slots[slot]={uid:bot.authUid,playerId:bot.id,slot};
    }
  }
  next.meta.starting=true;
  return next;
}
