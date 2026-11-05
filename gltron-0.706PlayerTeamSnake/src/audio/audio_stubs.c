/* Audio stub implementations for disabled sound support */

void Sound_initTracks(void) {}
void Sound_setup(void) {}
void Sound_setMusicVolume(float vol) {}
void Sound_setFxVolume(float vol) {}
void Sound_reloadTrack(void) {}
void Audio_CrashPlayer(int player) { (void)player; }
void Audio_StopEngine(int player) { (void)player; }
void Audio_EnableEngine(void) {}
void Sound_idle(void) {}
void Audio_DisableEngine(void) {}
