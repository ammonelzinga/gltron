// Keep the host simulation/rendering running when another browser tab is focused.
// Only scheduling runs in the worker; the existing C engine remains on its thread.
export function startEngineClock(module){
  const url=URL.createObjectURL(new Blob([`
    let pending=false;
    onmessage=()=>{pending=false;};
    setInterval(()=>{if(!pending){pending=true;postMessage('tick');}},1000/60);
  `],{type:'text/javascript'}));
  const worker=new Worker(url);URL.revokeObjectURL(url);
  worker.onmessage=()=>{
    try{module.ccall('web_tick',null,[],[]);worker.postMessage('ack');}
    catch(error){worker.terminate();console.error('Game clock stopped:',error);}
  };
  module.ccall('web_use_worker_clock',null,[],[]);
  return worker;
}
