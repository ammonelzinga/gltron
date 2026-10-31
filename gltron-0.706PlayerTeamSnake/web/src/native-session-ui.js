// The UI supplies engine creation/rendering hooks. No video is transmitted.
export function nativeSessionHooks(state,ui){
  let loading=null;
  const selectedId=()=>state.room?.meta.kind==='game'?'single':state.guestMatchId;
  async function snapshot(checkpoint){
    if(state.host||checkpoint.id!==selectedId()||!state.guestConnection)return;
    if(state.nativeArenaId!==checkpoint.id||!state.module){
      if(loading)return;
      loading=(async()=>{
        if(state.nativeArenaId)state.network.arenas.delete(state.nativeArenaId);
        state.module?.webClock?.terminate();
        state.viewStops.splice(0).forEach(stop=>stop());
        const canvas=ui.source();
        state.module=await ui.create(canvas,checkpoint.players);
        state.nativeArenaId=checkpoint.id;
        state.network.register(checkpoint.id,state.module,checkpoint.players);
        const own=checkpoint.players.filter(p=>state.localPlayers.some(local=>local.id===p.id)).map(p=>p.slot);
        state.localViewController=ui.mirror(canvas,ui.view(),own.length?own:[0],checkpoint.players,state.module,{spectator:state.spectating});
        const latest=state.network.checkpoints.get(checkpoint.id)||checkpoint;
        state.network.apply(latest,state.module);ui.loaded();
      })();
      try{await loading;}finally{loading=null;}
    }else{state.network.apply(checkpoint,state.module);ui.loaded();}
  }
  async function role(leader){
    state.host=leader;
    if(!leader){clearInterval(state.singleRoundTimer);for(const arena of state.arenas.values())clearInterval(arena.timer);}
    if(leader&&state.room.meta.started){
      ui.status('Taking over the grid...');
      await ui.recover();
      ui.status('Hosting match - locally rendered');
    }
    ui.render(state.room);
  }
  return {snapshot,role};
}
