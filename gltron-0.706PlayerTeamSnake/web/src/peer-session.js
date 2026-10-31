import {atomic} from './atomic.js';
import {PeerMesh,pack,unpack} from './peer-mesh.js';

export class PeerSession {
  constructor(options){
    Object.assign(this,options);this.arenas=new Map();this.checkpoints=new Map();this.readies=new Map();this.applied=new Map();this.seq=0;this.closed=false;this.readyAuthority=false;this.roleKey='';this.pendingBeat=false;
    this.held=new Map();this.heldSent=new Map();this.seen=new Map();
    this.mesh=new PeerMesh({...options,onMessage:(id,m)=>this.message(id,m),onState:(id,status)=>{if(status==='connected'&&this.isLeader)this.publish();if(['failed','disconnected'].includes(status)&&id===this.room?.authority?.browserId)this.onStatus?.('Connection interrupted. Reconnecting to the match...');}});
    const url=URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),50)'],{type:'text/javascript'}));
    this.clock=new Worker(url);URL.revokeObjectURL(url);this.clock.onmessage=()=>this.tick();
    this.store.registerPresenceDisconnect?.(this.code,this.browserId);
    this.store.removeOnLeave?.(`rooms/${this.code}/presence/${this.browserId}`);
  }
  now(){return this.store.now?.()||Date.now();}
  update(room){
    this.room=room;if(!room)return;
    this.mesh.update(Object.values(room.players||{}),room.authority?.browserId);
    for(const [id,presence] of Object.entries(room.presence||{}))this.seen.set(id,presence.seenAt);
    const authority=room.authority;if(!authority)return;
    this.isLeader=authority.browserId===this.browserId;
    const key=`${authority.term}:${authority.browserId}`;
    if(key!==this.roleKey){
      this.roleKey=key;this.readyAuthority=false;this.applied.clear();this.readies.clear();this.heldSent.clear();
      for(const arena of this.arenas.values())arena.module.ccall('web_set_replica',null,['number'],[1]);
      Promise.resolve(this.onRole?.(this.isLeader,authority)).then(()=>{
        if(this.closed||this.roleKey!==key)return;
        this.readyAuthority=this.isLeader;
        for(const arena of this.arenas.values())arena.module.ccall('web_set_replica',null,['number'],[this.isLeader?0:1]);
      }).catch(e=>this.onError?.(e));
    }
  }
  async tick(){
    if(this.closed||this.leaving||!this.room)return;
    const now=this.now();
    if(this.room.authority?.leaseUntil<now&&!this.isLeader&&!this.electing){this.electing=true;this.onStatus?.('Host disconnected. Choosing a replacement...');}
    if(this.room.authority?.leaseUntil>=now)this.electing=false;
    const authoritative=Boolean(this.isLeader&&this.readyAuthority&&this.room.authority?.leaseUntil>now);
    for(const arena of this.arenas.values())if(arena.authoritative!==authoritative){arena.authoritative=authoritative;arena.module.ccall('web_set_replica',null,['number'],[authoritative?0:1]);}
    if(!this.pendingBeat&&(!this.lastBeat||now-this.lastBeat>900)){
      this.pendingBeat=true;this.lastBeat=now;
      this.beat().catch(e=>this.onError?.(e)).finally(()=>this.pendingBeat=false);
    }
    if(this.isLeader&&this.readyAuthority&&this.room.authority.leaseUntil>now)this.publish();
  }
  async beat(){
    const now=this.now(),self=Object.values(this.room.players||{}).find(p=>(p.browserId||p.id)===this.browserId);
    if(!self)return;
    await this.store.set(`rooms/${this.code}/presence/${this.browserId}`,{uid:this.store.uid,playerId:self.id,seenAt:now});
    const current=this.room.authority;if(!current)return;
    if(this.isLeader){
      await atomic(this.store,`rooms/${this.code}/authority`,a=>a?.browserId===this.browserId&&a.term===current.term?{...a,leaseUntil:this.now()+4000}:undefined);
    }else if(current.leaseUntil<now){
      const eligible=Object.values(this.room.presence||{}).filter(p=>now-p.seenAt<5000).map(p=>this.room.players?.[p.playerId]).filter(Boolean).sort((a,b)=>(a.browserId||a.id).localeCompare(b.browserId||b.id));
      const next=eligible[0];if(!next||(next.browserId||next.id)!==this.browserId)return;
      await atomic(this.store,`rooms/${this.code}/authority`,a=>a&&a.term===current.term&&a.leaseUntil<this.now()?{term:a.term+1,browserId:this.browserId,uid:this.store.uid,playerId:self.id,leaseUntil:this.now()+4000}:undefined);
    }
  }
  register(id,module,players){
    this.arenas.set(id,{module,players,busy:false});
    module.ccall('web_set_replica',null,['number'],[this.isLeader&&this.readyAuthority?0:1]);
  }
  unregister(id){this.arenas.delete(id);this.checkpoints.delete(id);}
  async publish(){
    if(!this.isLeader||!this.readyAuthority)return;
    for(const [id,arena] of this.arenas){
      if(arena.busy)continue;arena.busy=true;
      try{
        // Departed browsers lose their riders; the remaining simulation survives.
        for(const p of arena.players){const browser=p.browserId||p.id;if(!p.bot&&(!this.room.players?.[p.id]||(browser!==this.browserId&&this.seen.has(browser)&&this.now()-this.seen.get(browser)>6000)))arena.module.ccall('web_drop_player',null,['number'],[p.slot]);}
        this.restoreHeld(id,arena.module);
        if(!arena.module.ccall('web_snapshot_save','number',[],[]))throw Error('Could not save game checkpoint');
        const raw=arena.module.webSnapshot.slice(),seq=++this.seq,term=this.room.authority.term;
        this.checkpoints.set(id,{id,players:arena.players,raw,seq,term,build:arena.module.webBuild});
        const bytes=await pack(raw);
        if(this.isLeader&&this.room.authority.term===term)this.mesh.world({type:'world',id,players:arena.players,seq,term,build:arena.module.webBuild},bytes);
      }catch(error){this.onError?.(error);}finally{arena.busy=false;}
    }
  }
  async message(sender,message){
    const a=this.room?.authority;if(!a)return;
    if(message.type==='world'){
      if(sender!==a.browserId||message.term!==a.term||!Array.isArray(message.players)||message.players.length>6||typeof message.id!=='string')return;
      const previous=this.checkpoints.get(message.id);if(previous?.term===message.term&&previous.seq>=message.seq)return;
      try{
        const raw=await unpack(message.bytes);if(raw.length>160000)return;
        if(this.room.authority.browserId!==sender||this.room.authority.term!==message.term)return;
        const latest=this.checkpoints.get(message.id);if(latest?.term>message.term||(latest?.term===message.term&&latest.seq>=message.seq))return;
        const checkpoint={...message,raw};this.checkpoints.set(message.id,checkpoint);
        await this.onSnapshot?.(checkpoint);
      }catch(error){this.onError?.(error);}
    }else if(message.type==='input'&&this.isLeader&&this.readyAuthority&&message.term===a.term){
      const arena=this.arenas.get(message.id),p=arena?.players.find(p=>p.slot===message.slot&&(p.browserId||p.id)===sender&&!p.bot);
      if(p&&Number.isInteger(message.action)&&message.action>=1&&message.action<=3)arena.module.ccall('web_remote_action',null,['number','number','number'],[p.slot,message.action,message.pressed?1:0]);
    }else if(message.type==='ready'&&this.isLeader&&message.term===a.term){
      if(!this.readies.has(message.id))this.readies.set(message.id,new Set());this.readies.get(message.id).add(sender);
    }
  }
  apply(checkpoint,module){
    if(this.isLeader)return false;
    if(checkpoint.build!==module.webBuild)throw Error('Game updated. Reload all players to use the same version.');
    const key=`${checkpoint.term}:${checkpoint.seq}`;
    if(this.applied.get(checkpoint.id)===key)return true;
    module.webSnapshot=checkpoint.raw;
    if(!module.ccall('web_snapshot_load','number',[],[]))throw Error('Incompatible game checkpoint');
    this.applied.set(checkpoint.id,key);
    this.restoreHeld(checkpoint.id,module);
    this.mesh.send(this.room.authority.browserId,{type:'ready',id:checkpoint.id,term:this.room.authority.term});
    return true;
  }
  input(id,slot,action,pressed){
    const arena=this.arenas.get(id);
    if(action===3)this.held.set(`${id}:${slot}`,pressed);
    if(action>=4){arena?.module.ccall('web_remote_action',null,['number','number','number'],[slot,action,pressed?1:0]);return;}
    if(this.isLeader&&this.readyAuthority)arena?.module.ccall('web_remote_action',null,['number','number','number'],[slot,action,pressed?1:0]);
    else this.mesh.send(this.room.authority.browserId,{type:'input',term:this.room.authority.term,id,slot,action,pressed});
  }
  restoreHeld(id,module){
    const players=this.arenas.get(id)?.players||[],epoch=module.ccall('web_round_generation','number',[],[]);
    for(const p of players.filter(p=>(p.browserId||p.id)===this.browserId&&!p.bot)){
      const pressed=Boolean(this.held.get(`${id}:${p.slot}`)),key=`${this.room.authority.term}:${id}:${epoch}:${p.slot}:${pressed}`;
      if(this.heldSent.get(`${id}:${p.slot}`)===key)continue;
      this.heldSent.set(`${id}:${p.slot}`,key);
      if(this.isLeader)module.ccall('web_remote_action',null,['number','number','number'],[p.slot,3,pressed?1:0]);
      else this.mesh.send(this.room.authority.browserId,{type:'input',term:this.room.authority.term,id,slot:p.slot,action:3,pressed});
    }
  }
  async waitReady(id,players){
    const peers=[...new Set(players.filter(p=>!p.bot).map(p=>p.browserId||p.id))].filter(id=>id!==this.browserId);
    const deadline=performance.now()+25000;
    while(peers.some(peer=>!this.readies.get(id)?.has(peer))){if(this.closed||performance.now()>deadline)throw Error('A rider did not finish loading.');await new Promise(r=>setTimeout(r,100));}
  }
  async leave(){
    this.leaving=true;
    const latest=await this.store.get(`rooms/${this.code}`);
    if(!latest)return;
    this.room=latest;this.isLeader=latest.authority?.browserId===this.browserId;
    if(this.isLeader){
      await this.publish();
      const next=Object.values(this.room.players||{}).filter(p=>!p.bot&&(p.browserId||p.id)!==this.browserId&&(this.mesh.connected(p.browserId||p.id)||this.now()-(this.room.presence?.[p.browserId||p.id]?.seenAt||p.joinedAt)<6000)).sort((a,b)=>Number(this.mesh.connected(b.browserId||b.id))-Number(this.mesh.connected(a.browserId||a.id))||a.joinedAt-b.joinedAt)[0];
      if(next)await atomic(this.store,`rooms/${this.code}/authority`,a=>a?.browserId===this.browserId?{term:a.term+1,browserId:next.browserId||next.id,uid:next.authUid,playerId:next.id,leaseUntil:this.now()+4000}:undefined);
      else{await this.store.set(`signals/${this.code}`,null);await this.store.set(`rooms/${this.code}`,null);return;}
    }
    await this.store.set(`rooms/${this.code}/presence/${this.browserId}`,null);
  }
  close(){this.closed=true;this.clock.terminate();this.mesh.close();}
}
