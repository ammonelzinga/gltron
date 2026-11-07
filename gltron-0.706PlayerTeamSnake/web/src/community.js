import {initialRating} from './glicko2.js';
export function leaderboard(ratings,uid,limit=10,profiles={}){
  const sorted=Object.entries(ratings||{}).filter(([,r])=>r.games>0).sort((a,b)=>b[1].rating-a[1].rating||a[0].localeCompare(b[0]));
  let rank=0,previous;
  const rows=sorted.map(([id,r],index)=>{const mmr=Math.round(r.rating);if(mmr!==previous)rank=index+1;previous=mmr;return {id,...r,name:profiles[id]?.name||'Grid rider',mmr,rank};});
  return {rows:rows.slice(0,limit),own:rows.find(r=>r.id===uid),total:rows.length};
}
export function setupCommunity(state,show){
  const $=s=>document.querySelector(s),page=$('#rankings-page');
  state.renderRankings=()=>{
    const mode=$('#ranking-mode').value,limit=Number($('#ranking-limit').value),user=state.store?.user||{},data=leaderboard(state.ranked?.ratings[mode],user.uid,limit,state.ranked?.profiles),own=data.own||initialRating();
    $('#your-rating').textContent=user.google?String(Math.round(own.rating)):'—';
    $('#your-position').textContent=user.google&&data.own?'#'+own.rank:'Unranked';
    $('#your-matches').textContent=user.google?own.games+' match'+(own.games===1?'':'es')+' · '+(own.games<10?'Provisional':'Established'):'Sign in with Google to earn a rating';
    $('#ranking-population').textContent=data.total+' rated players · '+({normal:'Normal',snake:'Snake',team:'Team / Team Snake'}[mode]);
    const body=$('#ranking-rows');body.replaceChildren();
    for(const row of data.rows){const tr=document.createElement('tr');tr.classList.toggle('your-row',row.id===user.uid);for(const text of ['#'+row.rank,row.name||'Grid rider',row.mmr+(row.games<10?' *':''),row.games]){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}
    $('#ranking-empty').classList.toggle('hidden',data.total>0);
  };
  $('#open-rankings').onclick=()=>{state.renderRankings();show(page);history.replaceState(null,'','#rankings');};
  $('#open-rankings').disabled=false;
  $('#ranking-home').onclick=()=>{show($('#landing'));history.replaceState(null,'',location.pathname);};
  $('#ranking-mode').onchange=state.renderRankings;$('#ranking-limit').onchange=state.renderRankings;
  if(location.hash==='#rankings')$('#open-rankings').click();
}
