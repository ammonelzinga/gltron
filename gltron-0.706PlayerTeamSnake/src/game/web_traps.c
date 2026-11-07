#ifdef __EMSCRIPTEN__
#include "game/gltron.h"
#include "trap_rules.h"
#include <float.h>
#include <math.h>

int web_trap_policy=0;
static TrapBody body={-1.25935f,1.25935f,-5,5};
static TrapRider frame[MAX_PLAYERS];
static float move_x[MAX_PLAYERS],move_y[MAX_PLAYERS],crash_at[MAX_PLAYERS];
static int frame_valid=0;
static int actual_trail_owner[MAX_PLAYERS];

void web_traps_configure(void) {
  Mesh *model=lightcycle[0];frame_valid=0;
  if(model){body.side_min=model->BBox.vMin.v[0];body.side_max=body.side_min+model->BBox.vSize.v[0];
    body.forward_max=-model->BBox.vMin.v[1];body.forward_min=body.forward_max-model->BBox.vSize.v[1];}
}
typedef struct { float at; int owner,cause; } Contact;
static Contact contacts[MAX_PLAYERS][2*MAX_PLAYERS+1],chosen[MAX_PLAYERS];
static void remember(int player,int index,float at,int owner,int cause){
  if(at>=0&&at<=1&&at<contacts[player][index].at){contacts[player][index].at=at;contacts[player][index].owner=owner;contacts[player][index].cause=cause;}
}
void web_traps_begin_frame(int dt,const float *distances) {
  int i,j,k,step;float units_per_second=dt>0?1000.0f/dt:0;frame_valid=1;
  for(i=0;i<game->players;i++) {
    Data *d=game->player[i].data;getPositionFromData(&frame[i].x,&frame[i].y,d);
    frame[i].active=PLAYER_IS_ACTIVE(game->player+i);frame[i].dir=d->dir;
    frame[i].speed=distances[i]*units_per_second;actual_trail_owner[i]=-1;
    move_x[i]=distances[i]*dirsX[d->dir];move_y[i]=distances[i]*dirsY[d->dir];crash_at[i]=FLT_MAX;chosen[i].at=FLT_MAX;
    for(j=0;j<2*MAX_PLAYERS+1;j++)contacts[i][j].at=FLT_MAX;
  }
  /* Scan the original trail geometry once per rider. Body sweeps add only
     N*(N-1) slab tests. All contacts share the same tick-start positions. */
  for(i=0;i<game->players;i++)if(frame[i].active){
    segment2 movement;movement.vStart.v[0]=frame[i].x;movement.vStart.v[1]=frame[i].y;
    movement.vDirection.v[0]=move_x[i];movement.vDirection.v[1]=move_y[i];
    for(j=0;j<game->players;j++) {
      Data *other=game->player[j].data;float hit;
      if(j!=i&&trap_sweep_body(&body,frame+j,frame[i].x,frame[i].y,move_x[i],move_y[i],move_x[j],move_y[j],&hit))remember(i,MAX_PLAYERS+j,hit,j,3);
      if(other->trail_height<TRAIL_HEIGHT)continue;
      for(k=0;k<=other->trailOffset;k++) {
        vec2 point;float t,u;
        if(j==i&&k>=other->trailOffset-1)break;
        if(segment2_Intersect(&point,&t,&u,&movement,other->trails+k)&&u>=0&&u<=1)remember(i,j,t,j,1);
      }
    }
    for(j=0;j<4;j++) {
      vec2 point;float t,u;
      if(segment2_Intersect(&point,&t,&u,&movement,walls+j)&&u>=0&&u<=1)remember(i,2*MAX_PLAYERS,t,-1,2);
    }
  }
  /* Resolve at most six crash times. A body, or erased trail, belonging to a
     rider who crashed earlier in this tick cannot cause a phantom collision. */
  for(step=0;step<game->players;step++) {
    int victim=-1;Contact best={FLT_MAX,-1,0};
    for(i=0;i<game->players;i++)if(frame[i].active&&chosen[i].at==FLT_MAX)
      for(j=0;j<2*MAX_PLAYERS+1;j++) {
        Contact c=contacts[i][j];
        if(c.at==FLT_MAX)continue;
        if(c.owner>=0&&crash_at[c.owner]+1e-6f<c.at&&(c.cause==3||(c.cause==1&&game2->rules.eraseCrashed)))continue;
        if(c.at<best.at-1e-6f||(fabsf(c.at-best.at)<=1e-6f&&c.cause==3&&best.cause!=3)){best=c;victim=i;}
      }
    if(victim<0)break;chosen[victim]=best;crash_at[victim]=best.at;
    for(j=0;j<game->players;j++)if(fabsf(contacts[victim][j].at-best.at)<=1e-6f&&!(game2->rules.eraseCrashed&&crash_at[j]+1e-6f<best.at)){actual_trail_owner[victim]=j;break;}
  }
}
int web_traps_outlasts(int player,int victim) {
  if(!frame_valid||crash_at[victim]==FLT_MAX)return PLAYER_IS_ACTIVE(game->player+player);
  return frame[player].active&&crash_at[player]>crash_at[victim]+1e-6f;
}
int web_traps_crash_test(int player,const segment2 *movement) {
  Data *d=game->player[player].data;Contact c=chosen[player];segment2 *current;
  if(c.at==FLT_MAX)return 0;
  current=d->trails+d->trailOffset;
  current->vDirection.v[0]=movement->vStart.v[0]+c.at*movement->vDirection.v[0]-current->vStart.v[0];
  current->vDirection.v[1]=movement->vStart.v[1]+c.at*movement->vDirection.v[1]-current->vStart.v[1];
  createCrashEvent(player,c.owner,c.cause);return 1;
}
void web_traps_award(const GameEvent *e) {
  TrapRider at_crash[MAX_PLAYERS];TrapAward award;int i;
  float fraction=frame_valid&&crash_at[e->player]!=FLT_MAX?crash_at[e->player]:1;
  if(e->cause<1||e->cause>3)return;
  /* Mutual head-on contact is a draw, never a way to farm trap points.
     Skip the whole award, including third-party proximity fallbacks. */
  if(frame_valid&&e->cause==3&&e->killer>=0&&e->killer<game->players&&
     chosen[e->killer].cause==3&&chosen[e->killer].owner==e->player&&
     ((frame[e->player].dir+2)%4)==frame[e->killer].dir&&
     fabsf(crash_at[e->player]-crash_at[e->killer])<=1e-6f)return;
  for(i=0;i<game->players;i++) {
    if(frame_valid){float t=fminf(fraction,crash_at[i]);at_crash[i]=frame[i];
      at_crash[i].x+=move_x[i]*t;at_crash[i].y+=move_y[i]*t;
      at_crash[i].active=frame[i].active&&crash_at[i]+1e-6f>=fraction;
    }else{Data *d=game->player[i].data;getPositionFromData(&at_crash[i].x,&at_crash[i].y,d);
      at_crash[i].dir=d->dir;at_crash[i].active=PLAYER_IS_ACTIVE(game->player+i);at_crash[i].speed=fmaxf(0,d->speed*10);}
  }
  award=trap_choose_award(&body,at_crash,game->players,e->player,
    frame_valid?actual_trail_owner[e->player]:(e->cause==1?e->killer:-1),e->cause==3?e->killer:-1,e->cause,e->x,e->y);
  if(award.player>=0){Data *d=game->player[award.player].data;d->trap_points_quarters+=award.quarters;d->trail_kills++;}
}
#endif
