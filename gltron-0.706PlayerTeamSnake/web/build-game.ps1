$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$emcc = Join-Path $projectRoot '.emsdk/upstream/emscripten/emcc.exe'
if (-not (Test-Path $emcc)) {
  throw 'Emscripten is missing. Run .emsdk/emsdk.bat install latest first.'
}

$sources = @(
  'src/gltron.c',
  'lua/src/lapi.c','lua/src/lcode.c','lua/src/ldebug.c','lua/src/ldo.c',
  'lua/src/lfunc.c','lua/src/lgc.c','lua/src/llex.c','lua/src/lmem.c',
  'lua/src/lobject.c','lua/src/lparser.c','lua/src/lstate.c','lua/src/lstring.c',
  'lua/src/ltable.c','lua/src/ltests.c','lua/src/ltm.c','lua/src/lundump.c',
  'lua/src/lvm.c','lua/src/lzio.c','lua/src/lib/lauxlib.c',
  'lua/src/lib/lbaselib.c','lua/src/lib/ldblib.c','lua/src/lib/liolib.c',
  'lua/src/lib/lmathlib.c','lua/src/lib/lstrlib.c'
)

$sourceDirectories = @(
  'nebu/base','nebu/filesystem','nebu/input','nebu/scripting','nebu/video',
  'src/base','src/configuration','src/filesystem','src/game','src/input',
  'src/video'
)
foreach ($directory in $sourceDirectories) {
  $sources += Get-ChildItem (Join-Path $projectRoot $directory) -Filter '*.c' |
    Where-Object { $_.Name -ne 'findpath_win.c' } |
    ForEach-Object { $_.FullName.Substring($projectRoot.Length + 1).Replace('\\', '/') }
}
$sources += 'src/audio/audio_stubs.c'

$outputDirectory = Join-Path $PSScriptRoot 'public/game'
New-Item -ItemType Directory -Force $outputDirectory | Out-Null

$compilerArguments = @(
  '-std=gnu99','-O2','-I','lua/include','-I','nebu/include','-I','src/include',
  '-DLOCAL_DATA','-DSEPARATOR=47','-DGLTRON_VERSION=\"0.70-web\"',
  '-sUSE_SDL=1','-sUSE_ZLIB=1','-sUSE_LIBPNG=1',
  '-sLEGACY_GL_EMULATION','-sGL_FFP_ONLY','-sALLOW_MEMORY_GROWTH=1',
  '-sEXIT_RUNTIME=0','-sFORCE_FILESYSTEM=1','-sMODULARIZE=1','-sEXPORT_ES6=1',
  '-sEXPORT_NAME=createGLTronModule','-sEXPORTED_FUNCTIONS=_main,_web_set_replica,_web_snapshot_save,_web_snapshot_load,_web_drop_player,_web_new_match,_web_crash_state,_web_tick,_web_use_worker_clock,_web_set_camera_target,_web_control_state,_web_view_rect,_web_resize_views,_web_player_direction,_web_player_position,_web_remote_turn,_web_remote_action,_web_camera_adjust,_web_team_score,_web_bot_level,_web_player_score,_web_player_survival,_web_player_traps,_web_player_trap_points,_web_team_wins,_web_player_active,_web_prepare_game,_web_resume_game,_web_round_finished,_web_round_winner,_web_round_generation,_web_restart_round',
  '-sEXPORTED_RUNTIME_METHODS=ccall',
  '--preload-file','art@/art','--preload-file','data@/data',
  '--preload-file','music@/music','--preload-file','scripts@/scripts',
  '--preload-file','gltron.ini@/home/web_user/.gltronrc',
  '-o','web/public/game/gltron.mjs'
)

Push-Location $projectRoot
try {
  & $emcc @sources @compilerArguments
  if ($LASTEXITCODE -ne 0) { throw "Emscripten failed with exit code $LASTEXITCODE" }
  $hashParts=@('gltron.wasm','gltron.mjs','gltron.data') | ForEach-Object { (Get-FileHash -LiteralPath (Join-Path $outputDirectory $_) -Algorithm SHA256).Hash }
  $sha=[System.Security.Cryptography.SHA256]::Create()
  $engineHash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($hashParts -join ''))))).Replace('-','').ToLowerInvariant()
  $sha.Dispose()
  @{ version=$engineHash; protocol=2 } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputDirectory 'build.json') -Encoding utf8
} finally {
  Pop-Location
}

Write-Host "GLTron web build created at $outputDirectory"
