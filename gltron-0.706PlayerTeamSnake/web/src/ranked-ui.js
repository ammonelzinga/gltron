import {initialRating} from './glicko2.js';
import {tallyBallot,acceptedResult,ladderForMode} from './result-votes.js';
import {deriveRatings} from './rating-history.js';
const $=selector=>document.querySelector(selector);
const names={normal:'Normal',snake:'Snake',team:'Team'};

export function showJoinCompetition(state,code,ranked){
  state.confirmedRankedCode=ranked?code:null;
  $('#join-form [type=submit]').textContent=ranked?'Join ranked':'Join lobby';
  const note=$('#join-match-notice');note.classList.toggle('hidden',!ranked);
  note.textContent=ranked?'Ranked lobby: Player 1’s MMR will change. Local Players 2–4 remain unranked. Click Join ranked to continue.':'';
}

export function updateRankedChoices(){
  const tournament=$('#session-kind').value==='tournament',host=$('#create-form [name=competition]');
  if(tournament)host.value='casual';host.disabled=tournament;
  for(const form of ['quick','create']){
    const ranked=$('#'+form+'-form [name=competition]').value==='ranked';
    $('#'+form+'-ranked-note').classList.toggle('hidden',!ranked);
  }
}
export function renderRankedUI(state){
  if(!state.store)return;
  const user=state.store.user||{},button=$('#account-button');
  button.textContent=user.google?'Sign out':'Sign in with Google';button.disabled=Boolean(state.room)||state.authBusy;
  $('#account-status').textContent=user.google?`Signed in${user.name?' as '+user.name:''}. Casual play never changes your MMR.`:state.store.mode==='firebase'?'Google sign-in is needed only for ranked. Casual play stays open.':'Casual play is ready. Configure Firebase Google sign-in to enable ranked.';
  $('#rating-values').classList.toggle('hidden',!user.google);
  if(user.google)$('#rating-values').innerHTML=Object.entries(names).map(([key,name])=>{const r=state.ranked?.ratings[key]?.[user.uid]||initialRating();return `<span${key==='team'?' title="Includes Team Snake"':''}><strong>${name} ${Math.round(r.rating)}</strong><small>${r.games<10?'Provisional · ':''}${r.games} matches</small></span>`;}).join('');
  const container=$('#ranked-result');container.replaceChildren();
  if(state.room?.meta.competition!=='ranked')return;
  const session=state.ranked,ballot=session?.ballot;
  if(!ballot)return;
  const tally=tallyBallot(ballot,state.store.now()),p=document.createElement('p');
  if(session.error)p.textContent=session.error;
  else if(ballot.final?.method==='void'){p.textContent='Results could not be confirmed. MMR unchanged.';$('#match-result').textContent='No confirmed ranked result';}
  else if(acceptedResult(ballot)){
    const ladder=ladderForMode(ballot.meta.mode),all=Object.fromEntries(Object.entries(session.records).filter(([id,b])=>b.final&&(b.final.at<ballot.final.at||(b.final.at===ballot.final.at&&id<=session.id))));
    const before=deriveRatings(Object.fromEntries(Object.entries(all).filter(([id])=>id!==session.id)))[ladder][user.uid]||initialRating(),after=deriveRatings(all)[ladder][user.uid]||before,delta=Math.round(after.rating)-Math.round(before.rating);
    p.textContent=`Results confirmed. ${names[ladder]} MMR ${Math.round(after.rating)} (${delta>=0?'+':''}${delta}). Only Player 1 is rated.`;
  }else if(ballot.closing)p.textContent=tally.status==='tie'?'Confirming final standings. The host may need to confirm the result.':'Confirming final standings…';
  else p.textContent='Ranked · Only Player 1 earns MMR. Local Players 2–4 are unranked guests.';
  container.append(p);
  const confirmed=acceptedResult(ballot);
  if(confirmed){
    const leading=Math.min(...confirmed.placements),winners=ballot.meta.players.filter((player,i)=>confirmed.placements[i]===leading);
    const labels=ballot.meta.mode.includes('team')?[...new Set(winners.map(player=>'Team '+(Math.floor(player.slot/2)+1)))]:winners.map(player=>player.name);
    $('#match-result').textContent=labels.length===1?labels[0]+' wins':labels.join(' / ')+' tie';
    const list=document.createElement('ol');list.className='confirmed-standings';
    for(const {player,rank} of ballot.meta.players.map((player,i)=>({player,rank:confirmed.placements[i]})).sort((a,b)=>a.rank-b.rank)){
      const item=document.createElement('li');item.textContent=`${rank}. ${player.name} · ${player.primary?'ranked':'unranked guest'}`;list.append(item);
    }
    container.append(list);
  }else if(!ballot.final&&state.room.match?.status==='finished')$('#match-result').textContent='Confirming final standings';
  if(state.host&&tally.status==='tie'&&!ballot.final&&!tally.candidates.some(c=>c.key===ballot.reports?.[state.browserId]?.key))for(const candidate of tally.candidates){
    const pick=document.createElement('button');pick.className='quiet';pick.type='button';
    pick.textContent=candidate.placements.map((rank,i)=>`${ballot.meta.players[i].name}: ${rank}`).join(' · ');
    pick.addEventListener('click',()=>session.finalize(candidate.key,'host-tiebreak').catch(error=>{session.error=error.message;renderRankedUI(state);}));container.append(pick);
  }
  $('#start-rematch').disabled=!session.settled();
}
export function setupRankedUI(state){
  $('#join-form [name=roomCode]').addEventListener('input',()=>showJoinCompetition(state,null,false));
  for(const form of ['quick','create'])$('#'+form+'-form [name=competition]').addEventListener('change',updateRankedChoices);
  $('#session-kind').addEventListener('change',updateRankedChoices);updateRankedChoices();
  state.store.watchAuth(()=>renderRankedUI(state));
  $('#account-button').addEventListener('click',async()=>{
    if(state.room)return;
    const partyCode=state.party?.code;
    state.authBusy=true;$('#account-message').textContent='';renderRankedUI(state);
    try{if(partyCode)await state.party.leave();if(state.store.user.google)await state.store.signOutGoogle();else await state.store.signInGoogle();}
    catch(error){$('#account-message').textContent=error.code==='auth/operation-not-allowed'?'Enable Google sign-in in your Firebase project.':error.code==='auth/unauthorized-domain'?'Add this website to Firebase Authentication’s authorized domains.':error.message;}
    finally{if(partyCode&&!state.party.code)await state.party.run(()=>state.party.join(partyCode));state.authBusy=false;renderRankedUI(state);}
  });
}
