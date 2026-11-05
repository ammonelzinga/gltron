$ErrorActionPreference='Stop'
$webRoot=Split-Path -Parent $PSScriptRoot
$gameRoot=Split-Path -Parent $webRoot
$compiler=Join-Path $gameRoot '.emsdk/upstream/emscripten/emcc.exe'
$output=Join-Path $webRoot 'test-results/native-trap-rules.cjs'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null
& $compiler (Join-Path $PSScriptRoot 'native-trap-rules.c') (Join-Path $gameRoot 'src/game/trap_rules.c') '-I' (Join-Path $gameRoot 'src/game') '-O2' '-sSINGLE_FILE=1' '-sENVIRONMENT=node' '-o' $output
if($LASTEXITCODE -ne 0){throw 'Native trap rule compilation failed.'}
& node $output
if($LASTEXITCODE -ne 0){throw 'Native trap rule checks failed.'}
