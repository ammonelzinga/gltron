#ifdef __EMSCRIPTEN__

#include <emscripten.h>
#include <stdio.h>

#include "game/gltron.h"
#include "base/switchCallbacks.h"

EM_JS(int, web_player_count, (), { return Module.webPlayerCount || 2; });
EM_JS(int, web_snake_mode, (), { return Module.webSnakeMode ? 1 : 0; });
EM_JS(int, web_team_mode, (), { return Module.webTeamMode ? 1 : 0; });
EM_JS(int, web_start_paused, (), { return Module.webStartPaused ? 1 : 0; });

void web_start_browser_game(void) {
  int i;
  int player_count = web_player_count();
  if (player_count < 1) player_count = 1;
  if (player_count > MAX_PLAYERS) player_count = MAX_PLAYERS;
  for (i = 0; i < MAX_PLAYERS; ++i) {
    char setting[32];
    sprintf(setting, "ai_player%d", i + 1);
    setSettingi(setting, i < player_count ? AI_HUMAN : AI_NONE);
  }
  setSettingi("snake_mode", web_snake_mode());
  setSettingi("team_mode", web_team_mode());
  updateSettingsCache();
  game2->mode = GAME_SINGLE;
  initData();
  changeDisplay(-1);
  setCallback("game");
  if (web_start_paused()) game->pauseflag = PAUSE_GAME_SUSPENDED;
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
void web_restart_round(void) {
  if (!game) return;
  initData();
  setCallback("game");
}

#endif
