export async function atomic(store,path,change){
  // Firebase must rerun the operation against the current server value rather
  // than retrying a revision captured before its transaction cache was loaded.
  if(store.transact)return store.transact(path,change);
  for(let attempt=0;attempt<30;attempt++){
    const current=await store.get(path),next=change(current?structuredClone(current):null);
    if(next===undefined)return null;
    const revision=current?.revision||0;
    next.revision=revision+1;
    if(await store.cas(path,revision,next))return next;
    await new Promise(resolve=>setTimeout(resolve,20+Math.random()*50));
  }
  throw Error('Room changed repeatedly. Please try again.');
}
