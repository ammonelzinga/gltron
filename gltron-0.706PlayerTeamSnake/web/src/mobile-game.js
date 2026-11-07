export function setupMobileGame({game,canvas,sendAction,localCount,spectating,cycleRider,cycleArena}){
  const touchDevice=()=>matchMedia('(pointer: coarse)').matches;
  const held=new Map();
  const fullscreen=()=>{
    if(!touchDevice()||document.fullscreenElement||game.classList.contains('hidden'))return;
    // Fullscreen requires a gesture. Unsupported browsers still get an edge-to-edge viewport.
    try{game.requestFullscreen?.({navigationUI:'hide'})?.catch(()=>{});}catch{}
  };
  function release(event){const press=held.get(event.pointerId);if(!press)return;held.delete(event.pointerId);sendAction(press.local,press.action,false);}
  function press(event,local,action){
    event.preventDefault();try{event.currentTarget.setPointerCapture?.(event.pointerId);}catch{}held.set(event.pointerId,{local,action});sendAction(local,action,true);fullscreen();
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
    const box=canvas.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top,count=localCount();
    const columns=count>2?2:1,rows=count>1?2:1,column=Math.min(columns-1,Math.floor(x/(box.width/columns))),row=Math.min(rows-1,Math.floor(y/(box.height/rows))),local=row*columns+column;
    if(local>=count)return;
    const right=x-column*box.width/columns>=box.width/columns/2;
    if(spectating(local)){event.preventDefault();cycleRider(right?1:-1);fullscreen();return;}
    press(event,local,right?2:1);
  });
  for(const button of game.querySelectorAll('[data-action]'))button.addEventListener('pointerdown',event=>{
    if(spectating(0)){event.preventDefault();const action=Number(button.dataset.action);if(action===4||action===5)cycleRider(action===4?-1:1);return;}
    press(event,0,Number(button.dataset.action));
  });
  for(const button of game.querySelectorAll('[data-arena]'))button.addEventListener('click',()=>cycleArena(Number(button.dataset.arena)));
  game.addEventListener('pointerup',release);game.addEventListener('pointercancel',release);game.addEventListener('lostpointercapture',release);
  addEventListener('blur',()=>{for(const press of held.values())sendAction(press.local,press.action,false);held.clear();});
  game.addEventListener('contextmenu',event=>event.preventDefault());
  return {fullscreen};
}
