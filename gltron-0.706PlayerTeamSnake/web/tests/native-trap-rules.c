#include "trap_rules.h"
#include "../../src/include/video/texture.h"
#include <assert.h>
#include <stdio.h>
#include <time.h>
static TrapBody body={-1.25935f,1.25935f,-5,5};
static TrapRider riders[6];
static int checks=0;
static void reset(void){int i;for(i=0;i<6;i++){riders[i].x=1000+i*100;riders[i].y=1000;riders[i].speed=100;riders[i].active=1;riders[i].dir=0;}}
static void award(int owner,int body_owner,int cause,int expected,int quarters){
  TrapAward a=trap_choose_award(&body,riders,6,0,owner,body_owner,cause,0,0);assert(a.player==expected);assert(a.quarters==quarters);checks++;
}
int main(void){float hit;int i;clock_t began;volatile int sum=0;
  assert(TEX_BUG>=TEX_SKYBOX+6);checks++; /* pickup must not alias a skybox face */
  reset();riders[1].x=100;riders[1].y=0;award(1,-1,1,1,1); /* distant trail: .25 */
  riders[1].x=15;award(1,-1,1,1,3); /* nearby owner's trail: .75 */
  riders[2].x=10;riders[2].y=0;award(1,-1,1,1,3); /* .75 beats another rider's .5 */
  riders[1].x=100;award(1,-1,1,2,2); /* nearby opponent beats distant owner */
  award(-1,-1,2,2,2); /* wall crash can credit nearby opponent */
  riders[1].x=0;riders[1].y=4;award(1,-1,1,1,8); /* body beats .75 and .5 */
  award(-1,1,3,1,8); /* physical swept-body contact */
  reset();riders[1].x=0;riders[1].y=1;riders[2].x=0;riders[2].y=4;
  award(2,-1,1,2,8); /* equal maximum award prefers actual trail owner */
  award(-1,-1,2,1,8); /* otherwise nearest body wins */
  riders[1].x=15;riders[1].y=0;riders[2].x=-15;riders[2].y=0;
  award(-1,-1,2,1,2); /* equal distances: stable slot, exactly one recipient */
  riders[2].x=10;award(-1,-1,2,2,2);
  reset();riders[1].x=30;riders[1].y=0;award(1,-1,1,1,3); /* inclusive .3s boundary */
  riders[1].x=30.01f;award(1,-1,1,1,1);
  riders[1].x=5;riders[1].speed=10;award(1,-1,1,1,1);
  riders[1].speed=20;award(1,-1,1,1,3); /* boost expands distance radius */
  riders[1].active=0;award(1,-1,1,1,1); /* retained dead trail earns base only */
  award(-1,-1,2,-1,0); /* dead head cannot earn proximity/body credit */
  reset();award(0,-1,1,-1,0); /* self-trail never self-credits */
  riders[1].x=15;riders[1].y=0;award(0,-1,1,1,2); /* another rider may trap a self-crash */
  riders[1].x=0;riders[1].y=0;award(1,1,0,-1,0); /* disconnect/removal awards nothing */
  reset();riders[1].x=0;riders[1].y=0;
  assert(trap_body_contains(&body,riders+1,1.25f,4.99f));checks++;
  assert(!trap_body_contains(&body,riders+1,1.27f,0));checks++;
  assert(!trap_body_contains(&body,riders+1,0,5.01f));checks++;
  riders[1].dir=1;assert(trap_body_contains(&body,riders+1,4.99f,1.25f));checks++;
  assert(!trap_body_contains(&body,riders+1,0,1.27f));checks++;
  riders[1].dir=0;
  assert(trap_sweep_body(&body,riders+1,-20,0,40,0,0,0,&hit));assert(hit>0.46f&&hit<0.48f);checks++;
  assert(!trap_sweep_body(&body,riders+1,-20,6,40,0,0,0,&hit));checks++;
  assert(trap_sweep_body(&body,riders+1,-20,0,10,0,-20,0,&hit));checks++; /* moving target, no tunneling */
  began=clock();for(i=0;i<1000000;i++){riders[1].x=15+(i&1);sum+=trap_choose_award(&body,riders,6,0,1,-1,1,0,0).quarters;}
  printf("Native trap rules: %d geometry/award checks passed; 1M six-rider selections %.1fms (sum %d)\n",checks,1000.0*(clock()-began)/CLOCKS_PER_SEC,sum);
  return 0;
}
