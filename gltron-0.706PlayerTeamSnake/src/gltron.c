/*
  gltron
  Copyright (C) 1999 by Andreas Umbach <marvin@dataway.ch>
*/
#include "SDL.h"

#include "game/init.h"
#include "filesystem/path.h"
#include "base/util.h"
#include "base/nebu_system.h"
#include "SDL.h"

int main(int argc, char *argv[] ) {
	initSubsystems(argc, argv);
#ifdef __EMSCRIPTEN__
  extern void web_start_browser_game(void);
  web_start_browser_game();
  SystemMainLoop();
#else
	runScript(PATH_SCRIPTS, "main.lua");
#endif
  return 0;
}







