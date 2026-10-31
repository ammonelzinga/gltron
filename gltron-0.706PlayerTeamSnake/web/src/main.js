import './style.css';
import {startEngineClock} from './engine-clock.js';
import {gridName,roomConfiguration,quickCandidates} from './lobby-features.js';
import { open, randomSalt, seal } from './crypto.js';
import { cleanCode, createStore, makeRoomCode } from './store.js';
import {atomic} from './atomic.js';
import {searchQueue} from './quick-search.js';
import {PeerSession} from './peer-session.js';
import {nativeSessionHooks} from './native-session-ui.js';
import { completeTournamentMatch, createTournament, normalizeTournamentConfig, tournamentProgress } from './tournament.js';

const $ = selector => document.querySelector(selector);
const landing = $('#landing'); const lobbyPage = $('#lobby'); const gamePage = $('#game');
const state = { store:null, room:null, player:null, localPlayers:[], browserId:crypto.randomUUID(), password:'', host:false, stops:[], viewStops:[], peers:[], module:null, localViewController:null, cameraMode:false, singleRoundTimer:null, roundRestartPending:false, guestConnection:null, guestMatchId:null, spectating:false, viewingBracket:false, arenas:new Map(), viewerPending:new Set(), hostControl:null };

if(import.meta.env.DEV)window.__gltrof=state;

function rememberName(name){
  name=name.trim().slice(0,24);if(!name)return;
  localStorage.setItem('gltrof-player-name',name);
  for(const input of document.querySelectorAll('[name=playerName]'))if(input!==document.activeElement)input.value=name;
}

function renderRematch(room){
  const finished=room.meta.kind==='game'&&room.match?.status==='finished';
  $('#rematch-panel').classList.toggle('hidden',!finished);
  if(!finished)return;
  $('#match-result').textContent=room.match.winnerName?`${room.match.winnerName} wins`:'Match complete';
  const players=orderedPlayers(room).filter(player=>!player.bot),ready=players.filter(player=>room.rematchVotes?.[player.id]);
  $('#rematch-count').textContent=`${ready.length} / ${players.length} riders want to play again. Host starts the next match.`;
  const voted=state.localPlayers.every(player=>room.rematchVotes?.[player.id]);
  $('#play-again').disabled=voted;$('#play-again').textContent=voted?'Ready for rematch':'Play again';
  $('#start-rematch').classList.toggle('hidden',!state.host);
}

async function requestRematch(){
  if(state.room?.meta.kind!=='game'||state.room.match?.status!=='finished')return;
  for(const player of state.localPlayers)await state.store.set(`rooms/${state.room.meta.code}/rematchVotes/${player.id}`,true);
}

async function startRematch(){
  if(!state.host||state.room?.meta.kind!=='game'||state.room.match?.status!=='finished')return;
  if(orderedPlayers().filter(p=>p.bot||p.id===state.player.id||state.room.presence?.[p.browserId]?.seenAt>state.store.now()-6000).length<2)return setStatus('#rematch-status','Another rider is needed. Exit to find a new match.');
  $('#start-rematch').disabled=true;
  try{
    await state.store.set(`rooms/${state.room.meta.code}/rematchVotes`,null);
    state.module.ccall('web_new_match',null,[],[]);
    await state.store.set(`rooms/${state.room.meta.code}/scores`,Object.fromEntries(orderedPlayers().map(player=>[player.id,0])));
    await state.store.set(`rooms/${state.room.meta.code}/match`,{status:'playing',number:(state.room.match.number||1)+1});
    state.roundRestartPending=false;$('#connection-status').textContent='Players connected';
  }finally{$('#start-rematch').disabled=false;}
}

async function quickMatch(form){
  if(!state.store)return setStatus('#quick-status','Connecting to lobbies...');
  const button=form.querySelector('button[type=submit]'),controller=new AbortController();state.quickSearch=controller;
  button.disabled=true;$('#cancel-quick').classList.remove('hidden');
  const data=new FormData(form),preferences=Object.fromEntries(data);
  rememberName(data.get('playerName'));
  const entry={id:state.browserId,uid:state.store.uid,name:data.get('playerName').trim(),localPlayers:Number(data.get('localPlayers')||1),preferences:{gridSize:preferences.gridSize,mode:preferences.mode,speed:preferences.speed},required:Object.fromEntries(['gridSize','mode','speed'].map(key=>[key,data.get('required-'+key)==='on'])),joinedAt:state.store.now()};
  try{
    await searchQueue({store:state.store,entry,signal:controller.signal,roomCode:makeRoomCode,onStatus:message=>setStatus('#quick-status',message),join:code=>joinLobby(form,code),host:async group=>{
      const values=new FormData($('#create-form'));
      for(const [key,value] of Object.entries({playerName:entry.name,lobbyName:'Quick match - '+modeName(group.config.mode),localPlayers:entry.localPlayers,kind:'game',visibility:'public',password:'',clearTrails:'on',matchPoints:5,...group.config}))values.set(key,String(value));
      await createLobby($('#create-form'),{data:values,code:group.code,quickPool:group.id,quickExpected:group.entryIds});
    }});
    if(controller.signal.aborted)setStatus('#quick-status','Search cancelled.');
  }catch(error){setStatus('#quick-status',error.message);}finally{button.disabled=false;$('#cancel-quick').classList.add('hidden');state.quickSearch=null;}
}

function maybeAutoStart(room){
  if(!room.meta.quickPool||room.meta.started)return;
  const humans=orderedPlayers(room).filter(p=>!p.bot),browsers=new Set(humans.map(p=>p.browserId||p.id)),expected=room.meta.quickExpected||[];
  if(humans.length<2){setStatus('#lobby-status','Pooling riders - waiting for another player...');return;}
  if(!expected.every(id=>browsers.has(id))&&Date.now()-room.meta.createdAt<10000){setStatus('#lobby-status','Players found. Waiting for the group to join...');return;}
  if(!room.meta.quickStartsAt){
    if(state.host&&!state.quickCountdownPending){state.quickCountdownPending=true;state.store.set('rooms/'+room.meta.code+'/meta/quickStartsAt',state.store.now()+3000).finally(()=>state.quickCountdownPending=false);}
    return;
  }
  const remaining=Math.max(0,Math.ceil((room.meta.quickStartsAt-state.store.now())/1000));setStatus('#lobby-status','Quick match starts in '+remaining+'...');
  if(!remaining&&state.host&&!state.quickStarting){state.quickStarting=true;startHostGame().catch(error=>{state.quickStarting=false;setStatus('#lobby-status',error.message);});}
}

function show(page) { [landing,lobbyPage,gamePage].forEach(element => element.classList.toggle('hidden', element !== page)); }
function setStatus(selector,message) { $(selector).textContent=message||''; }

function trackSingleMatch(players){
  clearInterval(state.singleRoundTimer);state.roundRestartPending=state.room.match?.status==='finished';
  let busy=false;
  state.singleRoundTimer=setInterval(async()=>{
    if(busy||!state.host||!state.network.readyAuthority||!state.module)return;
    busy=true;
    try{
      const scores=Object.fromEntries(players.map(p=>[p.id,state.module.ccall('web_player_score','number',['number'],[p.slot])]));
      renderScoreboard({...state.room,scores});
      if(!state.roundRestartPending)await state.store.set(`rooms/${state.room.meta.code}/scores`,scores);
      if(state.roundRestartPending||!state.module.ccall('web_round_finished','number',[],[]))return;
      const winner=players.reduce((best,p)=>(scores[p.id]||0)>(scores[best.id]||0)?p:best,players[0]);
      if(scores[winner.id]>=(state.room.meta.matchPoints||5)){
        state.roundRestartPending=true;
        await state.store.set(`rooms/${state.room.meta.code}/match`,{status:'finished',winnerName:winner.name,number:state.room.match?.number||1});
      }else{
        state.roundRestartPending=true;$('#connection-status').textContent='Next round...';
        setTimeout(()=>{if(!state.host||!state.module)return;state.module.ccall('web_restart_round',null,[],[]);state.roundRestartPending=false;$('#connection-status').textContent='Players connected';},1200);
      }
    }catch(error){setStatus('#lobby-status',error.message);}finally{busy=false;}
  },500);
}

async function createNativeArena(match,participants,checkpoint=null){
  if(state.arenas.has(match.id))return state.arenas.get(match.id);
  const wrapper=document.createElement('article');wrapper.className='arena-view';wrapper.dataset.arenaMatch=match.id;
  wrapper.innerHTML=`<header><strong>${escapeHtml(match.label)}</strong><span>Arena ${match.arena}</span></header><canvas width="1280" height="720"></canvas>`;
  $('#host-arenas').classList.remove('hidden');$('#host-arenas').append(wrapper);
  const reuse=state.nativeArenaId===match.id&&state.module;
  let canvas,module;
  if(reuse){canvas=$('#gltron-canvas');module=state.module;}
  else{canvas=document.createElement('canvas');canvas.className='engine-canvas';document.body.append(canvas);module=await createGameModule(canvas,participants);}
  if(checkpoint){module.webSnapshot=checkpoint.raw;if(!module.ccall('web_snapshot_load','number',[],[]))throw Error('Could not restore tournament checkpoint');}
  const own=participants.filter(p=>state.localPlayers.some(local=>local.id===p.id));
  const controller=startViewMirror(canvas,wrapper.querySelector('canvas'),own.length?own.map(p=>p.slot):[0],participants,module);
  const arena={module,canvas,players:participants,connections:[],viewerIds:new Set(),processing:false,timer:null,controller};
  state.arenas.set(match.id,arena);state.network.register(match.id,module,participants);
  if(own.length)state.hostControl={module,slot:own[0].slot,matchId:match.id};
  arena.timer=setInterval(()=>{if(state.host&&state.network.readyAuthority)captureArenaResult(match.id,arena);},500);
  return arena;
}

async function recoverAuthority(){
  if(state.room.meta.kind==='game'){
    const checkpoint=state.network.checkpoints.get('single'),players=checkpoint?.players||state.room.roster||orderedPlayers();
    if(!state.module)await loadHostGame(players);
    if(checkpoint){state.module.webSnapshot=checkpoint.raw;if(!state.module.ccall('web_snapshot_load','number',[],[]))throw Error('Could not restore game checkpoint');}
    else state.module.ccall('web_resume_game',null,[],[]);
    state.network.register('single',state.module,players);state.guestConnection=null;state.spectating=false;
    trackSingleMatch(players);show(gamePage);$('#game-loading').classList.add('hidden');
  }else{
    for(const match of state.room.tournament.rounds.flatMap(r=>r.matches).filter(m=>m.status==='playing')){
      const checkpoint=state.network.checkpoints.get(match.id),map=playerMap();
      await createNativeArena(match,checkpoint?.players||match.playerIds.map((id,slot)=>({...map[id],slot})),checkpoint);
    }
  }
}
function escapeHtml(value='') { const node=document.createElement('span'); node.textContent=value; return node.innerHTML; }
function modeName(mode) { return ({classic:'Classic',snake:'Snake',teams:'3 Teams','team-snake':'Team Snake'})[mode]||'Classic'; }
function playerMap(room=state.room) { return Object.fromEntries(Object.values(room?.players||{}).map(player=>[player.id,player])); }
function entrants(room=state.room) { return Object.values(room?.players||{}).filter(player=>!['organizer','spectator'].includes(player.role)); }
function orderedPlayers(room=state.room) { return Object.values(room?.players||{}).sort((a,b)=>a.slot-b.slot); }
function localPlayerBatch(name,count,base={}) { return Array.from({length:count},(_,localIndex)=>({...base,id:crypto.randomUUID(),browserId:state.browserId,localIndex,name:localIndex?`${name} ${localIndex+1}`:name,joinedAt:Date.now()+localIndex})); }

async function uniqueCode() { for(let attempt=0;attempt<8;attempt++){ const code=makeRoomCode(); if(!await state.store.get(`rooms/${code}`)) return code; } throw new Error('Could not allocate a room code. Please try again.'); }
function tournamentConfig(data) { return normalizeTournamentConfig({ maxEntrants:data.get('maxEntrants'),playersPerHeat:data.get('playersPerHeat'),advancePerHeat:data.get('advancePerHeat'),finalPlayers:data.get('finalPlayers'),pointsToWin:data.get('pointsToWin'),maxParallel:data.get('maxParallel'),seeding:data.get('seeding'),allowSpectators:data.get('allowSpectators')==='on',thirdPlaceMatch:data.get('thirdPlaceMatch')==='on' }); }

async function createLobby(form,override={}) {
  const data=override.data||new FormData(form),code=override.code||await uniqueCode(),password=data.get('password'),salt=randomSalt(),kind=data.get('kind');
  rememberName(data.get('playerName'));
  const hostParticipates=kind!=='tournament'||data.get('hostParticipates')==='on';
  const localCount=hostParticipates?Number(data.get('localPlayers')||1):1,localPlayers=localPlayerBatch(data.get('playerName').trim(),localCount,{authUid:state.store.uid,host:true,role:hostParticipates?'player':'organizer'}).map((player,slot)=>({...player,slot})),player=localPlayers[0];
  const meta={code,kind,name:data.get('lobbyName').trim(),mode:data.get('mode'),public:data.get('visibility')==='public',passwordRequired:Boolean(password),salt,createdAt:Date.now(),started:false,hostId:player.id,hostUid:state.store.uid,hostParticipates,gridSize:Number(data.get('gridSize')||720),clearTrails:data.get('clearTrails')==='on',speed:Number(data.get('speed')||8.5),matchPoints:Number(data.get('matchPoints')||5),botDifficulty:Number(data.get('botDifficulty')||2)};

  if(override.quickPool){meta.quickPool=override.quickPool;meta.quickExpected=override.quickExpected;}
  meta.challenge=await seal({code,check:'gllitebike'},password,salt);
  const room={meta,authority:{revision:1,term:1,browserId:state.browserId,uid:state.store.uid,playerId:player.id,leaseUntil:(state.store.now?.()||Date.now())+4000},players:Object.fromEntries(localPlayers.map(item=>[item.id,item])),scores:{}};
  if(kind==='tournament') room.tournament={config:tournamentConfig(data),status:'registration',manualOrder:hostParticipates?localPlayers.map(item=>item.id):[],rounds:[]};
  if(!await state.store.create(room)) throw new Error('Room code collision. Please try again.');
  state.store.registerHostDisconnect(code); enterLobby(room,player,password,true,localPlayers);
}

async function joinLobby(form,overrideCode) {
  const data=new FormData(form),code=cleanCode(overrideCode||data.get('roomCode')),password=data.get('password');
  rememberName(data.get('playerName'));
  const room=await state.store.get(`rooms/${code}`); if(!room) throw new Error('No lobby uses that room code.');
  const lateSpectator=room.meta.started&&room.meta.kind==='tournament'&&room.tournament.config.allowSpectators;
  if(room.meta.started&&!lateSpectator) throw new Error('That match has already started.');
  await open(room.meta.challenge,password,room.meta.salt);
  const requested=lateSpectator?1:Number(data.get('localPlayers')||1),capacity=room.meta.kind==='game'?6:room.tournament.config.maxEntrants,current=Object.keys(room.players||{}).length;
  if(current+requested>capacity) throw new Error(`Only ${capacity-current} rider slot${capacity-current===1?' is':'s are'} open.`);
  const localPlayers=localPlayerBatch(data.get('playerName').trim(),requested,{authUid:state.store.uid,host:false,role:lateSpectator?'spectator':'player'});
  for(const player of localPlayers){player.slot=await state.store.join(code,player);state.store.registerPlayerDisconnect(code,player.id);}
  enterLobby(await state.store.get(`rooms/${code}`),localPlayers[0],password,false,localPlayers);
}

function renderPlayers(room) {
  const tournament=room.meta.kind==='tournament'?room.tournament:null,eliminated=new Set(tournament?.eliminatedPlayerIds||[]);
  const players=Object.values(room.players||{}).sort((a,b)=>a.slot-b.slot);
  $('#player-list').innerHTML=players.map(player=>{ const status=player.role==='organizer'?'Organizer':player.role==='spectator'?'Spectator':player.bot?'Computer':eliminated.has(player.id)?'Eliminated · Spectating':`Slot ${player.slot+1}`; return `<div class="player"><strong>${escapeHtml(player.name)}</strong><span>${player.id===(room.authority?.playerId||room.meta.hostId)?'Host · ':''}${status}</span></div>`; }).join('');
  return players;
}

function renderSeeding(room) {
  const panel=$('#seeding-panel'),tournament=room.tournament;
  panel.classList.toggle('hidden',tournament.status!=='registration'||!state.host||tournament.config.seeding!=='manual'); if(panel.classList.contains('hidden')) return;
  const map=playerMap(room),available=entrants(room).map(player=>player.id),manual=tournament.manualOrder||[];
  const order=[...manual.filter(id=>available.includes(id)),...available.filter(id=>!manual.includes(id))];
  $('#seed-list').innerHTML=order.map((id,index)=>`<div class="seed-entry" data-seed-id="${id}"><strong>#${index+1}</strong><span>${escapeHtml(map[id].name)}</span><button class="quiet" data-seed-up="${id}" ${index===0?'disabled':''}>↑</button><button class="quiet" data-seed-down="${id}" ${index===order.length-1?'disabled':''}>↓</button></div>`).join('');
}

function matchCard(match,map) {
  const editable=state.host&&match.status!=='complete';
  const rows=match.playerIds.map(id=>{ const placement=match.placements.indexOf(id),className=placement<0?'':match.winners.includes(id)?'advancing':'eliminated',score=match.scores?.[id]??0; return `<div class="match-player ${className}"><span>${escapeHtml(map[id]?.name||'Unknown rider')}</span>${editable?`<input class="score-input" data-score-player="${id}" type="number" min="0" max="999" value="${score}" aria-label="Score for ${escapeHtml(map[id]?.name)}" />`:`<strong>${score}</strong>`}</div>`; }).join('');
  const launch=state.host&&match.status==='ready'?`<button class="quiet" data-launch-match="${match.id}">Launch arena</button>`:'';
  const complete=state.host&&['ready','playing'].includes(match.status)?`<button class="primary" data-complete-match="${match.id}">Save result</button>`:'';
  return `<article class="match-card ${match.status}" data-match-id="${match.id}"><div class="match-topline"><strong>${escapeHtml(match.label)}</strong><span class="match-badge">Arena ${match.arena} · ${match.status}</span></div>${rows}<p class="muted">Top ${match.advanceCount} advance · First to ${match.pointsToWin}</p><div class="match-actions">${launch}${complete}</div></article>`;
}

function renderTournament(room) {
  const key=JSON.stringify([room.tournament,room.players,state.host,state.guestMatchId,state.viewingBracket]);
  if(state.tournamentRenderKey===key)return;
  state.tournamentRenderKey=key;
  const scoreInputs=[...document.querySelectorAll('#bracket .score-input')];
  const drafts=scoreInputs.filter(input=>input.value!==input.defaultValue).map(input=>({matchId:input.closest('[data-match-id]').dataset.matchId,playerId:input.dataset.scorePlayer,value:input.value}));
  const focused=scoreInputs.includes(document.activeElement)?{matchId:document.activeElement.closest('[data-match-id]').dataset.matchId,playerId:document.activeElement.dataset.scorePlayer}:null;
  const dashboard=$('#tournament-dashboard'),tournament=room.tournament,map=playerMap(room); dashboard.classList.remove('hidden'); renderSeeding(room);
  if(tournament.status==='registration'){ $('#return-arena').classList.add('hidden'); $('#tournament-progress').textContent=`${entrants(room).length} registered`; $('#bracket').innerHTML='<div class="panel empty-state">The bracket will appear when the host starts the tournament.</div>'; return; }
  const progress=tournamentProgress(tournament); $('#tournament-progress').textContent=tournament.status==='complete'?'Tournament complete':`${progress.completed} matches complete`;
  const ownLiveMatch=!state.host&&tournament.rounds.flatMap(round=>round.matches).find(match=>match.status==='playing'&&match.playerIds.includes(state.player?.id)); $('#return-arena').classList.toggle('hidden',!state.guestConnection||(!ownLiveMatch&&!state.guestMatchId));
  $('#bracket').innerHTML=tournament.rounds.map(round=>`<section class="bracket-round"><h3>${escapeHtml(round.label)}</h3>${round.matches.map(match=>matchCard(match,map)).join('')}</section>`).join('')+(tournament.championId?`<section class="bracket-round"><h3>Winner</h3><article class="champion-card"><div class="trophy">◆</div><p class="eyebrow">Champion</p><h3>${escapeHtml(map[tournament.championId]?.name)}</h3><p class="muted">Runner-up: ${escapeHtml(map[tournament.runnerUpId]?.name||'—')}</p></article></section>`:'');
  // Room updates (including new spectators) must not erase manual score edits.
  for(const input of document.querySelectorAll('#bracket .score-input')){
    const matchId=input.closest('[data-match-id]').dataset.matchId,playerId=input.dataset.scorePlayer;
    const draft=drafts.find(item=>item.matchId===matchId&&item.playerId===playerId);
    if(draft)input.value=draft.value;
    if(focused?.matchId===matchId&&focused.playerId===playerId)input.focus({preventScroll:true});
  }
  const isOut=state.player&&(state.localPlayers.every(player=>tournament.eliminatedPlayerIds?.includes(player.id))||state.player.role==='spectator'); $('#spectator-panel').classList.toggle('hidden',!isOut||!tournament.config.allowSpectators);
  const live=tournament.rounds.flatMap(round=>round.matches).filter(match=>match.status==='playing'); $('#spectator-arenas').innerHTML=`<div class="arena-buttons">${live.map(match=>`<button class="quiet" data-watch-match="${match.id}">Watch ${escapeHtml(match.label)}</button>`).join('')||'<span class="muted">Waiting for the next arena…</span>'}</div>`;
  if(state.host) syncTournamentViewers(room).catch(error=>setStatus('#lobby-status',error.message));
  ensureGuestTournamentConnection(room).catch(error=>setStatus('#lobby-status',error.message));
}

function renderLobby(room) {
  if(!room){state.network?.close();setStatus('#lobby-status','This room has closed.');$('#connection-status').textContent='This room has closed.';return;} state.room=room;state.network?.update(room); $('#lobby-title').textContent=room.meta.name; $('#room-code').textContent=room.meta.code;
  $('#invite-help').textContent=room.meta.public?'This lobby appears in the public list. Share the code for a direct invite.':'This lobby is private. Share the code only with invited players.';
  const players=renderPlayers(room),isTournament=room.meta.kind==='tournament'; $('#tournament-dashboard').classList.toggle('hidden',!isTournament);
  $('#start-game').classList.toggle('hidden',!state.host||room.meta.started); $('#start-game').textContent=isTournament?'Start tournament':'Start match'; $('#start-game').disabled=state.quickStarting|| (isTournament?entrants(room).length<2:players.length<2);
  $('#bot-controls').classList.toggle('hidden',!state.host||room.meta.started); $('#add-bot').disabled=players.length>=(isTournament?room.tournament.config.maxEntrants:6); $('#remove-bot').disabled=!players.some(player=>player.bot);
  const botNames=['Dumb','Fair','Smart','Insane']; $('#match-rules').innerHTML=`<dt>Session</dt><dd>${isTournament?'Tournament':'Single Match'}</dd><dt>Mode</dt><dd>${modeName(room.meta.mode)}</dd><dt>Players</dt><dd>${players.length}${isTournament?` / ${room.tournament.config.maxEntrants}`:' / 6'}</dd><dt>Grid</dt><dd>${gridName(room.meta.gridSize||720)}</dd><dt>Crash trails</dt><dd>${room.meta.clearTrails!==false?'Clear immediately':'Remain'}</dd><dt>Speed</dt><dd>${room.meta.speed||8.5}</dd><dt>Points</dt><dd>${room.meta.matchPoints||5}</dd><dt>Bots</dt><dd>${botNames[room.meta.botDifficulty??2]}</dd><dt>Visibility</dt><dd>${room.meta.public?'Public':'Private'}</dd><dt>Password</dt><dd>${room.meta.passwordRequired?'Required':'None'}</dd>`;
  if(isTournament) renderTournament(room); else if(room.meta.started&&!state.host&&!state.guestConnection) startGuestGame().catch(error=>setStatus('#lobby-status',error.message));
  renderScoreboard(room);renderRematch(room);maybeAutoStart(room);
}

function enterLobby(room,player,password,host,localPlayers=[player]){
  state.room=room;state.player=player;state.localPlayers=localPlayers;state.password=password;state.host=host;
  const hooks=nativeSessionHooks(state,{source:()=>$('#gltron-canvas'),view:()=>$('#player-view'),create:createGameModule,mirror:startViewMirror,loaded:()=>{$('#game-loading').classList.add('hidden');$('#connection-status').textContent='Players connected';},status:message=>$('#connection-status').textContent=message,recover:recoverAuthority,render:renderLobby});
  state.nativeHooks=hooks;
  state.network=new PeerSession({store:state.store,code:room.meta.code,browserId:state.browserId,password,salt:room.meta.salt,onRole:hooks.role,onSnapshot:hooks.snapshot,onStatus:message=>$('#connection-status').textContent=message,onError:error=>{setStatus('#lobby-status',error.message);$('#connection-status').textContent=error.message;}});
  for(const local of localPlayers)state.store.registerPlayerDisconnect(room.meta.code,local.id);state.network.update(room);show(lobbyPage);renderLobby(room);state.stops.push(state.store.watch('rooms/'+room.meta.code,renderLobby));history.replaceState(null,'','?room='+room.meta.code);
}
function viewCells(count,width,height){if(count<=1)return[[0,0,width,height]];if(count===2)return[[0,0,width,height/2],[0,height/2,width,height/2]];return[[0,0,width/2,height/2],[width/2,0,width/2,height/2],[0,height/2,width/2,height/2],[width/2,height/2,width/2,height/2]];}
function drawContained(context,source,crop,cell){const [sx,sy,sw,sh]=crop,[dx,dy,cw,ch]=cell,scale=Math.min(cw/sw,ch/sh),dw=sw*scale,dh=sh*scale;context.drawImage(source,sx,sy,sw,sh,dx+(cw-dw)/2,dy+(ch-dh)/2,dw,dh);}
function startViewMirror(source,target,slots,players,module,{spectator=false}={}){
  target.width=1280; target.height=720;
  const context=target.getContext('2d',{alpha:false}),humans=players,cells=viewCells(spectator?1:slots.length,target.width,target.height);
  let watchOffset=0;
  const watchedIndex=base=>humans.length?(base+watchOffset+humans.length)%humans.length:0;
  const draw=()=>{
    context.fillStyle='#000'; context.fillRect(0,0,target.width,target.height);
    const visibleSlots=spectator?[humans[watchedIndex(0)]?.slot]:slots;
    module.webVisibleSlots=visibleSlots.reduce((mask,slot)=>mask|(1<<slot),0);
    visibleSlots.forEach((slot,index)=>{
      let humanIndex=humans.findIndex(player=>player.slot===slot); if(humanIndex<0)return;
      if(!spectator&&module&&!module.ccall('web_player_active','number',['number'],[slot])){
        const survivors=humans.filter(player=>module.ccall('web_player_active','number',['number'],[player.slot]));
        if(survivors.length)humanIndex=humans.indexOf(survivors[((watchOffset%survivors.length)+survivors.length)%survivors.length]);
        module.ccall('web_set_camera_target',null,['number','number'],[slot,humans[humanIndex].slot]);
      }
      const viewedSlot=spectator?humans[humanIndex].slot:slot,rect=[0,1,2,3].map(component=>module.ccall('web_view_rect','number',['number','number'],[viewedSlot,component])),crop=[rect[0],source.height-rect[1]-rect[3],rect[2],rect[3]];
      drawContained(context,source,crop,cells[index]);
    });
    target.webVideoTrack?.requestFrame?.();
  };
  const controller={cycle(delta){watchOffset+=delta;draw();}};
  target.viewController=controller; module.webFrameConsumers.push(draw);
  const stop=()=>{const index=module.webFrameConsumers.indexOf(draw);if(index>=0)module.webFrameConsumers.splice(index,1);if(target.classList.contains('stream-canvas'))target.remove();};
  state.viewStops.push(stop); return controller;
}
function createViewCanvas(source,slots,players,module,options){const canvas=document.createElement('canvas');canvas.className='stream-canvas';document.body.append(canvas);startViewMirror(source,canvas,slots,players,module,options);return canvas;}
function renderScoreboard(room=state.room){const scores=room?.scores||{},players=orderedPlayers(room).filter(player=>player.role!=='organizer'&&player.role!=='spectator');$('#scoreboard').innerHTML=players.map(player=>`<span>${escapeHtml(player.name)} · ${scores[player.id]||0}</span>`).join('');}
async function createGameModule(canvas,participantsOrCount){const participants=Array.isArray(participantsOrCount)?participantsOrCount:Array.from({length:participantsOrCount},(_,slot)=>({slot,bot:false})),manifest=await fetch('/game/build.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Game build is missing. Rebuild the engine.');return response.json();}),response=await fetch('/game/gltron.mjs?v='+manifest.version);if(!response.ok)throw new Error('The game engine could not be loaded.');const moduleUrl=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'}));let createModule;try{createModule=(await import(/* @vite-ignore */ moduleUrl)).default;}finally{URL.revokeObjectURL(moduleUrl);}const snake=state.room.meta.mode.includes('snake'),teams=state.room.meta.mode.includes('team'),getContext=canvas.getContext.bind(canvas),webFrameConsumers=[];canvas.getContext=(type,attributes)=>getContext(type,type.startsWith('webgl')?{...attributes,preserveDrawingBuffer:true,alpha:false}:attributes);const module=await createModule({canvas,webBuild:manifest.version,webFrameConsumers,webFrameReady:()=>webFrameConsumers.forEach(draw=>draw()),webReplica:!state.host,webVisibleSlots:participants.reduce((mask,p,i)=>mask|(state.localPlayers.some(local=>local.id===p.id)?1<<i:0),0)||(1<<0),webPlayerCount:participants.length,webLocalCounts:participants.map(()=>Math.max(1,participants.filter(p=>state.localPlayers.some(local=>local.id===p.id)).length)),webPlayerTypes:participants.map(player=>player.bot?1:0),webSnakeMode:snake,webTeamMode:teams,webClearTrails:state.room.meta.clearTrails!==false,webGridSize:state.room.meta.gridSize||720,webGameSpeed:state.room.meta.speed||8.5,webAiLevel:state.room.meta.botDifficulty??2,webStartPaused:true,locateFile:file=>`/game/${file}?v=${manifest.version}`,print:message=>console.log(`[glTrof] ${message}`),printErr:message=>console.error(`[glTrof] ${message}`)});module.webFrameConsumers=webFrameConsumers;module.webClock=startEngineClock(module);if(import.meta.env.DEV)canvas.gameModule=module;return module;}
async function loadHostGame(players){
  show(gamePage);$('#remote-game').classList.add('hidden');$('#player-view').classList.remove('hidden');
  state.module=await createGameModule($('#gltron-canvas'),players);state.nativeArenaId='single';
  state.network.register('single',state.module,players);
  const slots=players.filter(p=>state.localPlayers.some(local=>local.id===p.id)).map(p=>p.slot);
  state.localViewController=startViewMirror($('#gltron-canvas'),$('#player-view'),slots,players,state.module);
  $('#game-loading').classList.add('hidden');$('#connection-status').textContent='Hosting match';return $('#gltron-canvas');
}
async function startHostGame(){
  state.quickStarting=true;
  const players=orderedPlayers().map((p,slot)=>({...p,slot}));$('#start-game').disabled=true;
  await state.store.set('rooms/'+state.room.meta.code+'/roster',players);
  await loadHostGame(players);
  await state.store.set('rooms/'+state.room.meta.code+'/meta/started',true);
  await state.network.waitReady('single',players);
  state.module.ccall('web_resume_game',null,[],[]);trackSingleMatch(players);
}
async function startTournament(){const tournament=createTournament(entrants(),state.room.tournament.config,state.room.tournament.manualOrder||[]);await state.store.set(`rooms/${state.room.meta.code}/tournament`,tournament);await state.store.set(`rooms/${state.room.meta.code}/meta/started`,true);}
function findMatch(tournament,matchId){return tournament.rounds.flatMap(round=>round.matches).find(match=>match.id===matchId);}

async function launchTournamentMatch(matchId){
  const tournament=structuredClone(state.room.tournament),match=findMatch(tournament,matchId);if(!match||match.status!=='ready')return;
  match.status='playing';match.startedAt=Date.now();await state.store.set('rooms/'+state.room.meta.code+'/tournament',tournament);
  const map=playerMap(),participants=match.playerIds.map((id,slot)=>({...map[id],slot}));
  const arena=await createNativeArena(match,participants);
  await state.network.waitReady(matchId,participants);
  arena.module.ccall('web_resume_game',null,[],[]);
}
async function connectArenaViewer(){ /* Every room peer receives state checkpoints, not camera feeds. */ }
async function syncTournamentViewers(){ /* Native spectator selection is local. */ }
async function captureArenaResult(matchId,arena){
  if(arena.processing||!state.host||!state.network.readyAuthority||!arena.module.ccall('web_round_finished','number',[],[]))return;
  arena.processing=true;
  try{
    const winnerIndex=arena.module.ccall('web_round_winner','number',[],[]),epoch=arena.module.ccall('web_round_generation','number',[],[]);
    const result=await atomic(state.store,'rooms/'+state.room.meta.code+'/tournament',tournament=>{
      const match=findMatch(tournament,matchId);if(!match||match.status!=='playing'||winnerIndex<0||winnerIndex>=match.playerIds.length||match.lastRoundEpoch===epoch)return;
      const winnerId=match.playerIds[winnerIndex];match.scores[winnerId]=(match.scores[winnerId]||0)+1;match.lastRoundEpoch=epoch;
      return match.scores[winnerId]>=match.pointsToWin?completeTournamentMatch(tournament,matchId,match.scores):tournament;
    });
    const tournament=result||await state.store.get('rooms/'+state.room.meta.code+'/tournament'),match=findMatch(tournament,matchId);
    if(!match||match.status==='complete')closeArena(matchId);
    else if(state.host&&match.lastRoundEpoch===epoch)arena.module.ccall('web_restart_round',null,[],[]);
  }catch(error){setStatus('#lobby-status',error.message);}finally{arena.processing=false;}
}

function closeArena(matchId){state.network?.unregister(matchId);const arena=state.arenas.get(matchId);if(!arena)return;clearInterval(arena.timer);arena.module.webClock?.terminate();arena.connections.forEach(connection=>connection.close());document.querySelector(`[data-arena-match="${matchId}"]`)?.remove();state.arenas.delete(matchId);if(state.hostControl?.matchId===matchId)state.hostControl=null;if(!state.arenas.size)$('#host-arenas').classList.add('hidden');}

async function completeMatchFromCard(matchId,card){
  const original=findMatch(state.room.tournament,matchId),scores=Object.fromEntries(original.playerIds.map(id=>[id,Number(card.querySelector('[data-score-player="'+id+'"]')?.value??original.scores[id])]));
  await atomic(state.store,'rooms/'+state.room.meta.code+'/tournament',tournament=>completeTournamentMatch(tournament,matchId,scores));closeArena(matchId);
}

async function startGuestGame(signalKey=state.browserId,spectating=false,matchId=null){
  state.guestConnection={send:()=>{},close:()=>{}};state.guestMatchId=matchId;state.spectating=spectating;state.viewingBracket=false;
  show(gamePage);$('#player-view').classList.remove('hidden');$('#remote-game').classList.add('hidden');$('#game-loading').classList.remove('hidden');$('#game-loading').textContent='Loading your local game...';
  const checkpoint=state.network.checkpoints.get(matchId||'single');if(checkpoint)await state.nativeHooks.snapshot(checkpoint);
}
async function ensureGuestTournamentConnection(room,requestedMatchId){if(state.host||!state.player||room.tournament.status==='registration')return;const matches=room.tournament.rounds.flatMap(round=>round.matches),localIds=new Set(state.localPlayers.map(player=>player.id)),ownMatch=matches.find(match=>match.status==='playing'&&match.playerIds.some(id=>localIds.has(id))),canSpectate=room.tournament.config.allowSpectators&&(state.localPlayers.every(player=>room.tournament.eliminatedPlayerIds?.includes(player.id))||state.player.role==='spectator'),requested=canSpectate&&(requestedMatchId||state.guestMatchId)?matches.find(item=>item.id===(requestedMatchId||state.guestMatchId)&&item.status==='playing'):null,match=ownMatch||requested;if(!match){if(ownMatch===undefined&&state.guestConnection?.close&&state.guestMatchId){state.guestConnection.close();state.guestConnection=null;state.guestMatchId=null;show(lobbyPage);}return;}if(state.viewingBracket&&!requestedMatchId)return;if(!ownMatch)await state.store.set(`rooms/${room.meta.code}/watchRequests/${state.player.id}`,match.id);if(state.guestMatchId===match.id&&state.guestConnection){state.viewingBracket=false;show(gamePage);return;}state.guestConnection?.close?.();await startGuestGame(`${match.id}-${state.browserId}`,!ownMatch,match.id);}

function sendAction(localIndex,action,pressed){
  const player=state.localPlayers[localIndex];if(!player||state.spectating)return;
  const id=state.room.meta.kind==='game'?'single':state.hostControl?.matchId||state.guestMatchId;
  const arena=state.network?.arenas.get(id),slot=arena?.players.find(p=>p.id===player.id)?.slot;
  if(slot!==undefined)state.network.input(id,slot,action,pressed);
}
function activeLocalSlot(){const id=state.room?.meta.kind==='game'?'single':state.hostControl?.matchId||state.guestMatchId;return state.network?.arenas.get(id)?.players.find(p=>p.id===state.localPlayers[0]?.id)?.slot??-1;}
function adjustCamera(dx,dy){const slot=activeLocalSlot(),id=state.room?.meta.kind==='game'?'single':state.hostControl?.matchId||state.guestMatchId;if(slot>=0&&!state.spectating)state.network?.arenas.get(id)?.module.ccall('web_camera_adjust',null,['number','number','number'],[slot,dx,dy]);}
function cycleSpectatorRider(delta){state.localViewController?.cycle(delta);}
async function cycleTournamentArena(delta){if(!state.spectating||state.room?.meta.kind!=='tournament')return;const live=state.room.tournament.rounds.flatMap(round=>round.matches).filter(match=>match.status==='playing');if(live.length<2)return;let index=live.findIndex(match=>match.id===state.guestMatchId);index=(index+delta+live.length)%live.length;await ensureGuestTournamentConnection(state.room,live[index].id);}
function toggleCameraMode(){state.cameraMode=!state.cameraMode;const surface=$('#player-view');if(state.cameraMode){surface.requestPointerLock?.();$('#connection-status').textContent='Mouse camera active · C to release';}else{if(document.pointerLockElement)document.exitPointerLock();$('#connection-status').textContent=state.spectating?'Spectating':'Players connected';}}
function turn(direction){sendAction(0,direction<0?1:2,true);}
const defaultControlSets=[{ArrowLeft:1,ArrowRight:2,ArrowUp:3,Comma:4,Period:5},{KeyA:1,KeyD:2,KeyW:3,KeyQ:4,KeyE:5},{KeyJ:1,KeyL:2,KeyI:3,KeyU:4,KeyO:5},{Numpad1:1,Numpad3:2,Numpad5:3,Numpad4:4,Numpad6:5}],controlStorageKey='gltrof-controls-v3';
let controlSets;try{controlSets=JSON.parse(localStorage.getItem(controlStorageKey))||structuredClone(defaultControlSets);}catch{controlSets=structuredClone(defaultControlSets);}
const actionNames={1:'Left',2:'Right',3:'Boost',4:'Glance L',5:'Glance R'};
function keyForAction(set,action){return Object.entries(set).find(([,value])=>value===action)?.[0]||'';}
function renderControlConfig(){$('#control-config').innerHTML=controlSets.map((set,player)=>`<div class="control-player"><strong>Player ${player+1}</strong>${[1,2,3,4,5].map(action=>`<label>${actionNames[action]}<input readonly data-control-player="${player}" data-control-action="${action}" value="${escapeHtml(keyForAction(set,action))}" /></label>`).join('')}</div>`).join('');}
function captureControl(event){const input=event.target.closest('[data-control-player]');if(!input)return;event.preventDefault();event.stopPropagation();const player=Number(input.dataset.controlPlayer),action=Number(input.dataset.controlAction);for(const [code,value] of Object.entries(controlSets[player]))if(value===action)delete controlSets[player][code];for(const set of controlSets)delete set[event.code];controlSets[player][event.code]=action;localStorage.setItem(controlStorageKey,JSON.stringify(controlSets));renderControlConfig();}
function keyboardAction(event,pressed){for(let localIndex=0;localIndex<state.localPlayers.length&&localIndex<controlSets.length;localIndex++){const action=controlSets[localIndex][event.code];if(action){event.preventDefault();if(!event.repeat||action>=3)sendAction(localIndex,action,pressed);return true;}}return false;}
async function addBot(){const players=orderedPlayers(),capacity=state.room.meta.kind==='tournament'?state.room.tournament.config.maxEntrants:6;if(players.length>=capacity)return;const used=new Set(players.map(player=>player.slot)),slot=Array.from({length:capacity},(_,index)=>index).find(index=>!used.has(index)),id=crypto.randomUUID(),bot={id,browserId:`bot-${id}`,authUid:state.store.uid,name:`Bot ${players.filter(player=>player.bot).length+1}`,slot,host:false,bot:true,role:'player',joinedAt:Date.now()};await state.store.set(`rooms/${state.room.meta.code}/players/${id}`,bot);}
async function removeBot(){const bot=orderedPlayers().filter(player=>player.bot).at(-1);if(bot)await state.store.set(`rooms/${state.room.meta.code}/players/${bot.id}`,null);}
async function reorderSeed(id,delta){const available=entrants().map(player=>player.id),manual=state.room.tournament.manualOrder||[],current=[...manual.filter(item=>available.includes(item)),...available.filter(item=>!manual.includes(item))],index=current.indexOf(id),target=index+delta;if(target<0||target>=current.length)return;[current[index],current[target]]=[current[target],current[index]];await state.store.set(`rooms/${state.room.meta.code}/tournament/manualOrder`,current);}
async function shuffleSeeds(){const ids=entrants().map(player=>player.id);for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}await state.store.set(`rooms/${state.room.meta.code}/tournament/manualOrder`,ids);}

async function refreshPublic(){
  const rooms=await state.store.get('rooms')||{},openRooms=Object.values(rooms).filter(room=>room?.meta?.public&&(!room.authority||room.authority.leaseUntil>Date.now()-5000)&&(!room.meta.started||(room.meta.kind==='tournament'&&room.tournament.config.allowSpectators))).sort((a,b)=>b.meta.createdAt-a.meta.createdAt);
  $('#public-lobbies').innerHTML=openRooms.length?openRooms.map(room=>{
    const count=Object.keys(room.players||{}).length,capacity=room.meta.kind==='game'?6:room.tournament.config.maxEntrants;
    const full=!room.meta.started&&count>=capacity;
    return `<article class="lobby-card"><div><p class="eyebrow">${room.meta.kind==='tournament'?'Tournament':'Open grid'}  /  ${escapeHtml(room.meta.code)}</p><h3>${escapeHtml(room.meta.name)}</h3><div class="room-config">${roomConfiguration(room).map(value=>`<span>${escapeHtml(value)}</span>`).join('')}</div></div><span class="meta">${count}/${capacity} riders</span><button class="quiet" data-join-code="${room.meta.code}" ${full?'disabled':''}>${room.meta.started?'Spectate':full?'Full':'Join'}</button></article>`;
  }).join(''):'<p class="empty-state">No public lobbies are open. Create the first one.</p>';
}
async function leaveCurrentRoom(){
  const code=state.room.meta.code;
  await state.network?.leave();
  if(await state.store.get('rooms/'+code))for(const player of state.localPlayers)await state.store.set('rooms/'+code+'/players/'+player.id,null);
  cleanup();location.href=location.pathname;
}
function cleanup(){state.quickSearch?.abort();state.network?.close();clearInterval(state.singleRoundTimer);state.module?.webClock?.terminate();state.viewStops.splice(0).forEach(stop=>stop());state.stops.splice(0).forEach(stop=>stop());state.peers.splice(0).forEach(peer=>peer.close());state.guestConnection?.close?.();state.arenas.forEach(arena=>{clearInterval(arena.timer);arena.module.webClock?.terminate();arena.connections.forEach(connection=>connection.close());});}

async function initialize(){renderControlConfig();$('#control-config').addEventListener('keydown',captureControl);state.store=await createStore();if(state.store.mode==='local-server')setStatus('#landing-status','Local testing: rooms shared across tabs and browsers on this computer.');if(state.store.mode==='local')setStatus('#landing-status','Local test mode: add Firebase environment settings before deployment.');await refreshPublic();state.stops.push(state.store.watch('rooms',refreshPublic));$('#session-kind').addEventListener('change',event=>$('#tournament-settings').classList.toggle('hidden',event.target.value!=='tournament'));$('#create-form').addEventListener('submit',async event=>{event.preventDefault();setStatus('#landing-status','');try{await createLobby(event.currentTarget);}catch(error){setStatus('#landing-status',error.message);}});$('#join-form').addEventListener('submit',async event=>{event.preventDefault();setStatus('#landing-status','');try{await joinLobby(event.currentTarget);}catch(error){setStatus('#landing-status',error.message);}});$('#public-lobbies').addEventListener('click',event=>{const code=event.target.dataset.joinCode;if(code){$('#join-form [name=roomCode]').value=code;$('#join-form [name=playerName]').focus();}});$('#refresh-lobbies').addEventListener('click',refreshPublic);$('#add-bot').addEventListener('click',()=>addBot().catch(error=>setStatus('#lobby-status',error.message)));$('#remove-bot').addEventListener('click',()=>removeBot().catch(error=>setStatus('#lobby-status',error.message)));$('#shuffle-seeds').addEventListener('click',shuffleSeeds);$('#seed-list').addEventListener('click',event=>{if(event.target.dataset.seedUp)reorderSeed(event.target.dataset.seedUp,-1);if(event.target.dataset.seedDown)reorderSeed(event.target.dataset.seedDown,1);});$('#bracket').addEventListener('click',event=>{const launch=event.target.dataset.launchMatch,complete=event.target.dataset.completeMatch;if(launch)launchTournamentMatch(launch).catch(error=>setStatus('#lobby-status',error.message));if(complete)completeMatchFromCard(complete,event.target.closest('.match-card')).catch(error=>setStatus('#lobby-status',error.message));});$('#spectator-arenas').addEventListener('click',event=>{if(event.target.dataset.watchMatch)ensureGuestTournamentConnection(state.room,event.target.dataset.watchMatch).catch(error=>setStatus('#lobby-status',error.message));});$('#copy-code').addEventListener('click',async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${state.room.meta.code}`);$('#copy-code').textContent='Copied';setTimeout(()=>$('#copy-code').textContent='Copy',1200);});$('#start-game').addEventListener('click',()=>(state.room.meta.kind==='tournament'?startTournament():startHostGame()).catch(error=>setStatus('#lobby-status',error.message)));$('#leave-lobby').addEventListener('click',()=>leaveCurrentRoom().catch(error=>setStatus('#lobby-status',error.message)));$('#exit-game').addEventListener('click',async()=>{if(state.room?.meta.kind==='tournament'){state.guestConnection?.close?.();state.guestConnection=null;state.guestMatchId=null;show(lobbyPage);}else{await leaveCurrentRoom();}});$('#fullscreen-game').addEventListener('click',()=>document.fullscreenElement?document.exitFullscreen():gamePage.requestFullscreen());document.addEventListener('mousemove',event=>{if(state.cameraMode)adjustCamera(event.movementX,event.movementY);});document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)state.cameraMode=false;});document.addEventListener('keydown',event=>{if(gamePage.classList.contains('hidden')&&!state.hostControl)return;if(event.code==='KeyC'&&!event.repeat){event.preventDefault();toggleCameraMode();return;}if(event.code==='ArrowLeft'&&(state.spectating||(state.module&&activeLocalSlot()>=0&&!state.module.ccall('web_player_active','number',['number'],[activeLocalSlot()])))){event.preventDefault();cycleSpectatorRider(-1);return;}if(event.code==='ArrowRight'&&(state.spectating||(state.module&&activeLocalSlot()>=0&&!state.module.ccall('web_player_active','number',['number'],[activeLocalSlot()])))){event.preventDefault();cycleSpectatorRider(1);return;}if(state.spectating&&event.code==='ArrowUp'){event.preventDefault();cycleTournamentArena(-1);return;}if(state.spectating&&event.code==='ArrowDown'){event.preventDefault();cycleTournamentArena(1);return;}keyboardAction(event,true);});document.addEventListener('keyup',event=>{if(gamePage.classList.contains('hidden')&&!state.hostControl)return;if(event.code==='KeyC')return;keyboardAction(event,false);});document.querySelectorAll('[data-action]').forEach(button=>{const action=Number(button.dataset.action);button.addEventListener('pointerdown',()=>sendAction(0,action,true));button.addEventListener('pointerup',()=>sendAction(0,action,false));button.addEventListener('pointercancel',()=>sendAction(0,action,false));});const inviteCode=cleanCode(new URLSearchParams(location.search).get('room')||'');if(inviteCode)$('#join-form [name=roomCode]').value=inviteCode;}

const initialInviteCode=cleanCode(new URLSearchParams(location.search).get('room')||'');if(initialInviteCode)$('#join-form [name=roomCode]').value=initialInviteCode;
addEventListener('blur',()=>{state.localPlayers.forEach((_,index)=>{for(const action of [3,4,5])sendAction(index,action,false);});});
$('#return-arena').addEventListener('click',()=>{state.viewingBracket=false;ensureGuestTournamentConnection(state.room,state.guestMatchId).catch(error=>setStatus('#lobby-status',error.message));});
$('#exit-game').addEventListener('click',event=>{if(state.room?.meta.kind!=='tournament')return;event.stopImmediatePropagation();state.viewingBracket=true;show(lobbyPage);renderLobby(state.room);},true);
const savedName=localStorage.getItem('gltrof-player-name')||'Grid rider';
for(const input of document.querySelectorAll('[name=playerName]')){
  input.value=savedName;input.addEventListener('change',()=>rememberName(input.value));
}
$('#cancel-quick').addEventListener('click',()=>state.quickSearch?.abort());
for(const key of ['gridSize','mode','speed']){const select=$('#quick-form [name='+key+']'),required=$('#quick-form [name=required-'+key+']');const update=()=>{required.disabled=!select.value;if(!select.value)required.checked=false;};select.addEventListener('change',update);update();}
$('#quick-form').addEventListener('submit',event=>{event.preventDefault();quickMatch(event.currentTarget);});
$('#play-again').addEventListener('click',()=>requestRematch().catch(error=>setStatus('#rematch-status',error.message)));
$('#start-rematch').addEventListener('click',()=>startRematch().catch(error=>setStatus('#rematch-status',error.message)));
initialize().catch(error=>setStatus('#landing-status',`Could not initialize lobbies: ${error.message}`));addEventListener('beforeunload',cleanup);
