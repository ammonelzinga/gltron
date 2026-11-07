import {randomRiderName} from './rider-name.js';
const $=selector=>document.querySelector(selector);

export function riderFormData(form){
  const data=new FormData(form);
  data.set('playerName',$('#player-name').value.trim());
  data.set('localPlayers',$('#local-players').value);
  return data;
}

export function validateRider(){
  const input=$('#player-name');
  input.setCustomValidity(input.value.trim()?'':'Enter your rider name to continue.');
  return input.reportValidity();
}

export function openHostSetup(){
  if(!validateRider())return;
  const title=$('#create-form [name=lobbyName]');
  if(!title.dataset.edited)title.value=(`${$('#player-name').value.trim()||'My'}’s grid`).slice(0,40);
  $('#host-status').textContent='';
  $('#host-dialog').showModal();title.focus();
}

export function setupLanding({rememberName,onFilter}){
  const name=$('#player-name'),count=$('#local-players');
  name.value=localStorage.getItem('gltrof-player-name')||randomRiderName();
  name.addEventListener('input',()=>{name.setCustomValidity('');rememberName(name.value);});
  count.value=String(Math.max(1,Math.min(4,Number(sessionStorage.getItem('gltrof-local-players'))||1)));
  count.addEventListener('change',()=>sessionStorage.setItem('gltrof-local-players',count.value));
  $('#create-form [name=lobbyName]').addEventListener('input',event=>event.target.dataset.edited='true');
  $('#landing').addEventListener('click',event=>{if(event.target.closest('[data-open-host]'))openHostSetup();});
  $('#close-host').addEventListener('click',()=>$('#host-dialog').close());
  $('#show-controls').addEventListener('click',()=>{
    const settings=$('.control-settings');settings.open=true;settings.scrollIntoView({behavior:'smooth',block:'start'});settings.querySelector('summary').focus();
  });
  for(const id of ['lobby-search','lobby-mode','lobby-kind'])$('#'+id).addEventListener(id==='lobby-search'?'input':'change',onFilter);
  function preferences(){
    $('#preference-summary').textContent=['gridSize','mode','speed'].map(key=>{
      const select=$('#quick-form [name='+key+']'),lock=$('#quick-form [name=required-'+key+']');
      lock.disabled=!select.value;if(!select.value)lock.checked=false;
      let value=select.selectedOptions[0].textContent;
      if(key==='gridSize'&&select.value)value+=' grid';
      if(key==='speed'&&select.value)value+=' speed';
      return value+(lock.checked?' (required)':'');
    }).join(' · ');
  }
  $('#quick-preferences').addEventListener('change',preferences);preferences();
}
