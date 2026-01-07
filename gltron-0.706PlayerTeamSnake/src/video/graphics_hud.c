#include "video/video.h"
#include "game/game.h"

void drawAI(Visual *d) {
  char ai[] = "computer player";

  rasonly(d);
  glColor3f(1.0, 1.0, 1.0);
  drawText(gameFtx, d->vp_w / 4, 10, d->vp_w / (2 * strlen(ai)), ai);
  /* glRasterPos2i(100, 0); */
}

void drawPause(Visual *display) {
  char pause[] = "Game is paused";
  char winner[] = "Player %d wins!";
  char nowinner[] = "No one wins!";
  char buf[100];
  char *message;
  static float d = 0;
  static float lt = 0;
  float delta;
  int now;

  now = SystemGetElapsedTime();
  delta = now - lt;
  lt = now;
  delta /= 500.0;
  d += delta;
  /* printf("%.5f\n", delta); */
  
  if (d > 2 * PI) { 
    d -= 2 * PI;
  }

  if ((game->pauseflag & PAUSE_GAME_FINISHED) && game->winner != -1) {
    if (game->winner >= -1) {

      float* player_color = gPlayerVisuals[game->winner].pColorAlpha;

      /* 
         make the 'Player wins' message oscillate between 
         white and the winning bike's color 
       */
      glColor3f((player_color[0] + ((sinf(d) + 1) / 2) * (1 - player_color[0])),
                (player_color[1] + ((sinf(d) + 1) / 2) * (1 - player_color[1])),
                (player_color[2] + ((sinf(d) + 1) / 2) * (1 - player_color[2]))); 

      message = buf;
      sprintf(message, winner, game->winner + 1);
    } else {
      glColor3d(1.0, (sin(d) + 1) / 2, (sin(d) + 1) / 2);
      message = nowinner;
    }
  } else {
    glColor3d(1.0, (sin(d) + 1) / 2, (sin(d) + 1) / 2);
    message = pause;
  }

  rasonly(gScreen);
  drawText(gameFtx, display->vp_w / 6, 20, 
	   display->vp_w / (6.0f / 4.0f * strlen(message)), message);
}

void drawScore(Player *p, Visual *d) {
  char tmp[64];
  int surv = p->data->score;
  int kills = p->data->trail_kills;
  int total = surv + kills;
  /* Show just numbers: total, survival, trail kills */
  sprintf(tmp, "%d  %d  %d", total, surv, kills);
  rasonly(d);
  glColor4f(1.0, 1.0, 0.2f, 1.0);
  if (gViewportType == VP_SIXWAY) {
    /* center the counters at bottom for six-way view and use smaller size */
    int size = 18;
    int len = (int)strlen(tmp);
    float approxCharW = 0.6f * size; /* rough width estimate per char */
    int x = (int)((d->vp_w - (len * approxCharW)) / 2);
    int y = 5;
    drawText(gameFtx, x, y, size, tmp);
  } else {
    drawText(gameFtx, 5, 5, 36, tmp);
  }
}

void drawAcceleratorStatus(Player *p, Visual *d) {
  if (!gSettingsCache.show_accel_status) return;
  char buf[64];
  const float booster = p->data->booster;
  const int enabled = p->data->boost_enabled;
  /* Determine status: USING, READY, DISABLED */
  int size = 24;
  if (enabled) {
    strcpy(buf, "using");
    glColor4f(1.0f, 0.8f, 0.2f, 1.0f);
  } else if (booster >= gSettingsCache.booster_max) {
    strcpy(buf, "ready");
    glColor4f(0.2f, 1.0f, 0.2f, 1.0f);
  } else {
    strcpy(buf, "disabled");
    glColor4f(0.8f, 0.2f, 0.2f, 1.0f);
  }
  rasonly(d);
  /* Place near bottom-left, below score */
  drawText(gameFtx, 5, 40, size, buf);
}

void drawSnakeStatus(Player *p, Visual *d) {
  if (!gSettingsCache.snake_mode) return;
  char buf[64];
  int size = 20;
  float len = p->data->snake_max_length;
  int bugs = p->data->snake_bugs_eaten;
  {
    extern int snake_getActiveBugCount(void);
    int avail = snake_getActiveBugCount();
    sprintf(buf, "LEN: %d  BUGS: %d  AVAIL: %d", (int)len, bugs, avail);
  }
  rasonly(d);
  glColor4f(0.2f, 1.0f, 0.2f, 1.0f);
  /* Place below accelerator status */
  drawText(gameFtx, 5, 65, size, buf);
}

void drawTeamWins(Player *p, Visual *d) {
  if (!gSettingsCache.team_mode) return;
  /* compute player index to map to team */
  int idx = (int)(p - game->player);
  int team = (idx < 2) ? 0 : (idx < 4) ? 1 : 2;
  int wins = game->team_wins[team];
  char buf[48];
  int size = 16; /* smaller, simplified label */
  sprintf(buf, "Team %d", wins);
  rasonly(d);
  /* tint by player's trail color for consistency */
  float* c = gPlayerVisuals[idx].pColorAlpha;
  glColor4f(c[0], c[1], c[2], 1.0f);
  /* Place below snake status if shown; otherwise below accelerator */
  int y = gSettingsCache.snake_mode ? 90 : 65;
  drawText(gameFtx, 5, y, size, buf);
}

  
void drawFPS(Visual *d) {
#define FPS_HSIZE 20
  /* draws FPS in upper left corner of Display d */
  static int fps_h[FPS_HSIZE];
  static int pos = -FPS_HSIZE;
  static int fps_min = 0;
  static int fps_avg = 0;

  char tmp[20];
  int diff;

  rasonly(d);
  diff = (game2->time.dt > 0) ? game2->time.dt : 1;

  if(pos < 0) {
    fps_avg = 1000 / diff;
    fps_min = 1000 / diff;
    fps_h[pos + FPS_HSIZE] = 1000 / diff;
    pos++;
  } else {
    fps_h[pos] = 1000 / diff;
    pos = (pos + 1) % FPS_HSIZE;
    if(pos % 10 == 0) {
      int i;
      int sum = 0;
      int min = 1000;
      for(i = 0; i < FPS_HSIZE; i++) {
	sum += fps_h[i];
	if(fps_h[i] < min)
	  min = fps_h[i];
      }
      fps_min = min;
      fps_avg = sum / FPS_HSIZE;
    }
  }

  sprintf(tmp, "average FPS: %d", fps_avg);
  glColor4f(1.0, 0.4f, 0.2f, 1.0);
  drawText(gameFtx, d->vp_w - 180, d->vp_h - 20, 10, tmp);
  sprintf(tmp, "minimum FPS: %d", fps_min);
  drawText(gameFtx, d->vp_w - 180, d->vp_h - 35, 10, tmp);
  sprintf(tmp, "triangles: %d", polycount);
  drawText(gameFtx, d->vp_w - 180, d->vp_h - 50, 10, tmp);
}


void drawConsoleLines(char *line, int call) {
#define CONSOLE_SIZE 15
#define CONSOLE_X_OFF 20
  int size = CONSOLE_SIZE;
  int length;
  /* fprintf(stdout, "%s\n", line); */
  length = strlen(line);
  while(length * size > gScreen->vp_w / 2 - CONSOLE_X_OFF)
    size--;
    
  if(*line != 0) 
    drawText(gameFtx, CONSOLE_X_OFF, gScreen->vp_h - 20 * (call + 1),
	     size, line);
}

void drawConsole(Visual *d) {
  int lines;
  rasonly(d);
  glColor3f(1.0, 0.3f, 0.3f);
  
  if (gSettingsCache.softwareRendering) { 
    lines = 1;
  } else if (gScreen->vp_h < 600) {
    lines = 3;
  } else {
    lines = 5;
  }
  
  consoleDisplay(drawConsoleLines, lines);
}
