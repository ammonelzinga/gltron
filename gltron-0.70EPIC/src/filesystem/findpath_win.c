#include <string.h>
#ifdef _WIN32
#include <windows.h>
#include <direct.h>
#endif

/* Windows-specific implementation or no-op for other platforms */
void goto_installpath(const char *executable) {
#ifdef _WIN32
    char path[MAX_PATH];
    if (GetModuleFileNameA(NULL, path, MAX_PATH)) {
        char *last_sep = strrchr(path, '\\');
        if (!last_sep) last_sep = strrchr(path, '/');
        if (last_sep) {
            *last_sep = '\0';
            _chdir(path);
        }
    }
#else
    (void)executable; /* no-op on non-Windows here */
#endif
}
