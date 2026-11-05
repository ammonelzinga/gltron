#ifndef GLTROF_TRAP_RULES_H
#define GLTROF_TRAP_RULES_H
/* Pure, allocation-free geometry/scoring. Speeds are world units per second. */
typedef struct { float side_min,side_max,forward_min,forward_max; } TrapBody;
typedef struct { float x,y,speed; int dir,active; } TrapRider;
typedef struct { int player,quarters; } TrapAward;
int trap_body_contains(const TrapBody*,const TrapRider*,float,float);
int trap_sweep_body(const TrapBody*,const TrapRider*,float,float,float,float,float,float,float*);
TrapAward trap_choose_award(const TrapBody*,const TrapRider*,int,int,int,int,int,float,float);
#endif
