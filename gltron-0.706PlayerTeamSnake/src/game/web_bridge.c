#ifdef __EMSCRIPTEN__

#include <emscripten.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#include "game/gltron.h"
#include "base/switchCallbacks.h"

static int web_replica=0,web_epoch=1,web_loaded_epoch=-1;
static unsigned int web_snapshot_time;
EM_JS(int, web_initial_replica, (), { return Module.webReplica ? 1 : 0; });

/* Pointer-free wire records, versioned for this compiled engine build. */
typedef struct {
  uint32_t magic,version,bytes,players,epoch,current;
  int pauseflag,winner,running,team_wins[3],random;
  uint32_t snake_bytes;
} WebCheckpointHeader;
typedef struct { Data data; AI ai; float explosion,impact; } WebCheckpointPlayer;
static unsigned char web_checkpoint[160000];
EM_JS(void, web_publish_checkpoint, (const void *data,int size), {
  Module.webSnapshot=HEAPU8.slice(data,data+size);
});
EM_JS(int, web_receive_checkpoint, (void *data,int capacity), {
  const bytes=Module.webSnapshot;
  if(!(bytes instanceof Uint8Array)||bytes.length>capacity)return 0;
  HEAPU8.set(bytes,data);return bytes.length;
});

extern int web_random_get(void);
extern void web_random_set(int value);
extern int web_snake_save(void *buffer);
extern int web_snake_load(const void *buffer,int size);

EMSCRIPTEN_KEEPALIVE
void web_set_replica(int enabled) {
  if(web_replica && !enabled && game->pauseflag==PAUSE_GAME_SUSPENDED)game->pauseflag=PAUSE_GAME_RUNNING;
  web_replica=enabled?1:0;
  game2->time.offset=SystemGetElapsedTime()-game2->time.current;
}

/* Replicas render native geometry and local cameras. The elected authority
   alone resolves collisions/AI; interpolation is bounded to 200ms of travel. */
int web_replica_idle(void) {
  int i;
  if(!web_replica)return 0;
  if(game2->time.dt>0 && game2->time.dt<200 && game->pauseflag==PAUSE_GAME_RUNNING) {
    for(i=0;i<game->players;i++) {
      Data *d=game->player[i].data;
      if(d->speed>0 && game2->time.current-web_snapshot_time<200) {
        float fs=1.0f-SPEED_OZ_FACTOR+SPEED_OZ_FACTOR*cosf(i*PI/4.0f+(game2->time.current%SPEED_OZ_FREQ)*2.0f*PI/SPEED_OZ_FREQ);
        float distance=game2->time.dt/100.0f*d->speed*fs;
        d->trails[d->trailOffset].vDirection.v[0]+=distance*dirsX[d->dir];
        d->trails[d->trailOffset].vDirection.v[1]+=distance*dirsY[d->dir];
      }
    }
  }
  /* Offset is reset on each checkpoint; its current time identifies freshness. */
  doCameraMovement();
  return 1;
}

EMSCRIPTEN_KEEPALIVE
int web_snapshot_save(void) {
  int i;unsigned char *cursor=web_checkpoint+sizeof(WebCheckpointHeader);
  WebCheckpointHeader header={0};
  if(!game||game->players<1||game->players>MAX_PLAYERS)return 0;
  header.magic=0x47545246;header.version=2;header.players=game->players;
  header.epoch=web_epoch;header.current=game2->time.current;
  header.pauseflag=game->pauseflag;header.winner=game->winner;header.running=game->running;
  memcpy(header.team_wins,game->team_wins,sizeof(header.team_wins));header.random=web_random_get();
  for(i=0;i<game->players;i++) {
    WebCheckpointPlayer record={0};Data *d=game->player[i].data;
    if(d->trailOffset<0||d->trailOffset>=MAX_TRAIL)return 0;
    record.data=*d;record.data.trails=NULL;record.ai=*game->player[i].ai;
    record.explosion=gPlayerVisuals[i].exp_radius;record.impact=gPlayerVisuals[i].impact_radius;
    memcpy(cursor,&record,sizeof(record));cursor+=sizeof(record);
    memcpy(cursor,d->trails,(d->trailOffset+1)*sizeof(segment2));cursor+=(d->trailOffset+1)*sizeof(segment2);
  }
  header.snake_bytes=web_snake_save(cursor);cursor+=header.snake_bytes;
  header.bytes=cursor-web_checkpoint;memcpy(web_checkpoint,&header,sizeof(header));
  web_publish_checkpoint(web_checkpoint,header.bytes);return header.bytes;
}

EMSCRIPTEN_KEEPALIVE
int web_snapshot_load(void) {
  int i,size=web_receive_checkpoint(web_checkpoint,sizeof(web_checkpoint));
  WebCheckpointHeader header;unsigned char *cursor=web_checkpoint+sizeof(header),*end=web_checkpoint+size;
  if(size<sizeof(header))return 0;memcpy(&header,web_checkpoint,sizeof(header));
  if(header.magic!=0x47545246||header.version!=2||header.bytes!=size||header.players!=game->players)return 0;
  /* Validate all record boundaries before mutating the live simulation. */
  for(i=0;i<header.players;i++) {
    WebCheckpointPlayer r;
    if(end-cursor<sizeof(r))return 0;memcpy(&r,cursor,sizeof(r));cursor+=sizeof(r);
    if(r.data.trailOffset<0||r.data.trailOffset>=MAX_TRAIL||r.data.dir<0||r.data.dir>3||!isfinite(r.data.speed))return 0;
    if(end-cursor<(r.data.trailOffset+1)*sizeof(segment2))return 0;
    cursor+=(r.data.trailOffset+1)*sizeof(segment2);
  }
  if(end-cursor!=header.snake_bytes||!web_snake_load(cursor,header.snake_bytes))return 0;
  cursor=web_checkpoint+sizeof(header);
  for(i=0;i<header.players;i++) {
    WebCheckpointPlayer r;Data *d=game->player[i].data;segment2 *trails=d->trails;
    memcpy(&r,cursor,sizeof(r));cursor+=sizeof(r);*d=r.data;d->trails=trails;
    memcpy(trails,cursor,(d->trailOffset+1)*sizeof(segment2));cursor+=(d->trailOffset+1)*sizeof(segment2);
    *game->player[i].ai=r.ai;gPlayerVisuals[i].exp_radius=r.explosion;gPlayerVisuals[i].impact_radius=r.impact;
    { char setting[32];sprintf(setting,"ai_player%d",i+1);setSettingi(setting,r.ai.active); }
    if(web_loaded_epoch!=header.epoch)initCamera(game->player[i].camera,d,gSettingsCache.camType);
  }
  game->pauseflag=header.pauseflag;game->winner=header.winner;game->running=header.running;
  memcpy(game->team_wins,header.team_wins,sizeof(header.team_wins));web_random_set(header.random);
  web_epoch=web_loaded_epoch=header.epoch;game2->time.current=header.current;game2->time.lastFrame=header.current;game2->time.dt=0;
  web_snapshot_time=header.current;
  game2->time.offset=SystemGetElapsedTime()-header.current;
  doCameraMovement();SystemPostRedisplay();return 1;
}

EMSCRIPTEN_KEEPALIVE
void web_drop_player(int slot) {
  GameEvent event={0};
  if(!game||slot<0||slot>=game->players||!PLAYER_IS_ACTIVE(game->player+slot))return;
  event.player=slot;event.killer=-1;event.cause=0;
  getPositionFromData(&event.x,&event.y,game->player[slot].data);
  doCrashPlayer(&event);
  { char setting[32];sprintf(setting,"ai_player%d",slot+1);setSettingi(setting,AI_NONE);game->player[slot].ai->active=AI_NONE; }
}

EM_JS(int, web_player_count, (), { return Module.webPlayerCount || 2; });
EM_JS(int, web_player_type, (int index), {
  return Module.webPlayerTypes && Module.webPlayerTypes[index] !== undefined
    ? Module.webPlayerTypes[index] : 2;
});
EM_JS(int, web_snake_mode, (), { return Module.webSnakeMode ? 1 : 0; });
EM_JS(int, web_team_mode, (), { return Module.webTeamMode ? 1 : 0; });
EM_JS(int, web_clear_trails, (), { return Module.webClearTrails === false ? 0 : 1; });
EM_JS(int, web_start_paused, (), { return Module.webStartPaused ? 1 : 0; });
EM_JS(int, web_grid_size, (), { return Module.webGridSize || 480; });
EM_JS(double, web_game_speed, (), { return Module.webGameSpeed || 8.5; });
EM_JS(int, web_ai_level, (), {
  return Module.webAiLevel === undefined ? 2 : Module.webAiLevel;
});
extern int web_trap_policy;
extern void web_traps_configure(void);
EM_JS(int, web_initial_trap_policy, (), { return Module.webTrapPolicy || 0; });
EM_JS(double, web_trap_bonus, (), { return Module.webTrapPoints === 0 ? 0 : 0.5; });
double web_trap_points=0.5;
EM_JS(int, web_initial_bot_level, (int player), {
  const level=Module.webBotLevels?.[player] ?? Module.webAiLevel ?? 2;
  return Number.isInteger(level) && level>=0 && level<=3 ? level : 2;
});
static int web_bot_levels[MAX_PLAYERS];
EMSCRIPTEN_KEEPALIVE
int web_bot_level(int player) {
  return player>=0 && player<MAX_PLAYERS ? web_bot_levels[player] : 2;
}
EM_JS(void, web_frame_ready, (), {
  if (Module.webFrameReady) Module.webFrameReady();
});

void web_start_browser_game(void) {
  int i;
  int player_count = web_player_count();
  web_replica=web_initial_replica();
  web_trap_points=web_trap_bonus();web_trap_policy=web_initial_trap_policy();web_traps_configure();
  if (player_count < 1) player_count = 1;
  if (player_count > MAX_PLAYERS) player_count = MAX_PLAYERS;
  for (i = 0; i < MAX_PLAYERS; ++i) {
    char setting[32];
    web_bot_levels[i]=web_initial_bot_level(i);
    sprintf(setting, "ai_player%d", i + 1);
    setSettingi(setting, i < player_count ? web_player_type(i) : AI_NONE);
  }
  setSettingi("grid_size", web_grid_size());
  setSettingf("speed", (float) web_game_speed());
  setSettingi("ai_level", web_ai_level());
  setSettingi("trail_kill_scoring", 1);
  setSettingi("snake_mode", web_snake_mode());
  setSettingi("team_mode", web_team_mode());
  setSettingi("erase_crashed", web_clear_trails());
  setSettingi("alpha_trails", 0);
  updateSettingsCache();
  game2->mode = GAME_SINGLE;
  initData();
  changeDisplay(-1);
  setCallback("game");
  if (web_start_paused()) game->pauseflag = PAUSE_GAME_SUSPENDED;
}

EMSCRIPTEN_KEEPALIVE
void web_set_camera_target(int viewer, int target) {
  extern int web_camera_targets[MAX_PLAYERS];
  if(viewer<0 || viewer>=MAX_PLAYERS || target<0 || target>=MAX_PLAYERS)return;
  web_camera_targets[viewer]=target;
}

int web_camera_targets[MAX_PLAYERS]={-1,-1,-1,-1,-1,-1};
int web_camera_target(int viewer) {
  int target=web_camera_targets[viewer];
  if(PLAYER_IS_ACTIVE(&game->player[viewer]) ||
     gPlayerVisuals[viewer].exp_radius < EXP_RADIUS_MAX ||
     target<0 || target>=game->players)return viewer;
  return target;
}

EMSCRIPTEN_KEEPALIVE
double web_crash_state(int player, int component) {
  if (!game || player < 0 || player >= game->players) return 0;
  if (component == 0) return gPlayerVisuals[player].exp_radius;
  if (component == 1) return gPlayerVisuals[player].impact_radius;
  if (component == 3) return game->player[player].data->trail_height;
  return web_camera_target(player);
}

EMSCRIPTEN_KEEPALIVE
double web_control_state(int player, int action) {
  if (!game || player < 0 || player >= game->players) return 0;
  if (action == 3) return game->player[player].data->boost_enabled;
  if (action == 4 || action == 5) return game->player[player].camera->movement[CAM_PHI_OFFSET];
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int web_player_direction(int player) {
  if (!game || player < 0 || player >= game->players) return -1;
  return game->player[player].data->dir;
}

EMSCRIPTEN_KEEPALIVE
double web_player_position(int player,int axis) {
  float x,y;if(!game||player<0||player>=game->players)return 0;
  getPositionFromData(&x,&y,game->player[player].data);return axis?y:x;
}

EMSCRIPTEN_KEEPALIVE
int web_view_rect(int player, int component) {
  Visual *d;
  if (!game || player < 0 || player >= game->players) return 0;
  d = &gPlayerVisuals[player].display;
  switch(component) {
  case 0: return d->vp_x;
  case 1: return d->vp_y;
  case 2: return d->vp_w;
  case 3: return d->vp_h;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
void web_resize_views(void) { if(game&&gScreen)changeDisplay(-1); }

EMSCRIPTEN_KEEPALIVE
void web_camera_adjust(int player, double delta_x, double delta_y) {
  Camera *camera;
  if (!game || player < 0 || player >= game->players) return;
  camera = game->player[player].camera;
  if (!camera) return;
  camera->movement[CAM_PHI] -= (float)delta_x * 0.004f;
  camera->movement[CAM_CHI] += (float)delta_y * 0.004f;
  if (camera->movement[CAM_CHI] < PI / 8.0f) camera->movement[CAM_CHI] = PI / 8.0f;
  if (camera->movement[CAM_CHI] > 3.0f * PI / 8.0f) camera->movement[CAM_CHI] = 3.0f * PI / 8.0f;
}

EMSCRIPTEN_KEEPALIVE
void web_remote_turn(int player, int direction) {
  if (!game || player < 0 || player >= game->players) return;
  if (!game->player[player].ai || game->player[player].ai->active != AI_HUMAN) return;
  if (direction < 0)
    createEvent(player, EVENT_TURN_LEFT);
  else
    createEvent(player, EVENT_TURN_RIGHT);
}

EMSCRIPTEN_KEEPALIVE
void web_remote_action(int player, int action, int pressed) {
  if (!game || player < 0 || player >= game->players) return;
  if (!game->player[player].ai || game->player[player].ai->active != AI_HUMAN) return;
  if (action == 1 && pressed) createEvent(player, EVENT_TURN_LEFT);
  else if (action == 2 && pressed) createEvent(player, EVENT_TURN_RIGHT);
  else if (action == 3) {
    if (pressed && game->player[player].data->booster > getSettingf("booster_min"))
      game->player[player].data->boost_enabled = 1;
    else if (!pressed)
      game->player[player].data->boost_enabled = 0;
  } else if (action == 4) {
    game->player[player].camera->movement[CAM_PHI_OFFSET] = pressed ? PI / 2.0f : 0;
  } else if (action == 5) {
    game->player[player].camera->movement[CAM_PHI_OFFSET] = pressed ? -PI / 2.0f : 0;
  }
}

EMSCRIPTEN_KEEPALIVE
double web_team_score(int team) {
  int i,traps=0,quarters=0;
  if(!game||team<0||team>=3)return 0;
  for(i=team*2;i<team*2+2&&i<game->players;i++){traps+=game->player[i].data->trail_kills;quarters+=game->player[i].data->trap_points_quarters;}
  return game->team_wins[team]+(web_trap_policy==2?quarters*0.25:web_trap_points*traps);
}

EMSCRIPTEN_KEEPALIVE
double web_player_score(int player) {
  if (!game || player < 0 || player >= game->players) return 0;
  return game->player[player].data->score+(web_trap_policy==2?0.25*game->player[player].data->trap_points_quarters:web_trap_points*game->player[player].data->trail_kills);
}

EMSCRIPTEN_KEEPALIVE
double web_player_trap_points(int player) {
  if(!game||player<0||player>=game->players)return 0;
  return web_trap_policy==2?0.25*game->player[player].data->trap_points_quarters:web_trap_points*game->player[player].data->trail_kills;
}
EMSCRIPTEN_KEEPALIVE
int web_player_survival(int player) { return game&&player>=0&&player<game->players ? game->player[player].data->score : 0; }
EMSCRIPTEN_KEEPALIVE
int web_player_traps(int player) { return game&&player>=0&&player<game->players ? game->player[player].data->trail_kills : 0; }
EMSCRIPTEN_KEEPALIVE
int web_team_wins(int team) { return game&&team>=0&&team<3 ? game->team_wins[team] : 0; }

EMSCRIPTEN_KEEPALIVE
int web_player_active(int player) {
  if (!game || player < 0 || player >= game->players) return 0;
  return PLAYER_IS_ACTIVE(&game->player[player]) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void web_prepare_game(int player_count, int snake_mode, int team_mode) {
  (void)player_count;
  (void)snake_mode;
  (void)team_mode;
}

EMSCRIPTEN_KEEPALIVE
void web_resume_game(void) {
  if (!game || !game2) return;
  game2->time.lastFrame = 0;
  game2->time.current = 0;
  game2->time.offset = SystemGetElapsedTime();
  game->pauseflag = PAUSE_GAME_RUNNING;
}

EMSCRIPTEN_KEEPALIVE
int web_round_finished(void) {
  return game && game->pauseflag == PAUSE_GAME_FINISHED;
}

EMSCRIPTEN_KEEPALIVE
int web_round_winner(void) {
  return game ? game->winner : -1;
}

EMSCRIPTEN_KEEPALIVE
int web_round_generation(void) { return web_epoch; }

EMSCRIPTEN_KEEPALIVE
void web_restart_round(void) {
  if (!game) return;
  web_epoch++;
  initData();
  setCallback("game");
}

EMSCRIPTEN_KEEPALIVE
void web_new_match(void) {
  int i;
  if (!game) return;
  web_epoch++;
  for (i=0;i<game->players;i++) {
    game->player[i].data->score=0;
    game->player[i].data->trail_kills=0;
    game->player[i].data->trap_points_quarters=0;
    web_camera_targets[i]=-1;
  }
  for (i=0;i<3;i++) game->team_wins[i]=0;
  initData();
  setCallback("game");
}

#endif
