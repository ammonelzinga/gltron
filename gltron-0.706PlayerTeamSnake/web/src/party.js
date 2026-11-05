import {makeRoomCode,cleanCode} from './store.js';
import {open,seal,randomSalt} from './crypto.js';
const $=s=>document.querySelector(s);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class PartySession{
  constructor(state,{enter}){
    this.state=state;this.store=state.store;this.enter=enter;this.done=new Set();this.processing=new Set();
    $('#party-create').onclick=()=>this.run(()=>this.join(makeRoomCode(),true));
    $('#party-create').disabled=false;
    $('#party-join').onclick=()=>this.run(()=>this.join(cleanCode($('#party-code').value)));
    $('#party-leave').onclick=()=>this.run(()=>this.leave());
    $('#party-copy').onclick=()=>this.run(async()=>{await navigator.clipboard.writeText(location.origin+location.pathname+'?party='+this.code);this.message('Group invite copied.');});
    for(const selector of ['#player-name','#local-players','#party-ranked'])$(selector).addEventListener('change',()=>this.run(()=>this.heartbeat()));
    const clockURL=URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),1000)'],{type:'text/javascript'}));
    this.clock=new Worker(clockURL);URL.revokeObjectURL(clockURL);this.clock.onmessage=()=>this.tick().catch(error=>this.message(error.message));
    addEventListener('beforeunload',()=>this.clock.terminate(),{once:true});
    const code=cleanCode(new URLSearchParams(location.search).get('party')||sessionStorage.getItem('gltrof-party')||'');
    if(code)this.run(()=>this.join(code));
  }
  message(text){$('#party-status').textContent=text;}
  async run(fn){try{return await fn();}catch(error){this.message(error.message);}}
  members(){return Object.values(this.party?.members||{}).filter(m=>this.store.now()-m.seenAt<15000).sort((a,b)=>a.joinedAt-b.joinedAt||a.browserId.localeCompare(b.browserId));}
  seats(){return this.members().reduce((sum,m)=>sum+m.localPlayers,0);}
  active(){return Boolean(this.code&&this.members().length>1);}
  own(){return {uid:this.store.uid,browserId:this.state.browserId,name:$('#player-name').value.trim().slice(0,24)||'Grid rider',localPlayers:Number($('#local-players').value),google:this.store.user.google,allowRanked:$('#party-ranked').checked&&this.store.user.google,seenAt:this.store.now(),joinedAt:this.joinedAt,status:this.state.room?'lobby':'home',roomCode:this.state.room?.meta.code||''};}
  async join(code,create=false){
    if(this.state.room)throw Error('Leave your match before changing groups.');
    if(!/^[A-Z0-9]{6,8}$/.test(code))throw Error('Enter a valid group code.');
    if(this.code===code)return;
    if(create){if(!await this.store.putOnce('parties/'+code+'/meta',{code,uid:this.store.uid,createdAt:this.store.now()}))throw Error('Group code taken. Try again.');}
    let party=await this.store.get('parties/'+code);if(!party?.meta)throw Error('Group not found. Check the invite code.');
    const live=Object.values(party.members||{}).filter(m=>this.store.now()-m.seenAt<15000);
    if(live.reduce((sum,m)=>sum+m.localPlayers,0)+Number($('#local-players').value)>6)throw Error('This group has no room for all your local riders.');
    if(live.some(m=>m.uid===this.store.uid&&this.store.user.google))throw Error('This Google account already has a browser in this group.');
    await this.leave();this.code=code;this.joinedAt=this.store.now();sessionStorage.setItem('gltrof-party',code);
    await this.heartbeat();this.store.registerPartyDisconnect?.(code,this.state.browserId);this.store.removeOnLeave?.('parties/'+code+'/members/'+this.state.browserId);
    this.stop=this.store.watch('parties/'+code,value=>{this.party=value;this.render();});this.message('Group ready. Any member can choose your next match.');
  }
  async leave(){
    if(this.code)await this.store.set('parties/'+this.code+'/members/'+this.state.browserId,null);
    this.stop?.();this.code=null;this.party=null;sessionStorage.removeItem('gltrof-party');this.render();
  }
  async heartbeat(){
    if(!this.code)return;
    const own=this.own(),others=this.members().filter(m=>m.browserId!==this.state.browserId).reduce((sum,m)=>sum+m.localPlayers,0);
    if(others+own.localPlayers>6){const previous=this.party?.members?.[this.state.browserId]?.localPlayers||Math.max(1,6-others);$('#local-players').value=String(previous);sessionStorage.setItem('gltrof-local-players',String(previous));throw Error('Your group already fills six seats. Leave the group to add more local riders.');}
    await this.store.set('parties/'+this.code+'/members/'+this.state.browserId,own);
  }
  render(){
    const active=Boolean(this.code);$('#party-active').classList.toggle('hidden',!active);$('#party-join-row').classList.toggle('hidden',active);$('#party-create').classList.toggle('hidden',active);
    $('#party-size').textContent=active?this.seats()+'/6 riders':'';$('#party-label').textContent=this.code||'';$('#party-ranked').disabled=!this.store.user.google;
    const list=$('#party-members');list.replaceChildren();for(const m of this.members()){const li=document.createElement('li');li.textContent=m.name+' · '+m.localPlayers+' rider'+(m.localPlayers===1?'':'s')+(m.browserId===this.state.browserId?' · You':'')+' · '+(m.status==='home'?'Ready':m.roomCode===this.state.room?.meta.code?'In your lobby':'In a match')+(m.allowRanked?' · Ranked ready':'');list.append(li);}
  }
  validate(ranked=false){
    const members=this.members();if(!members.some(m=>m.browserId===this.state.browserId))throw Error('Reconnect to your group before matchmaking.');
    if(this.seats()>6)throw Error('Group exceeds six riders. Reduce local players.');
    if(members.some(m=>m.status!=='home'&&m.roomCode!==this.state.room?.meta.code))throw Error('Every group member must leave their current match first.');
    if(ranked&&members.some(m=>!m.google||!m.allowRanked))throw Error('Every group browser must sign in with Google and check Ready for ranked.');
    if(ranked&&new Set(members.map(m=>m.uid)).size!==members.length)throw Error('Each ranked browser needs a different Google account.');
    return members;
  }
  async travel(room,password=''){
    if(!this.active())return false;
    const members=this.validate(room.meta.competition==='ranked'),path='parties/'+this.code+'/action',previous=await this.store.get(path),now=this.store.now();
    if(previous&&now-previous.at<25000&&!this.done.has(previous.id))throw Error('Your group is already joining a match.');
    const salt=randomSalt(),id=crypto.randomUUID(),action={id,revision:(previous?.revision||0)+1,issuer:this.state.browserId,uid:this.store.uid,code:room.meta.code,at:now,members,password:await seal({password},this.code,salt),salt};
    if(!await this.store.cas(path,previous?.revision||0,action))throw Error('Another group member selected a match.');
    const proof=await seal({id},password,room.meta.salt);
    await this.store.set('rooms/'+room.meta.code+'/joinRequests/'+id,{id,party:this.code,issuer:this.state.browserId,uid:this.store.uid,at:now,proof});
    this.message('Bringing your whole group into the lobby…');
    const until=Date.now()+25000;
    while(Date.now()<until){await this.tick();const request=await this.store.get('rooms/'+room.meta.code+'/joinRequests/'+id);if(request?.response?.status==='rejected')throw Error(request.response.error);if(request?.response?.status==='admitted'){await this.follow(action,request);return true;}await pause(350);}
    throw Error('Group join timed out. Host may be offline. No partial group was admitted.');
  }
  async handleRequest(request,room){
    if(request.response||this.processing.has(request.id))return;this.processing.add(request.id);
    try{
      const party=await this.store.get('parties/'+request.party),action=party?.action,now=this.store.now();
      if(!action||action.id!==request.id||action.code!==room.meta.code||action.uid!==request.uid||action.issuer!==request.issuer||now-action.at>25000||!party.members?.[request.issuer]||party.members[request.issuer].uid!==request.uid)throw Error('Group invitation expired. Try joining again.');
      if((await open(request.proof,this.state.password,room.meta.salt)).id!==request.id)throw Error('Invalid lobby password.');
      const members=action.members;if(!Array.isArray(members)||!members.length||new Set(members.map(m=>m.browserId)).size!==members.length)throw Error('Invalid group roster.');
      const players=[];
      for(const m of members){
        const live=party.members?.[m.browserId];if(!live||live.uid!==m.uid||live.localPlayers!==m.localPlayers||now-live.seenAt>15000||(live.status!=='home'&&live.roomCode!==room.meta.code)||!Number.isInteger(m.localPlayers)||m.localPlayers<1||m.localPlayers>4)throw Error('Group changed. Everyone must return home before joining.');
        if(room.meta.competition==='ranked'&&(!live.allowRanked||!await this.store.get('rankedIdentities/'+m.uid)))throw Error('Every group browser needs Google sign-in and ranked consent.');
        for(let i=0;i<m.localPlayers;i++)players.push({id:request.id+'_'+m.browserId+'_'+i,authUid:m.uid,browserId:m.browserId,localIndex:i,ratedUid:i===0&&m.google?m.uid:'',name:(i?m.name+' '+(i+1):m.name).slice(0,32),joinedAt:action.at+i,host:false,role:'player',partyCode:request.party});
      }
      await this.store.admitParty(room.meta.code,request,players);
    }catch(error){await this.store.set('rooms/'+room.meta.code+'/joinRequests/'+request.id+'/response',{status:'rejected',error:error.message});}
    finally{this.processing.delete(request.id);}
  }
  async follow(action,request){
    if(this.done.has(action.id)||!action.members.some(m=>m.browserId===this.state.browserId))return;
    if(request.response?.status!=='admitted')return;
    this.done.add(action.id);
    if(this.state.room?.meta.code===action.code){this.message('Your group joined this lobby.');return;}
    if(this.state.room){this.message('Group selected a lobby. Leave this match to regroup.');return;}
    const room=await this.store.get('rooms/'+action.code),players=Object.values(room?.players||{}).filter(p=>p.browserId===this.state.browserId).sort((a,b)=>a.localIndex-b.localIndex);
    if(!players.length){this.message('Group seats expired. Rejoin from the home screen.');return;}
    const {password}=await open(action.password,this.code,action.salt);this.enter(room,players[0],password,false,players);await this.heartbeat();
  }
  async tick(){
    if(this.ticking)return;this.ticking=true;
    try{
      if(this.code){if(!this.lastBeat||Date.now()-this.lastBeat>3000){this.lastBeat=Date.now();await this.heartbeat();}const action=this.party?.action;if(action&&this.store.now()-action.at<25000){const request=await this.store.get('rooms/'+action.code+'/joinRequests/'+action.id);if(request?.response?.status==='rejected'){this.done.add(action.id);this.message(request.response.error);}else if(request)await this.follow(action,request);}}
      if(this.state.host&&this.state.room&&!this.state.room.meta.started)for(const request of Object.values(this.state.room.joinRequests||{}))await this.handleRequest(request,this.state.room);
    }finally{this.ticking=false;}
  }
}
