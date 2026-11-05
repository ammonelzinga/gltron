import {ballotMeta,REPORT_WINDOW,reportKey,tallyBallot,acceptedResult} from './result-votes.js';
import {deriveRatings} from './rating-history.js';
import {readGameScores} from './scoring.js';

export class RankedSession {
  constructor(state,onChange){
    this.state=state;this.store=state.store;this.onChange=onChange;this.records={};this.ratings=deriveRatings({});
    if(this.store.watchAuth)this.authStop=this.store.watchAuth(()=>this.watchHistory());else this.watchHistory();
    this.timer=setInterval(()=>this.tick().catch(error=>{this.error=error.message;this.onChange();}),500);
  }
  watchHistory(){
    this.historyStop?.();
    if(!this.store.user?.uid)return;
    this.historyStop=this.store.watch('rankedMatches',records=>{this.records=records||{};this.ratings=deriveRatings(this.records);this.error='';this.onChange();},()=>{this.error='Deploy the updated Firebase rules to enable ranked match history.';this.onChange();});
  }
  update(room){
    const id=room?.meta.competition==='ranked'?room.meta.ballotId:null;
    if(id===this.id)return;
    this.stop?.();this.id=id;this.ballot=null;this.error='';
    if(id)this.stop=this.store.watch('rankedMatches/'+id,ballot=>{this.ballot=ballot;this.onChange();});
    this.onChange();
  }
  async prepare(players,game=1){
    const meta={...ballotMeta(this.state.room,players,this.store.timestamp()),game};
    const id=crypto.randomUUID();
    if(!await this.store.putOnce('rankedMatches/'+id,{meta}))throw Error('Could not create ranked match record.');
    await this.store.set('rooms/'+this.state.room.meta.code+'/meta/ballotId',id);
    return id;
  }
  async tick(){
    if(this.busy||!this.id||!this.ballot||this.ballot.final||this.closed)return;
    this.busy=true;
    try{
      const {state}=this,ballot=this.ballot,meta=ballot.meta;
      if(meta.game!==(state.room?.match?.number||1))return;
      if(state.host&&state.room.match?.status==='finished'&&!ballot.closing){
        await this.store.putOnce('rankedMatches/'+this.id+'/closing',{at:this.store.timestamp()});return;
      }
      if(!ballot.closing)return;
      const own=meta.voters[state.browserId],module=state.module;
      if(own&&own.uid===this.store.user.uid&&!ballot.reports?.[state.browserId]&&this.store.now()<=ballot.closing.at+REPORT_WINDOW&&module?.ccall('web_round_finished','number',[],[])){
        const {totals:scores,ranks:placements}=readGameScores(module,meta.players,meta.mode,meta.scoring);
        if(Math.max(...scores)>=meta.points){
          await this.store.putOnce('rankedMatches/'+this.id+'/reports/'+state.browserId,{uid:this.store.user.uid,placements,key:reportKey(placements),at:this.store.timestamp()});return;
        }
      }
      if(!state.host)return;
      const tally=tallyBallot(ballot,this.store.now());
      if(tally.status==='resolved')await this.finalize(tally.candidates[0].key,'vote');
      else if(tally.status==='tie'){
        const hostKey=ballot.reports?.[state.browserId]?.key;
        if(tally.candidates.some(c=>c.key===hostKey))await this.finalize(hostKey,'host-tiebreak');
      }else if(this.store.now()>ballot.closing.at+REPORT_WINDOW)await this.finalize('','void');
    }finally{this.busy=false;}
  }
  async finalize(key,method){
    if(!this.state.host||!this.ballot||this.ballot.final)return;
    const tally=tallyBallot(this.ballot,this.store.now());
    if(method==='void'&&(this.store.now()<this.ballot.closing.at+REPORT_WINDOW||['resolved','tie'].includes(tally.status)))throw Error('Results are available. Confirm the final standings.');
    if(method!=='void'&&method!==(tally.status==='tie'?'host-tiebreak':'vote'))throw Error('These results cannot be confirmed yet.');
    if(method!=='void'&&(!['resolved','tie'].includes(tally.status)||!tally.candidates.some(c=>c.key===key)))throw Error('Choose one of the confirmed standings.');
    await this.store.putOnce('rankedMatches/'+this.id+'/final',{key,method,at:this.store.timestamp(),uid:this.store.uid});
  }
  settled(){return Boolean(this.ballot?.final&&(this.ballot.final.method==='void'||acceptedResult(this.ballot)));}
  close(){this.closed=true;clearInterval(this.timer);this.stop?.();this.historyStop?.();this.authStop?.();}
}
