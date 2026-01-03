#include <stdlib.h>
#include <math.h>
#include <string.h>

#include "game/game.h"
#include "game/snake.h"
#include "video/video.h"
#include "base/nebu_random.h"

#define MAX_BUGS 32
#define BUG_RADIUS 3.0f
#define BUG_SPAWN_COOLDOWN_MS 1000
#define BUG_MAX_ACTIVE 8

typedef struct {
  float x, y;
  int active;
} SnakeBug;

static SnakeBug g_bugs[MAX_BUGS];
static int g_spawnCooldown = 0;

/* forward declarations for static helpers used before definition */
static int count_active_bugs(void);
static void spawn_bug(void);

static float frand01(void) {
  return (float)tfrand();
}

void snake_onRoundStart(void) {
  int i;
  for (i = 0; i < MAX_BUGS; i++) g_bugs[i].active = 0;
  g_spawnCooldown = BUG_SPAWN_COOLDOWN_MS; /* delay initial spawn a bit */
  /* spawn a few initial bugs to guarantee visibility */
  for (i = 0; i < 3 && count_active_bugs() < BUG_MAX_ACTIVE; i++) {
    spawn_bug();
  }
}

static int count_active_bugs(void) {
  int c = 0, i;
  for (i = 0; i < MAX_BUGS; i++) if (g_bugs[i].active) c++;
  return c;
}

static int find_free_bug(void) {
  int i;
  for (i = 0; i < MAX_BUGS; i++) if (!g_bugs[i].active) return i;
  return -1;
}

static int position_is_safe(float x, float y) {
  /* avoid spawning immediately under a player's head to prevent auto-award */
  int i;
  for (i = 0; i < game->players; i++) {
    if (!PLAYER_IS_ACTIVE(game->player + i)) continue;
    float hx, hy;
    getPositionFromIndex(&hx, &hy, i);
    float dx = hx - x, dy = hy - y;
    if (dx*dx + dy*dy < (BUG_RADIUS + 3.0f)*(BUG_RADIUS + 3.0f)) return 0;
  }
  return 1;
}

static void spawn_bug(void) {
  int slot = find_free_bug();
  if (slot < 0) return;
  /* spawn somewhere inside the arena bounds */
  float border = 2.0f;
  float g = (float)game2->rules.grid_size;
  int tries = 20;
  while (tries-- > 0) {
    float x = border + frand01() * (g - 2*border);
    float y = border + frand01() * (g - 2*border);
    if (position_is_safe(x, y)) {
      g_bugs[slot].x = x;
      g_bugs[slot].y = y;
      g_bugs[slot].active = 1;
      break;
    }
  }
}

void snake_update(int dt) {
  if (!gSettingsCache.snake_mode) return;
  g_spawnCooldown -= dt;
  if (g_spawnCooldown <= 0) {
    g_spawnCooldown = BUG_SPAWN_COOLDOWN_MS;
    if (count_active_bugs() < BUG_MAX_ACTIVE) spawn_bug();
  }
}

static int movement_hits_bug(const segment2* m, const SnakeBug* b) {
  float x0 = m->vStart.v[0], y0 = m->vStart.v[1];
  float dx = m->vDirection.v[0], dy = m->vDirection.v[1];
  float x1 = x0 + dx, y1 = y0 + dy;
  float r = BUG_RADIUS;
  if (fabsf(dy) < 1e-6f) {
    /* horizontal move */
    if (fabsf(b->y - y0) > r) return 0;
    float minx = dx > 0 ? x0 : x1;
    float maxx = dx > 0 ? x1 : x0;
    return (b->x >= minx - r && b->x <= maxx + r);
  } else if (fabsf(dx) < 1e-6f) {
    /* vertical move */
    if (fabsf(b->x - x0) > r) return 0;
    float miny = dy > 0 ? y0 : y1;
    float maxy = dy > 0 ? y1 : y0;
    return (b->y >= miny - r && b->y <= maxy + r);
  }
  /* should not happen: movement is axis aligned */
  return 0;
}

void snake_onPlayerMove(int player, const segment2* movement) {
  int i;
  if (!gSettingsCache.snake_mode) return;
  if (!PLAYER_IS_ACTIVE(game->player + player)) return;
  for (i = 0; i < MAX_BUGS; i++) {
    if (!g_bugs[i].active) continue;
    if (movement_hits_bug(movement, &g_bugs[i])) {
      /* grow snake length and consume bug */
      game->player[player].data->snake_max_length += gSettingsCache.snake_growth;
      game->player[player].data->snake_bugs_eaten += 1;
      g_bugs[i].active = 0;
      break;
    }
  }
}

static float seg_length(const segment2* s) {
  return sqrtf(s->vDirection.v[0]*s->vDirection.v[0] + s->vDirection.v[1]*s->vDirection.v[1]);
}

void snake_enforceLength(int player) {
  Data* d = game->player[player].data;
  if (!gSettingsCache.snake_mode) return;
  if (!PLAYER_IS_ACTIVE(game->player + player)) return;
  if (d->snake_max_length <= 0.0f) return;
  /* compute total length */
  float total = 0.0f;
  int i;
  for (i = 0; i <= d->trailOffset; i++) {
    total += seg_length(d->trails + i);
  }
  if (total <= d->snake_max_length) return;
  float excess = total - d->snake_max_length;
  /* trim from the head of the array (oldest segments) */
  while (excess > 0.0f && d->trailOffset >= 0) {
    segment2* first = d->trails;
    float flen = seg_length(first);
    if (excess >= flen - 1e-6f) {
      /* drop first segment entirely by shifting left */
      int count = d->trailOffset; /* number of segments to move */
      if (count > 0) memmove(d->trails, d->trails + 1, count * sizeof(segment2));
      d->trailOffset -= 1;
      excess -= flen;
    } else {
      /* shorten the first segment by moving its start forward */
      if (fabsf(first->vDirection.v[0]) > fabsf(first->vDirection.v[1])) {
        float sgn = (first->vDirection.v[0] >= 0) ? 1.0f : -1.0f;
        first->vStart.v[0] += sgn * excess;
        first->vDirection.v[0] -= sgn * excess;
      } else {
        float sgn = (first->vDirection.v[1] >= 0) ? 1.0f : -1.0f;
        first->vStart.v[1] += sgn * excess;
        first->vDirection.v[1] -= sgn * excess;
      }
      excess = 0.0f;
    }
  }
}

void snake_drawBugs(void) {
  int i;
  if (!gSettingsCache.snake_mode) return;
  glDisable(GL_LIGHTING);
  glEnable(GL_BLEND);
  glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  glColor4f(0.2f, 1.0f, 0.2f, 0.9f);
  for (i = 0; i < MAX_BUGS; i++) {
    if (!g_bugs[i].active) continue;
    float x = g_bugs[i].x, y = g_bugs[i].y;
    float r = BUG_RADIUS;
    glBegin(GL_QUADS);
      glVertex3f(x - r, y - r, 0.01f);
      glVertex3f(x + r, y - r, 0.01f);
      glVertex3f(x + r, y + r, 0.01f);
      glVertex3f(x - r, y + r, 0.01f);
    glEnd();
  }
  glDisable(GL_BLEND);
}

int snake_getActiveBugCount(void) {
  return count_active_bugs();
}
