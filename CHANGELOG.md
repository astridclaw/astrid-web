# Changelog

All notable changes to Astrid will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Centralized logging utility using pino for structured logging
- Admin authentication protection for debug pages

### Changed
- Refactored cached data hooks to use factory pattern, reducing code duplication
- Extracted shared date comparison utilities for better maintainability
- Sanitized documentation for open source release

### Removed
- Disabled iOS test files that were wrapped in `#if false`
- Internal email references and test credentials from documentation
- Dead code and unused backwards-compatibility exports

## [1.2.0] - 2024-12

### Added
- Apple Reminders sync (two-way synchronization)
- Background timer support for iOS
- DAU/WAU/MAU analytics dashboard with platform breakdown
- App Store download button on sign-in page
- Localization for Apple Reminders and Debug Settings UI
- Missing translations for all supported languages

### Fixed
- iOS: Prevent user data leakage on sign-out
- iOS: Timer countdown continues in background
- iOS: Swift 6 concurrency warnings in TimerBackgroundManager
- iOS: Index out of range crash in QuickLook
- API: Add timerDuration and lastTimerValue to v1 API
- Web: Persist timer duration when user edits it

### Changed
- iOS version bumped to 1.2.0
- Renamed "AI Assistant" settings to "Exploratory Features"
- Analytics: Replace platform pie chart with trend lines
- Legal pages: Simplified privacy policy and terms pages

## [1.1.0] - 2024-11

### Added
- iOS app with SwiftUI
- Real-time sync via Server-Sent Events
- Core Data persistence for offline support
- Task timer functionality
- File attachments with QuickLook preview
- Public lists system with copy functionality

### Fixed
- PDF thumbnail generation after QuickLook markup edit
- White background for QuickLook to prevent flicker

## [1.0.0] - 2024-10

### Added
- Initial release
- Next.js 15 web application
- Task management with lists
- User authentication (Google OAuth + credentials)
- Task sharing and collaboration
- Reminder system with push notifications
- AI coding agent integration
- MCP (Model Context Protocol) support
