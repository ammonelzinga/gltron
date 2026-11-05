// Local Firebase emulators only. Unsigned test tokens are never valid in production.
import assert from 'node:assert/strict';
import {ballotMeta,acceptedResult} from '../src/result-votes.js';
import {deriveRatings} from '../src/rating-history.js';
const namespace='demo-gltrof-default-rtdb',base='http://127.0.0.1:9000';let checks=0;
async function request(uid,path,method='GET',value,google=true){
  const query=new URLSearchParams({ns:namespace}),now=Math.floor(Date.now()/1000),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  if(uid)query.set('auth',encode({alg:'none',typ:'JWT'})+'.'+encode({aud:'demo-gltrof',iss:'https://securetoken.google.com/demo-gltrof',sub:uid,user_id:uid,iat:now,exp:now+3600,auth_time:now,firebase:{identities:google?{'google.com':[uid]}:{},sign_in_provider:google?'google.com':'anonymous'}})+'.');
  const response=await fetch(base+'/'+path+'.json?'+query,{method,headers:{'Content-Type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
  return {status:response.status,value:await response.json()};
}
async function allow(...args){const r=await request(...args);assert.equal(r.status,200,JSON.stringify({path:args[1],...r}));checks++;return r.value;}
async function deny(...args){const r=await request(...args);assert.equal(r.status,401,JSON.stringify({path:args[1],...r}));checks++;}
const stamp=()=>({'.sv':'timestamp'}),code='ELO'+Date.now(),path='rooms/'+code;
const roster=Array.from({length:3},(_,slot)=>({id:'p'+slot,name:'Rider '+slot,browserId:'b'+slot,slot,localIndex:0,authUid:'u'+slot,ratedUid:'u'+slot,role:'player'}));
const room={meta:{code,hostUid:'u0',createdAt:Date.now(),competition:'ranked',mode:'classic',kind:'game',matchPoints:1},authority:{revision:1,term:1,uid:'u0',browserId:'b0',playerId:'p0',leaseUntil:Date.now()+4000},players:Object.fromEntries(roster.map(p=>[p.id,p]))};
for(const p of roster)if(!(await request(p.authUid,'rankedIdentities/'+p.authUid)).value)await allow(p.authUid,'rankedIdentities/'+p.authUid,'PUT',{uid:p.authUid,createdAt:stamp()});
await allow('u0',path,'PUT',room);
const meta={...ballotMeta(room,roster,stamp()),game:1},id='rule-'+Date.now(),ballot='rankedMatches/'+id;
await deny('u0',ballot,'PUT',{meta,revision:1},false);
await allow('u0',ballot,'PUT',{meta,revision:1});
await deny('u0',ballot+'/meta/points','PUT',99);
await deny('u0','ratings/u2','PUT',{rating:99999});
await allow('u0',ballot+'/closing','PUT',{at:stamp(),revision:1});
const report=(uid,placements)=>({uid,placements,key:JSON.stringify(placements),at:stamp(),revision:1});
await deny('u0',ballot+'/reports/b1','PUT',report('u1',[2,1,3]));
await deny('u1',ballot+'/reports/b1','PUT',report('u1',[1,2,3]),false);
await allow('u0',ballot+'/reports/b0','PUT',report('u0',[2,1,3]));
await allow('u1',ballot+'/reports/b1','PUT',report('u1',[1,2,3]));
await allow('u2',ballot+'/reports/b2','PUT',report('u2',[1,2,3]));
await deny('u1',ballot+'/reports/b1','PUT',report('u1',[3,2,1]));
await deny('u0',ballot+'/reports/b1','DELETE');
const final=(uid,key)=>({uid,key,method:'vote',at:stamp(),revision:1});
await deny('u1',ballot+'/final','PUT',final('u1','[1,2,3]'));
await allow('u0',ballot+'/final','PUT',final('u0','[1,2,3]'));
await deny('u0',ballot+'/final','PUT',final('u0','[2,1,3]'));
await deny('u0',ballot,'DELETE');
const saved=await allow('u0',ballot);assert.ok(acceptedResult(saved));assert.equal(deriveRatings({[id]:saved}).normal.u0.games,1);checks+=2;
// Even a stored dishonest final selection cannot change honest clients' ratings.
const dishonest=structuredClone(saved);dishonest.final.key='[2,1,3]';assert.equal(acceptedResult(dishonest),null);assert.deepEqual(deriveRatings({dishonest}),{normal:{},snake:{},team:{}});checks+=2;
await deny('u1','rankedIdentities/u1','DELETE');
await deny('anonymous','rankedIdentities/anonymous','PUT',{uid:'anonymous',createdAt:stamp()},false);
const group='parties/GROUP'+Date.now();
await allow('u1',group+'/meta','PUT',{code:group.split('/')[1],uid:'u1',createdAt:Date.now(),revision:1});
await deny('u2',group+'/meta','PUT',{code:group.split('/')[1],uid:'u2',createdAt:Date.now(),revision:1});
const member={uid:'u1',browserId:'b1',name:'Buddy',localPlayers:2,seenAt:Date.now(),status:'home',joinedAt:Date.now(),allowRanked:true};
await allow('u1',group+'/members/b1','PUT',member);
await deny('u2',group+'/members/b1','PUT',{...member,name:'Forged'});
await deny('u2',group+'/members/b1','DELETE');
await deny('anonymous',group+'/members/anonymous','PUT',{...member,uid:'anonymous',browserId:'anonymous'},false);
const action={id:'party-request',revision:1,issuer:'b1',uid:'u1',code,at:Date.now(),members:[member],password:{plain:{password:''}},salt:'test'};
await deny('u2',group+'/action','PUT',{...action,uid:'u2'});
await allow('u1',group+'/action','PUT',action);
const partyRequest={id:action.id,party:group.split('/')[1],issuer:'b1',uid:'u1',at:Date.now(),proof:{plain:{id:action.id}}};
await allow('u1',path+'/joinRequests/'+action.id,'PUT',partyRequest);
await deny('u1',path+'/joinRequests/'+action.id+'/response','PUT',{status:'admitted'});
await allow('u0',path+'/joinRequests/'+action.id+'/response','PUT',{status:'rejected',error:'Full group does not fit'});
await allow('u1',group+'/members/b1','DELETE');
await deny('u1',group+'/action','PUT',{...action,revision:2});
await allow('u0',path,'DELETE');
console.log('Ranked Firebase rules:',checks,'identity, immutability and result-integrity checks passed');
