#ifndef GAME_SNAKE_H
#define GAME_SNAKE_H

#include "Nebu_base.h"
#include "game/game_data.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Called when a round starts (after players reset) */
void snake_onRoundStart(void);
/* Called each physics step to spawn/update state */
void snake_update(int dt);
/* Called from doMovement with the player's movement segment */
void snake_onPlayerMove(int player, const segment2* movement);
/* Enforce per-player maximum trail length by trimming from the tail */
void snake_enforceLength(int player);
/* Draw active bug pickups */
void snake_drawBugs(void);
/* Query number of currently active bug pickups */
int snake_getActiveBugCount(void);

#ifdef __cplusplus
}
#endif

#endif
