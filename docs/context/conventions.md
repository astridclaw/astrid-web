# Development Conventions

## TypeScript & Module Boundaries

### TypeScript Configuration
- **Strict Mode**: Enabled in `tsconfig.json` (`tsconfig.json:5`)
- **Path Aliases**: Use `@/*` for imports from project root (`tsconfig.json:22`)
- **Module Resolution**: Bundler mode with ESNext (`tsconfig.json:8-9`)
- **JSX**: Preserve mode for Next.js (`tsconfig.json:15`)

### Import Boundaries
- **Absolute Imports**: Use `@/` prefix for all internal imports (`app/api/lists/route.ts:2-4`)
- **UI Components**: Import from `@/components/ui/` (`components/task-form.tsx:5-11`)
- **Utilities**: Import from `@/lib/` (`app/api/tasks/route.ts:2-3`)
- **Types**: Import from `@/types/` (`hooks/use-lists.ts:3`)

## Error Handling Conventions

### API Error Responses
- **Never Leak DB Errors**: Always return generic "Internal server error" (`app/api/tasks/route.ts:198`)
- **Consistent Format**: `NextResponse.json({ error: "message" }, { status: code })` (`app/api/lists/route.ts:18`)
- **Status Codes**: 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)
- **Try-Catch Pattern**: Wrap all database operations in try-catch blocks (`app/api/tasks/route.ts:10-50`)

### Client Error Handling
- **Throw Errors**: Use `throw new Error("message")` for client-side failures (`components/task-detail.tsx:419`)
- **Error Boundaries**: React error boundaries for component crashes
- **Toast Notifications**: Use `useToast` hook for user feedback (`components/list-members-manager.tsx:12`)

## Logging & Observability

### Logger Usage
- **Console Logging**: Primary logging method throughout the codebase
- **Auth Logging**: Extensive logging in authentication flow (`lib/auth-config.ts:20-40`)
- **Error Logging**: `console.error` for all error conditions (`lib/email.ts:79-80`)
- **Info Logging**: `console.log` for important operations (`lib/openai.ts:37`)
- **Warning Logging**: `console.warn` for non-critical issues (`lib/date-utils.ts:68`)

### Logging Patterns
- **Prefixed Logs**: Use `[Auth]`, `📧`, `🎨` prefixes for context (`lib/auth-config.ts:25`)
- **Structured Data**: Log objects and arrays for debugging (`lib/auth-config.ts:14`)
- **Development Mode**: Extensive logging in development, reduced in production

## Input Validation & Security

### Validation Strategy
- **Zod Integration**: Zod 3.24.1 for schema validation (`package.json:105`)
- **Form Validation**: React Hook Form + Zod for client-side validation
- **Server Validation**: Manual validation in API routes (`app/api/tasks/route.ts:76`)
- **Type Safety**: Full TypeScript coverage for all inputs

### Security Patterns
- **Session Validation**: Always check `getServerSession` before operations (`app/api/lists/route.ts:18`)
- **Permission Checks**: Verify user access before sensitive operations (`app/api/tasks/[id]/route.ts:58`)
- **Input Sanitization**: Trim and validate all user inputs (`app/api/lists/route.ts:50`)
- **File Upload Limits**: 10MB max file size with type validation (`app/api/upload/route.ts:24`)

## Date & Time Handling

### Timezone Strategy
- **Database Storage**: PostgreSQL DateTime fields (no explicit timezone handling found)
- **Display Formatting**: Use `toLocaleDateString()` and `toLocaleString()` for user display (`lib/email.ts:65`)
- **Date Parsing**: Custom relative date parsing in `lib/date-utils.ts`
- **No UTC Enforcement**: No explicit UTC conversion found in codebase

### Date Utilities
- **Relative Dates**: Support for "today", "tomorrow", "next week" patterns (`lib/date-utils.ts:1-50`)
- **Format Functions**: `formatDateForDisplay()` for consistent date formatting (`lib/date-utils.ts:100-110`)
- **Validation**: Date format validation in task creation (`app/api/tasks/route.ts:153`)

## Linting & Code Quality

### ESLint Rules
- **Next.js Core**: Extends `next/core-web-vitals` (`eslint.config.mjs:18`)
- **Custom Rules**: 
  - `@next/next/no-img-element: "off"` (`eslint.config.mjs:20`)
  - `react-hooks/exhaustive-deps: "warn"` (`eslint.config.mjs:21`)
  - `@typescript-eslint/no-unused-vars: "warn"` (`eslint.config.mjs:22`)
  - `@typescript-eslint/no-explicit-any: "warn"` (`eslint.config.mjs:23`)

### Code Quality
- **TypeScript Strict**: Full type checking enabled
- **Unused Variables**: Warning for unused variables
- **Any Types**: Warning for explicit `any` usage
- **React Hooks**: Warning for missing dependencies