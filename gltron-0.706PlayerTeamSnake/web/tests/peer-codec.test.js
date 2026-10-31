import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pack,unpack} from '../src/peer-mesh.js';
import {atomic} from '../src/atomic.js';
test('checkpoint compression is lossless and rejects oversized decoded state',async()=>{
  const data=Uint8Array.from({length:100000},(_,i)=>i%251);
  assert.deepEqual(await unpack(await pack(data)),data);
  await assert.rejects(()=>unpack(new Uint8Array()),/./);
  await assert.rejects(()=>unpackFromLarge(),/Checkpoint too large/);
});
async function unpackFromLarge(){return unpack(await pack(new Uint8Array(200000)));}
test('compare-and-swap retries serialize concurrent authority updates',async()=>{
  let state=null;
  const store={get:async()=>structuredClone(state),cas:async(_,revision,value)=>{if((state?.revision||0)!==revision)return false;state=structuredClone(value);return true;}};
  await Promise.all(Array.from({length:10},()=>atomic(store,'authority',value=>({count:(value?.count||0)+1}))));
  assert.equal(state.count,10);assert.equal(state.revision,10);
});
