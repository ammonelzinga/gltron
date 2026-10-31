import {open,seal} from './crypto.js';

const configuration={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export async function pack(bytes){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());}
export async function unpack(bytes){
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>160000){await reader.cancel();throw Error('Checkpoint too large');}chunks.push(value);}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}

export class PeerMesh {
  constructor({store,code,browserId,password,salt,onMessage,onState}){
    Object.assign(this,{store,code,browserId,password,salt,onMessage,onState});this.peers=new Map();this.closed=false;this.packet=0;this.fragments=new Map();
  }
  update(players,owner){
    const browsers=new Map(players.filter(p=>!p.bot).map(p=>[p.browserId||p.id,p]));
    const self=browsers.get(this.browserId);if(!self)return;
    // Six-rider rooms are fully connected. Large tournament lobbies connect
    // through the coordinator and two preconnected successors, avoiding N² links.
    const backups=new Set([owner,...[...browsers.keys()].filter(id=>id!==owner).sort().slice(0,2)]);
    const needed=id=>browsers.size<=8||backups.has(this.browserId)||backups.has(id);
    for(const [id,player] of browsers)if(id!==this.browserId&&needed(id)&&!this.peers.has(id))this.connect(id,self,player).catch(error=>this.onState?.(id,'failed',error));
    for(const [id,entry] of this.peers)if(!browsers.has(id)||!needed(id)){entry.stop?.();entry.pc.close();this.peers.delete(id);}
  }
  attach(entry,channel){
    if(channel.label==='controls')entry.controls=channel;else entry.world=channel;
    channel.onopen=()=>this.onState?.(entry.id,'connected');
    channel.onmessage=event=>{
      try{
        if(typeof event.data!=='string'||event.data.length>20000)return;
        const message=JSON.parse(event.data);
        if(message.type!=='chunk'){this.onMessage?.(entry.id,message);return;}
        if(!Number.isInteger(message.total)||message.total<1||message.total>64||message.index<0||message.index>=message.total||typeof message.data!=='string')return;
        const key=`${entry.id}:${message.id}`;
        for(const [k,v] of this.fragments)if(performance.now()-v.at>3000)this.fragments.delete(k);
        if(this.fragments.size>128)return;
        const frame=this.fragments.get(key)||{at:performance.now(),parts:new Array(message.total),meta:message.meta};
        if(frame.parts.length!==message.total)return;
        frame.parts[message.index]=message.data;this.fragments.set(key,frame);
        if(frame.parts.filter(Boolean).length===message.total){this.fragments.delete(key);const bytes=decode(frame.parts.join(''));this.onMessage?.(entry.id,{...frame.meta,bytes});}
      }catch(error){this.onState?.(entry.id,'packet-error',error);}
    };
  }
  async connect(id,self,other){
    const pc=new RTCPeerConnection(configuration),entry={id,pc,busy:false};this.peers.set(id,entry);
    pc.onconnectionstatechange=()=>this.onState?.(id,pc.connectionState);
    pc.ondatachannel=event=>this.attach(entry,event.channel);
    const initiator=this.browserId<id,key=[this.browserId,id].sort().join('_'),path=`signals/${this.code}/mesh-${key}`;
    let seenOffer='',answering=false;
    entry.stop=this.store.watch(path,async record=>{
      if(!record||this.closed||pc.signalingState==='closed')return;
      try{
        if(!initiator&&record.offer&&record.offerId!==seenOffer&&!answering){
          answering=true;seenOffer=record.offerId;
          await pc.setRemoteDescription(await open(record.offer,this.password,this.salt));
          await pc.setLocalDescription(await pc.createAnswer());await this.gather(pc);
          await this.store.set(`${path}/answer`,{offerId:seenOffer,description:await seal(pc.localDescription.toJSON(),this.password,this.salt)});
          answering=false;
        }else if(initiator&&record.answer?.offerId===entry.offerId&&!pc.remoteDescription)await pc.setRemoteDescription(await open(record.answer.description,this.password,this.salt));
      }catch(error){answering=false;this.onState?.(id,'failed',error);}
    });
    if(initiator){
      this.attach(entry,pc.createDataChannel('controls',{ordered:true}));
      this.attach(entry,pc.createDataChannel('world',{ordered:false,maxRetransmits:0}));
      entry.offerId=crypto.randomUUID();await pc.setLocalDescription(await pc.createOffer());await this.gather(pc);
      if(this.closed)return;
      await this.store.set(path,{kind:'mesh',aId:self.id,bId:other.id,authUid:self.authUid,hostUid:other.authUid,offerId:entry.offerId,offer:await seal(pc.localDescription.toJSON(),this.password,this.salt)});
    }
  }
  async gather(pc){for(let i=0;i<50&&pc.iceGatheringState!=='complete'&&pc.signalingState!=='closed';i++)await sleep(100);}
  connected(id){return this.peers.get(id)?.controls?.readyState==='open';}
  send(id,message){const c=this.peers.get(id)?.controls;if(c?.readyState==='open')c.send(JSON.stringify(message));}
  broadcast(message){for(const id of this.peers.keys())this.send(id,message);}
  world(meta,bytes){
    const data=encode(bytes),id=++this.packet,total=Math.ceil(data.length/11000);
    if(total>64)throw Error('Game checkpoint exceeds packet limit');
    for(const entry of this.peers.values()){
      const c=entry.world;if(c?.readyState!=='open'||c.bufferedAmount>256000)continue;
      for(let i=0;i<total;i++)c.send(JSON.stringify({type:'chunk',id,total,index:i,meta,data:data.slice(i*11000,(i+1)*11000)}));
    }
  }
  close(){this.closed=true;for(const e of this.peers.values()){e.stop?.();e.pc.close();}this.peers.clear();}
}
