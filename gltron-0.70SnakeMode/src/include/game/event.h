#ifndef EVENT_H
#define EVENT_H

typedef enum {
  EVENT_TURN_LEFT = 1,
  EVENT_TURN_RIGHT = 2,
  EVENT_CRASH = 4,
  EVENT_STOP = 8
} event_type_e;

#define CRASH_CAUSE_TRAIL 1
#define CRASH_CAUSE_WALL  2

typedef struct GameEvent {
  int type; /* what */
  int player; /* who */
  int killer; /* opponent responsible, -1 if none */
  int cause; /* 1=trail, 2=wall */
  float x; /* where */
  float y;
  unsigned int timestamp;
} GameEvent;

extern void createEvent(int player, event_type_e eventType);
extern void createCrashEvent(int player, int killer, int cause);
extern int processEvent(GameEvent *e);

#endif /* EVENT_H */
