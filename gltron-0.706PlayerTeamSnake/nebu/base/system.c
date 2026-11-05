#include "base/nebu_system.h"

#include "SDL.h"
#include <stdio.h>

Callbacks *current = 0;
static int return_code = -1;
static int redisplay = 0;

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

static void WebMainLoopIteration(void) {
  SDL_Event event;
  while(SDL_PollEvent(&event) && current) {
    switch(event.type) {
    case SDL_KEYDOWN:
    case SDL_KEYUP:
    case SDL_JOYAXISMOTION:
    case SDL_JOYBUTTONDOWN:
    case SDL_JOYBUTTONUP:
    case SDL_MOUSEBUTTONUP:
    case SDL_MOUSEBUTTONDOWN:
    case SDL_MOUSEMOTION:
      /* Browser controls are routed exclusively through the web bridge.
         SDL's saved desktop bindings otherwise control unrelated riders. */
      break;
    case SDL_QUIT:
      SystemExit();
      break;
    default:
      break;
    }
  }
  if(!current) return;
  if(redisplay) {
    current->display();
    redisplay = 0;
  } else {
    current->idle();
  }
}

EMSCRIPTEN_KEEPALIVE
void web_tick(void) { WebMainLoopIteration(); }

EMSCRIPTEN_KEEPALIVE
void web_use_worker_clock(void) { emscripten_pause_main_loop(); }
#endif

void SystemExit() {
  fprintf(stderr, "[system] shutting down SDL now\n");
  SDL_Quit();
  fprintf(stderr, "[system] exiting application\n");
}

unsigned int SystemGetElapsedTime() {
  /* fprintf(stderr, "%d\n", SDL_GetTicks()); */
  return SDL_GetTicks();
}

int SystemMainLoop() {
  SDL_Event event;


#ifdef __EMSCRIPTEN__
	return_code = -1;
  emscripten_set_main_loop(WebMainLoopIteration, 0, 1);
  return return_code;
#else
	return_code = -1;
  while(return_code == -1) {
    while(SDL_PollEvent(&event) && current) {
			switch(event.type) {
			case SDL_KEYDOWN:
			case SDL_KEYUP:
			case SDL_JOYAXISMOTION:
			case SDL_JOYBUTTONDOWN:
			case SDL_JOYBUTTONUP:
			case SDL_MOUSEBUTTONUP:
			case SDL_MOUSEBUTTONDOWN:
			case SDL_MOUSEMOTION:
				SystemHandleInput(&event);
				break;
			case SDL_QUIT:
				SystemExit();
				break;
			default:
				/* ignore event */
				break;
      }
    }
    if(redisplay) {
      current->display();
      redisplay = 0;
    } else
      current->idle();
  }
	if(current->exit)
		(current->exit)();
	return return_code;
#endif
}
  
void SystemRegisterCallbacks(Callbacks *cb) {
  current = cb;
}

void SystemExitLoop(int value) {
	return_code = value;
}

void SystemPostRedisplay() {
  redisplay = 1;
}

