#ifndef GRAPHICS_HUD_H
#define GRAPHICS_HUD_H

#include "video.h"
#include "game/game.h"

extern void drawAI(Visual *d);
extern void drawPause(Visual *d);

extern void drawScore(Player *p, Visual *d);
extern void drawAcceleratorStatus(Player *p, Visual *d);
extern void drawSnakeStatus(Player *p, Visual *d);
extern void drawTeamWins(Player *p, Visual *d);
extern void drawFPS(Visual *d);

extern void drawConsoleLines(char *line, int call);
extern void drawConsole(Visual *d);

#endif
