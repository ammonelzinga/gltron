// Glickman's published Glicko-2 equations. Team expectations use team means;
// that adaptation and per-match weighted FFA comparisons are glTrof rules.
const SCALE=173.7178;
export const initialRating=()=>({rating:1500,rd:350,volatility:.06,games:0});
export function rateGlicko(player,opponents,tau=.5){
  const mu=(player.rating-1500)/SCALE,phi=player.rd/SCALE,sigma=player.volatility;
  if(!opponents.length)return {...player,rd:Math.min(350,SCALE*Math.sqrt(phi*phi+sigma*sigma))};
  let information=0,gradient=0;
  for(const o of opponents){
    const g=1/Math.sqrt(1+3*(o.rd/SCALE)**2/Math.PI**2),share=o.share??1;
    const expected=1/(1+Math.exp(-g*(mu+(o.offset||0)/SCALE-(o.rating-1500)/SCALE))),weight=o.weight??1;
    information+=weight*g*g*expected*(1-expected)*share*share;
    gradient+=weight*g*(o.score-expected)*share;
  }
  if(information<=0||!Number.isFinite(information))throw Error('Invalid rating observations');
  const v=1/information,delta=v*gradient,a=Math.log(sigma*sigma);
  const f=x=>{const ex=Math.exp(x);return ex*(delta*delta-phi*phi-v-ex)/(2*(phi*phi+v+ex)**2)-(x-a)/(tau*tau);};
  let A=a,B;
  if(delta*delta>phi*phi+v)B=Math.log(delta*delta-phi*phi-v);
  else{let k=1;while(f(a-k*tau)<0&&k<1000)k++;B=a-k*tau;}
  let fA=f(A),fB=f(B);
  for(let i=0;i<1000&&Math.abs(B-A)>1e-6;i++){
    const C=A+(A-B)*fA/(fB-fA),fC=f(C);
    if(fC*fB<=0){A=B;fA=fB;}else fA/=2;
    B=C;fB=fC;
  }
  const volatility=Math.exp(A/2),pre=Math.sqrt(phi*phi+volatility*volatility),nextPhi=1/Math.sqrt(1/(pre*pre)+information);
  const rating=1500+SCALE*(mu+nextPhi*nextPhi*gradient),rd=SCALE*nextPhi;
  if(![rating,rd,volatility].every(Number.isFinite))throw Error('Rating update failed');
  return {rating,rd,volatility,games:(player.games||0)+1};
}
