param([string]$SourceRevision='HEAD')
$ErrorActionPreference='Stop'
$webRoot=$PSScriptRoot
$gameRoot=Split-Path -Parent $webRoot
$repoRoot=Split-Path -Parent $gameRoot
$revision=(& git -c "safe.directory=$repoRoot" rev-parse --verify "$SourceRevision^{commit}").Trim()
if($LASTEXITCODE -ne 0){throw 'Commit the source before packaging.'}
Push-Location $webRoot
try {
  # Public web identifiers belong to this deployment, not the reusable source.
  & node --input-type=module -e "import {loadEnv} from 'vite';const e={...loadEnv('production',process.cwd()),...process.env};for(const k of ['API_KEY','AUTH_DOMAIN','DATABASE_URL','PROJECT_ID','APP_ID'])if(!e['VITE_FIREBASE_'+k])throw Error('Set VITE_FIREBASE_'+k+' before packaging online play.');if(e.VITE_FIREBASE_PROJECT_ID.startsWith('demo-'))throw Error('Emulator projects cannot be published.');"
  if($LASTEXITCODE -ne 0){throw 'Production Firebase configuration is incomplete.'}
  if(-not(Test-Path -LiteralPath (Join-Path $webRoot 'public/game/build.json'))){throw 'Run build-game.ps1 first.'}
  & npm run build:site
  if($LASTEXITCODE -ne 0){throw 'Website build failed.'}
  $package=Join-Path $webRoot "site-package/$revision"
  $bundle=Join-Path $package 'bundle'
  $vendor=Join-Path $bundle 'vendor/gltrof'
  $assets=Join-Path $bundle 'assets'
  New-Item -ItemType Directory -Force -Path $vendor,$assets | Out-Null
  Copy-Item -Path (Join-Path $webRoot 'dist-digitalhive/*') -Destination $vendor -Recurse -Force
  $index=Join-Path $vendor 'index.html'
  $page=Get-Content -LiteralPath $index -Raw
  # The marker prevents older site wrappers from adding their obsolete offline
  # preview banner; this bundle supplies the current navigation and source links.
  $bar='<body data-gltrof-online="true"><aside style="background:#0b1b24;color:#c0d8dd;padding:10px 20px;font:12px system-ui;display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between"><a href="/digitalhive/" style="color:#7ceef0">Digital Hive</a><span>Online play · Google sign-in for ranked</span><span><a href="/assets/gltrof-source.zip" style="color:#8aaeb9">Game source</a> · <a href="/assets/GLTROF-COPYING.txt" style="color:#8aaeb9">GPL license</a></span></aside>'
  if(-not $page.Contains('<body>')){throw 'Unexpected game page format.'}
  [IO.File]::WriteAllText($index,$page.Replace('<body>',$bar))
  & git -c "safe.directory=$repoRoot" archive --format=zip "--output=$(Join-Path $assets 'gltrof-source.zip')" $revision -- gltron-0.706PlayerTeamSnake
  if($LASTEXITCODE -ne 0){throw 'Could not package corresponding source.'}
  Copy-Item -LiteralPath (Join-Path $gameRoot 'COPYING') -Destination (Join-Path $assets 'GLTROF-COPYING.txt') -Force
  $provenance="glTrof source: https://github.com/ammonelzinga/gltron`nCommit: $revision`nGame path: /digitalhive/gltrof/`nFirebase web identifiers are embedded in this deployment. Configure your own project when rebuilding.`n"
  [IO.File]::WriteAllText((Join-Path $vendor 'UPSTREAM-README.txt'),$provenance)
  [IO.File]::WriteAllText((Join-Path $bundle 'GLTROF-INTEGRATION.md'),"# glTrof site update`n`nCopy vendor/gltrof/ into the website's vendor/gltrof/ folder. Copy assets/gltrof-source.zip and assets/GLTROF-COPYING.txt into the website's assets/ folder. Run the website's normal build and deploy it. The game is already configured for /digitalhive/gltrof/ and online Firebase play. No Firebase configuration is needed in the website itself. The bundle supplies its own online banner and license/source links, replacing older offline preview wording.`n`nSource commit: $revision`n")
  $manifest=@{sourceCommit=$revision;basePath='/digitalhive/gltrof/';engine=(Get-Content (Join-Path $vendor 'game/build.json') -Raw|ConvertFrom-Json).version}
  $manifest|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $vendor 'game/deployment.json') -Encoding utf8
  $archive=Join-Path $webRoot 'site-package/gltrof-digitalhive.zip'
  Compress-Archive -Path (Join-Path $bundle '*') -DestinationPath $archive -Force
  Write-Host "Website bundle: $archive"
  Write-Host "Source commit: $revision"
} finally {Pop-Location}
