// Guest names stay local. Google profile names never become rating identifiers.
const first=['Byte','Neon','Turbo','Pixel','Quantum','Circuit','Laser','Grid','Cyber','Vector','Chrome','Photon','Binary','Cosmic','Voltage','Flux'];
const last=['Rider','Drifter','Compiler','Surfer','Runner','Glider','Debugger','Cruiser','Comet','Rebel','Pilot','Sparks','Dasher','Looper','Tracer','Rocket'];
export function randomRiderName(random=Math.random){return first[Math.floor(random()*first.length)%first.length]+' '+last[Math.floor(random()*last.length)%last.length];}
export function preferredRiderName(user,saved,account){
  if(user?.google&&user.name&&(account!==user.uid||!saved||saved==='Grid rider'))return user.name.trim().slice(0,24);
  return saved&&saved!=='Grid rider'?saved:randomRiderName();
}
export function syncRiderName(user){
  const input=document.querySelector('#player-name');if(!input||input.disabled)return;
  const key='gltrof-name-account',account=localStorage.getItem(key),next=user?.google?user.uid:'guest';
  const saved=account&&account!==next?null:localStorage.getItem('gltrof-player-name');
  input.value=preferredRiderName(user,saved,account);input.setCustomValidity('');
  localStorage.setItem('gltrof-player-name',input.value);localStorage.setItem(key,next);
}
