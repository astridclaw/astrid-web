# iOS Repository Separation

**Date:** January 2026

## Summary

The Astrid iOS app has been moved from this repository to a dedicated repository.

## Repository Locations

- **Web:** https://github.com/Graceful-Tools/astrid-web (this repo)
- **iOS:** https://github.com/Graceful-Tools/astrid-ios

## What Moved

- All Swift source code (previously in `ios-app/`)
- iOS Xcode project files
- iOS-specific tests
- iOS documentation (previously in `docs/ios/`)

## What Remains

- Web API endpoints consumed by iOS (`/api/auth/mobile-*`, `/api/v1/*`)
- API contract documentation
- Historical iOS implementation notes (in `docs/archive/ios/`)

## Working Across Repos

See parent workspace CLAUDE.md at `../CLAUDE.md` for cross-repo workflow:

1. Make web API changes first in `astrid-web`
2. Deploy web changes to production
3. Update iOS app in `astrid-ios` to use updated API
4. Push iOS changes to trigger Xcode Cloud build

## Files Removed

- `ios-app/` directory (moved to astrid-ios)
- `docs/ios/` directory (moved to astrid-ios)
- `.github/workflows/ios-ci.yml` (handled by Xcode Cloud in iOS repo)
- `scripts/prepare-ios-release.ts` (moved to astrid-ios)
- `npm run test:ios` and `npm run test:ios:unit` scripts

## Configuration Updates

- `.astrid.config.json` - Removed iOS platform configuration
- `package.json` - Removed iOS test scripts
- `ASTRID.md`, `CLAUDE.md`, `CODEX.md`, `GEMINI.md` - Updated to reference separate iOS repo
