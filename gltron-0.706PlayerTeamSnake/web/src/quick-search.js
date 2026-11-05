import {atomic} from './atomic.js';
import {rankedRooms,updateQueue,PREFERENCE_WINDOW,PLAYER_WAIT} from './quick-queue.js';

export async function searchQueue({store,entry,signal,roomCode,onStatus,join,host}){
  const path='quickQueue';store.removeOnLeave?.(`${path}/entries/${entry.id}`);
  try{
    while(!signal.aborted){
      const now=store.now(),elapsed=now-entry.joinedAt;
      const queue=await store.get(path),assigned=queue?.groups?.[queue.entries?.[entry.id]?.groupId];
      if(assigned){
        onStatus('Players found. Preparing your shared grid...');
        if(assigned.leaderId===entry.id){
          await host(assigned);
          await atomic(store,path,s=>{if(!s?.groups?.[assigned.id])return;return {...s,groups:{...s.groups,[assigned.id]:{...s.groups[assigned.id],status:'ready'}}};});
          return;
        }
        if(assigned.status==='ready'&&await store.get(`rooms/${assigned.code}`)){
          try{await join(assigned.code);return;}catch(error){if(!/already started|full|slot|No lobby|no longer/.test(error.message))throw error;entry.avoidGroups=[...new Set([...(entry.avoidGroups||[]),assigned.id])];await store.set(`${path}/entries/${entry.id}`,null);}
        }
      }else{
        const remaining=Math.max(0,Math.ceil((PLAYER_WAIT-elapsed)/1000));
        onStatus((elapsed<PREFERENCE_WINDOW?'Finding exact preferences. ':'Finding the closest game. Absolutely required settings stay locked. ')+(entry.preferences.competition==='ranked'?'Waiting for human opponents; ranked never uses bots.':`Waiting for players: ${remaining}s before empty seats become bots.`));
        const rooms=rankedRooms(await store.get('rooms'),entry,now);
        for(const room of rooms){
          if(signal.aborted)return;
          try{await join(room.meta.code);return;}catch(error){if(!/already started|full|slot|No lobby|no longer/.test(error.message))throw error;}
        }
      }
      if(signal.aborted)return;
      await atomic(store,path,current=>updateQueue(current,entry,store.now(),{id:crypto.randomUUID(),code:roomCode()}));
      await new Promise(resolve=>{const abort=()=>{clearTimeout(t);resolve();};const t=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},700);signal.addEventListener('abort',abort,{once:true});});
    }
  }finally{await store.set(`${path}/entries/${entry.id}`,null).catch(()=>{});}
}
