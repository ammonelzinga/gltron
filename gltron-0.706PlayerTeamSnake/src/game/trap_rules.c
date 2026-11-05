#include "trap_rules.h"
#include <math.h>
static const int dx[4]={0,-1,0,1},dy[4]={-1,0,1,0};
static int clip(float start,float delta,float low,float high,float *enter,float *leave) {
  float a,b;
  if(fabsf(delta)<1e-8f)return start>=low&&start<=high;
  a=(low-start)/delta;b=(high-start)/delta;
  if(a>b){float swap=a;a=b;b=swap;}
  if(a>*enter)*enter=a;if(b<*leave)*leave=b;
  return *enter<=*leave;
}
int trap_body_contains(const TrapBody *body,const TrapRider *r,float x,float y) {
  float a,b;
  if(!r->active||r->dir<0||r->dir>3)return 0;
  x-=r->x;y-=r->y;a=x*dx[r->dir]+y*dy[r->dir];b=-x*dy[r->dir]+y*dx[r->dir];
  return a>=body->forward_min&&a<=body->forward_max&&b>=body->side_min&&b<=body->side_max;
}
int trap_sweep_body(const TrapBody *body,const TrapRider *r,float x,float y,float mx,float my,float target_mx,float target_my,float *hit) {
  float enter=0,leave=1,a,b,da,db;
  if(!r->active||r->dir<0||r->dir>3)return 0;
  x-=r->x;y-=r->y;mx-=target_mx;my-=target_my;
  a=x*dx[r->dir]+y*dy[r->dir];b=-x*dy[r->dir]+y*dx[r->dir];
  da=mx*dx[r->dir]+my*dy[r->dir];db=-mx*dy[r->dir]+my*dx[r->dir];
  if(!clip(a,da,body->forward_min,body->forward_max,&enter,&leave)||
     !clip(b,db,body->side_min,body->side_max,&enter,&leave)||enter<0||enter>1)return 0;
  *hit=enter;return 1;
}
TrapAward trap_choose_award(const TrapBody *body,const TrapRider *riders,int count,int victim,int trail_owner,int body_owner,int cause,float x,float y) {
  TrapAward best={-1,0};float best_distance=0;int i;
  if(cause<1||cause>3)return best; /* disconnects/removals are not trap events */
  for(i=0;i<count;i++) {
    const TrapRider *r=riders+i;float vx=x-r->x,vy=y-r->y,distance=vx*vx+vy*vy;
    float radius=r->speed*0.3f;int quarters=0,near;
    if(i==victim)continue;
    near=r->active&&isfinite(distance)&&isfinite(radius)&&radius>=0&&distance<=radius*radius+1e-5f;
    if(i==trail_owner)quarters=near?3:1;
    if(near&&quarters<2)quarters=2;
    if(r->active&&(i==body_owner||trap_body_contains(body,r,x,y)))quarters=8;
    if(!quarters)continue;
    /* One recipient: highest award, actual trail owner, nearest head, stable slot. */
    if(quarters>best.quarters||(quarters==best.quarters&&
       ((i==trail_owner&&best.player!=trail_owner)||
        ((i==trail_owner)==(best.player==trail_owner)&&distance<best_distance)))) {
      best.player=i;best.quarters=quarters;best_distance=distance;
    }
  }
  return best;
}
