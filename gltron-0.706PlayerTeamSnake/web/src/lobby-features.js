export const gridName=value=>({240:'Small',480:'Standard',720:'Large',960:'Vast'})[value]||'Large';
export const speedName=value=>({6:'Cruise',8.5:'Classic',11:'Fast',14:'Extreme'})[value]||String(value);
export const gameModeName=value=>({classic:'Classic',snake:'Snake',teams:'3 Teams','team-snake':'Team Snake'})[value]||'Classic';

export function roomConfiguration(room){
  const m=room.meta,players=Object.values(room.players||{}),bots=players.filter(p=>p.bot).length;
  const parts=[m.competition==='ranked'?'Ranked':'Casual',gameModeName(m.mode),`${gridName(m.gridSize||720)} grid`,`${speedName(m.speed||8.5)} speed`,`${m.matchPoints||25} points`,`${bots} bots · ${['Dumb','Fair','Smart','Insane'][m.botDifficulty??2]}`,m.clearTrails!==false?'Crash trails clear':'Crash trails remain'];
  if(m.kind==='tournament'){
    const c=room.tournament.config;
    parts.push(`${c.playersPerHeat} per heat · top ${c.advancePerHeat} advance`,`${c.pointsToWin} points per heat`,`${c.maxParallel} parallel arenas`);
  }
  if(m.passwordRequired)parts.push('Password required');
  return parts;
}

export function quickCandidates(rooms,preferences){
  return Object.values(rooms||{}).filter(room=>{
    const m=room?.meta;if(!m||!m.public||m.started||m.kind!=='game'||m.passwordRequired)return false;
    if((m.competition||'casual')!==(preferences.competition||'casual'))return false;
    if(m.hostSeenAt&&Date.now()-m.hostSeenAt>12000)return false;
    if(Object.keys(room.players||{}).length+Number(preferences.localPlayers||1)>6)return false;
    return ['gridSize','mode','speed'].every(key=>!preferences[key]||String(m[key]??(key==='gridSize'?720:8.5))===String(preferences[key]));
  });
}
