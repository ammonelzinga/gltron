import {prepareQuickMatch} from './src/quick-queue.js';
import {admitParty} from './src/party-admission.js';
import {defineConfig} from 'vite';

// Loopback-only, in-memory lobby/signaling for cross-browser local testing.
export default defineConfig({server:{watch:{ignored:['**/playwright-report/**','**/test-results/**','**/test-results-ranked/**','**/visual-review/**','**/*-debug.log']}},plugins:[{
  name:'gltrof-local-lobbies',
  configureServer(server){
    const state={rooms:{},signals:{},quickQueue:{},rankedMatches:{}};
    let version=0;const replies=new Map();
    const keys=path=>{
      const parts=String(path||'').split('/').filter(Boolean);
      if(!['rooms','signals','quickQueue','rankedMatches','parties','rankedIdentities'].includes(parts[0])||parts.some(key=>['__proto__','prototype','constructor'].includes(key)))throw Error('Invalid path');
      return parts;
    };
    const read=path=>keys(path).reduce((value,key)=>value?.[key],state);
    const write=(path,value)=>{
      const parts=keys(path);let cursor=state;
      if(parts[0]==='rooms'&&parts.length>2&&!state.rooms[parts[1]]){
        if(value===null)return;
        throw Error('That lobby no longer exists.');
      }
      for(const key of parts.slice(0,-1)){if(value===null&&cursor[key]==null)return;cursor=cursor[key]??={};}
      if(value===null)delete cursor[parts.at(-1)];else cursor[parts.at(-1)]=value;
    };
    server.middlewares.use('/__gltrof_local',async(req,res)=>{
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      try{
        const expected=`http://${req.headers.host}`;
        if(req.headers.origin&&req.headers.origin!==expected)throw Error('Origin rejected');
        if(req.headers['sec-fetch-site']==='cross-site')throw Error('Origin rejected');
        if(req.method==='GET'){res.end(JSON.stringify({state,version}));return;}
        if(req.method!=='POST'||req.headers['x-gltrof-local']!=='1')throw Error('Request rejected');
        let body='';for await(const chunk of req){body+=chunk;if(body.length>2_000_000)throw Error('Request too large');}
        const request=JSON.parse(body);let result=null;
        if(request.requestId&&replies.has(request.requestId)){res.end(JSON.stringify({result:replies.get(request.requestId),state,version}));return;}
        if(request.action==='cas'){
          result=(read(request.path)?.revision||0)===request.revision;
          if(result){if(request.value?.revision!==request.revision+1)throw Error('Invalid revision');write(request.path,request.value);}
        }
        else if(request.action==='set')write(request.path,request.value);
        else if(request.action==='get')result=read(request.path)??null;
        else if(request.action==='create'){
          const room=request.room,code=room?.meta?.code;
          if(!/^[A-Z0-9]{6,8}$/.test(code))throw Error('Invalid room code');
          result=!state.rooms[code];if(result)state.rooms[code]=room;
        }else if(request.action==='prepareQuickMatch'){state.rooms[request.code]=prepareQuickMatch(state.rooms[request.code],request.now,request.bots);result=true;}else if(request.action==='admitParty'){state.rooms[request.code]=admitParty(state.rooms[request.code],request.request,request.players);result=true;}else if(request.action==='join'){
          const room=state.rooms[request.code],player=request.player;
          if(!room)throw Error('That lobby no longer exists.');
          if((room.meta.started||room.meta.starting)&&player.role!=='spectator')throw Error('That match has already started.');
          const players=room.players??={},entrants=room.meta.kind==='game'?6:room.tournament.config.maxEntrants+(room.meta.hostParticipates?0:1),capacity=player.role==='spectator'?entrants+64:entrants;
          if(players[player.id])result=players[player.id].slot;
          else{
            if(Object.keys(players).length>=capacity)throw Error('That lobby is full.');
            const used=new Set(Object.values(players).map(entry=>entry.slot));
            result=Array.from({length:capacity},(_,i)=>i).find(i=>!used.has(i));
            player.slot=result;players[player.id]=player;
          }
        }else throw Error('Unknown action');
        if(request.action!=='get'&&result!==false)version++;
        if(request.requestId&&request.action!=='get'){replies.set(request.requestId,result);if(replies.size>1024)replies.delete(replies.keys().next().value);}
        res.end(JSON.stringify({result,state,version}));
      }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
    });
  }
}]} );
