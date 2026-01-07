# GLTron variants (Windows builds)

This repo contains several GLTron variants. To play on Windows, download the latest zip from GitHub Releases, unzip it, and run gltron.exe inside the folder.

## Download
- Visit the Releases page of this repository and grab the newest zip (e.g., gltron-0.706PlayerTeamSnake-win64.zip).
- Unzip anywhere and run gltron.exe.

## Developer notes
- Binaries (*.exe, archives) are not committed to the repo; they are attached to Releases via CI.
- The Windows build is produced by GitHub Actions (MSYS2 + MinGW) and packaged with required data files.
- To package a folder locally on Windows PowerShell:

```
Compress-Archive -LiteralPath "gltron-0.706PlayerTeamSnake" -DestinationPath "gltron-0.706PlayerTeamSnake.zip" -Force
```

Then upload the zip as a Release asset if needed.
