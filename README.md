# GLTron variants (Windows builds)

This repo contains several GLTron variants. To play the latest EPIC build on Windows, download the zip from GitHub Releases, unzip it, and run gltron.exe inside the folder.

## Download
- Go to the Releases page of this repository
- Download gltron-0.70EPIC.zip
- Unzip anywhere and run gltron.exe

## Developer notes
- Binaries (*.exe, archives) are not committed to the repo; they are attached to Releases.
- To package the EPIC build locally on Windows PowerShell:

```
Compress-Archive -LiteralPath "gltron-0.70EPIC" -DestinationPath "gltron-0.70EPIC.zip" -Force
```

Then upload gltron-0.70EPIC.zip as a Release asset.
