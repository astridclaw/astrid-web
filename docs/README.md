# Astrid Documentation

This directory contains all technical documentation for the Astrid task management system.

## 📚 Documentation Index

### 🏗️ Core Architecture
- **[Architecture Overview](./ARCHITECTURE.md)** - System architecture and design patterns
- **[Authentication System](./AUTHENTICATION.md)** - Authentication implementation and security
- **[Offline Mode](./OFFLINE_MODE.md)** - Offline-first architecture with IndexedDB and background sync
- **[MVC Architecture](./MVC_ARCHITECTURE.md)** - Controller-Repository-Service pattern for AI webhooks
- **[AI Agent Architecture](./AI_AGENT_ARCHITECTURE.md)** - Command/Event pattern for AI agent operations
- **[Tools-Based AI Architecture](./TOOLS_BASED_AI_ARCHITECTURE.md)** - Direct tool access via MCP for AI agents

### 🚀 Setup & Deployment
- **[Auth Setup](./setup/AUTH_SETUP.md)** - Authentication configuration
- **[Database Setup](./setup/DATABASE_SETUP.md)** - Database configuration and migrations
- **[Email Setup](./setup/EMAIL_SETUP.md)** - Email service configuration and overview
- **[Cloudflare Email Setup](./setup/CLOUDFLARE_EMAIL_SETUP.md)** - Complete Cloudflare email routing setup
- **[Cloudflare Email Quickstart](./setup/CLOUDFLARE_EMAIL_QUICKSTART.md)** - Quick reference for Cloudflare email
- **[Cloudflare + Resend Status](./setup/CLOUDFLARE_RESEND_STATUS.md)** - Current email system status and SPF configuration
- **[Vercel Setup](./setup/VERCEL_SETUP.md)** - Deployment to Vercel
- **[Deployment Guide](./setup/DEPLOYMENT_GUIDE.md)** - General deployment instructions

### 🤖 AI Agents & Automation
- **[CLAUDE.md](../CLAUDE.md)** - ⭐ **Essential**: Claude Code operational context (root)
- **[GPT-5-CODEX.md](../GPT-5-CODEX.md)** - ⭐ **Essential**: GPT-5 Codex operational context (root)
- **[ASTRID.md Template](./templates/ASTRID.md)** - ⭐ **Essential**: Configure AI agent behavior for your project
- **[AI Agents Overview](./ai-agents/README.md)** - Getting started with AI coding agents
- **[Quick Start Guide](./ai-agents/quick-start.md)** - Fast setup for AI agents
- **[Setup Checklist](./ai-agents/setup-checklist.md)** - Complete setup verification
- **[GitHub Integration](./ai-agents/GITHUB_CODING_AGENT_IMPLEMENTATION.md)** - Detailed implementation guide
- **[Example Tasks](./ai-agents/example-tasks.md)** - Sample tasks for AI agents
- **[Troubleshooting](./ai-agents/troubleshooting.md)** - Common issues and solutions

### 🧪 Testing & Quality
- **[MCP Testing Guide](./testing/MCP_TESTING_GUIDE.md)** - Complete MCP (Model Context Protocol) testing
- **[E2E Testing Quickstart](./testing/E2E_QUICKSTART.md)** - Quick reference for end-to-end testing
- **[Playwright Setup](./testing/PLAYWRIGHT_SETUP.md)** - Playwright installation and configuration
- **[Playwright Auth Guide](./testing/PLAYWRIGHT_AUTH_GUIDE.md)** - Authentication testing with Playwright
- **[MCP Servers](../mcp/README.md)** - Standalone MCP server implementations and build scripts
- **[Development Guidelines](./guides/development-guidelines.md)** - Code quality and development standards

### 🏛️ System Context
- **[Stack Overview](./context/stack.md)** - Technology stack and dependencies
- **[API Contracts](./context/api_contracts.md)** - API documentation and contracts
- **[Conventions](./context/conventions.md)** - Code and naming conventions
- **[Quick Reference](./context/quick-reference.md)** - Common commands and patterns
- **[Testing Strategy](./context/testing.md)** - Testing approach and tools
- **[Task Defaults System](./context/task-defaults-system.md)** - Task default values and behavior

### 🎨 UI & Design
- **[Layout System](./LAYOUT_SYSTEM.md)** - ⚠️ **Critical**: Mobile vs Column Layout distinction, responsive breakpoints

### 📱 Related: iOS App
The native iOS app is maintained in a separate repository:
- **Repository:** https://github.com/Graceful-Tools/astrid-ios
- **iOS Documentation:** See the iOS repository for development guides and architecture

### 🔒 Security & Files
- **[Secure File Migration](./SECURE_FILE_MIGRATION.md)** - File handling security
- **[Secure Upload Example](./SECURE_UPLOAD_EXAMPLE.md)** - Secure file upload implementation

### 🤖 AI Prompts
- **[Planning Mode](./prompts/01-plan.md)** - AI planning prompts
- **[Multi-file Refactor](./prompts/02-multi-file-refactor.md)** - Large refactoring prompts
- **[Reviewer Mode](./prompts/03-reviewer-mode.md)** - Code review prompts
- **[PR Author](./prompts/04-pr-author.md)** - Pull request creation prompts
- **[Bug Hunt](./prompts/05-bug-hunt.md)** - Bug finding and fixing prompts

### 🔧 Fixes & Troubleshooting
- **[iOS Timezone Date Handling Fix](./fixes/IOS_TIMEZONE_DATE_HANDLING_FIX.md)** - ⚠️ **Critical**: API date/time handling patterns for mobile clients
- **[Insecure Connection Warnings Fix](./fixes/INSECURE-CONNECTION-WARNINGS-FIX.md)** - Resolving HTTPS connection warnings
- **[Local Testing Guide](./fixes/LOCAL_TESTING_GUIDE.md)** - Guide for testing locally
- **[AI Agent Consolidation Analysis](./fixes/AI_AGENT_CONSOLIDATION_ANALYSIS.md)** - Analysis of AI agent system

### 📦 Archive
The `archive/` directory contains historical documentation preserved for reference:
- **Implementation Summaries** (`archive/implementations/`)
  - OAuth implementation phases (Phase 1, Phases 2 & 3)
  - Repository access and workflow fixes (2024-09/10)
  - Connection and webhook payload fixes
  - SSE consolidation and retry logic
  - Playwright integration and migration details
  - Admin member migration and datetime refactor
  - iOS OAuth and API v1 migration
  - MCP to API migration plans
- **Analysis Documents** (`archive/analysis/`)
  - Cloud workflow analysis and comparisons
  - Historical architectural decisions
- **Completed Migrations** (`archive/completed-migrations/`)
  - Secure file migration
  - AI agent schema proposals and migration plans
  - Astrid.md production checklist
- **Legacy Documentation**
  - Migration guides and safety reports
  - Old optimization trackers
  - Previous system designs

## 🎯 Quick Start

### For Developers
1. Start with [Architecture Overview](./ARCHITECTURE.md)
2. Follow [Setup & Deployment](#-setup--deployment) guides
3. Review [Development Guidelines](./guides/development-guidelines.md)

### For AI Agent Setup
1. Read [AI Agents Overview](./ai-agents/README.md)
2. Follow [Quick Start Guide](./ai-agents/quick-start.md)
3. Complete [Setup Checklist](./ai-agents/setup-checklist.md)

### For Testing MCP Integration
1. Review [MCP Testing Guide](./testing/MCP_TESTING_GUIDE.md)
2. Test with the interactive web UI at `/settings/mcp-testing`

## 📋 System Status

**Current System Features:**
- ✅ **Simplified AI Agent System** - Single coding agent (removed Astrid Alpha, Google Gemini)
- ✅ **Token-Level MCP Permissions** - Simplified access control at token provisioning level
- ✅ **GitHub Integration** - Full coding agent with PR workflows
- ✅ **Multi-AI Support** - Claude, OpenAI, and Gemini APIs
- ✅ **Production Ready** - All migrations deployed and tested

**Documentation Status:** ✅ **Up to Date** (Last updated: 2024-11-21)
**Documentation Organization:** ✅ **Cleaned and Organized** - Root directory reserved for AI agent contexts only
**Root Directory:** CLAUDE.md, GPT-5-CODEX.md, ASTRID.md, README.md (AI agent operational contexts)

**Recent Updates (2024-11-21 - Documentation Audit & Cleanup):**
- 🧹 **Removed obsolete documentation** - Deleted 4 files describing non-existent infrastructure (Depot.dev, aspirational staging setup, port detection details)
- 🗂️ **Reorganized historical docs** - Moved 8 implementation summaries from ai-agents/ to archive/implementations/, 4 analysis docs to archive/analysis/
- 📅 **Fixed incorrect dates** - Corrected 20+ files with future dates (2025-09/10 → 2024-09/10)
- 📁 **Improved archive organization** - Created archive/analysis/ subdirectory, updated archive documentation
- 🔍 **Removed phantom file references** - Removed references to ARCHITECTURE_AUDIT_2025.md and IMPLEMENTATION_PLAN_2025.md which don't exist
- ✅ **ARCHITECTURE.md** - Comprehensive system documentation with offline mode, caching, real-time updates, push notifications, email services, cron jobs, webhooks, and infrastructure
- ✅ **AUTH_SETUP.md** - Updated to reflect dual authentication (Google OAuth + Credentials)
- ✅ **stack.md** - Updated to Next.js 15, React 19, Prisma 6.14+, added Redis, Dexie, Playwright, email services, and AI integrations
- ✅ **quick-reference.md** - Updated versions and added comprehensive environment variable documentation

---

*For questions or documentation updates, please create an issue or reach out to the development team.*