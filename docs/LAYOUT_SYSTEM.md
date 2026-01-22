# Layout Detection System

This document describes the unified layout detection system used throughout the Astrid task manager application.

## Overview

The layout system provides consistent device and viewport-based UI adaptations across all components. It replaces the previous ad-hoc mobile/desktop detection with a clear, unified approach.

## Layout Types

### Mobile Devices
- **mobile-1-column**: iPhone/Android phone (< 910px width)
  - Single column layout with full-screen task views
  - Hamburger menu for navigation
  - Optimized for touch interaction

### Tablet Devices
- **tablet-2-column**: iPad portrait mode (< 1100px width)
  - Two-column layout: sidebar + task list OR task details
  - Hamburger menu controls sidebar visibility
  - Touch-optimized with larger touch targets

- **tablet-3-column**: iPad landscape mode (≥ 1100px width)
  - Three-column layout: sidebar + task list + task details
  - Always-visible sidebar
  - Desktop-like experience on large tablets

### Desktop/Computer
- **computer-1-column**: Desktop narrow window (< 910px width)
  - Single column layout (when browser window is very narrow)
  - Hamburger menu for navigation
  - Useful for side-by-side app usage

- **computer-2-column**: Desktop medium window (910-1100px width)
  - Two-column layout: sidebar + task list OR task details
  - Hamburger menu controls sidebar visibility
  - Standard desktop experience

- **computer-3-column**: Desktop wide window (≥ 1100px width)
  - Three-column layout: sidebar + task list + task details
  - Always-visible sidebar
  - Optimal desktop experience with maximum information density

## Breakpoints

| Layout Type | Width Range | Device Examples |
|-------------|-------------|-----------------|
| mobile-1-column | < 910px | iPhone, Android phones |
| tablet-2-column | < 1100px | iPad portrait |
| tablet-3-column | ≥ 1100px | iPad landscape |
| computer-1-column | < 910px | Narrow desktop window |
| computer-2-column | 910-1100px | Standard desktop |
| computer-3-column | ≥ 1100px | Wide desktop |

## Key Behaviors by Layout

### 1-Column Views (mobile-1-column, computer-1-column)
- **Task Creation**: New tasks don't auto-open details (enables rapid task entry)
- **Navigation**: Full-screen transitions between views
- **Focus Management**: Input stays focused after task creation

### 2-Column Views (tablet-2-column, computer-2-column)
- **Task Creation**: New tasks auto-open details for immediate editing
- **Navigation**: Side-by-side panels with hamburger menu
- **Sidebar**: Toggleable via hamburger menu
- **Task Details**: Automatically closes when scrolling the task list (improves navigation)

### 3-Column Views (tablet-3-column, computer-3-column)
- **Task Creation**: New tasks auto-open details for immediate editing
- **Navigation**: All panels visible simultaneously
- **Sidebar**: Always visible, no hamburger menu needed
- **Task Details**: Automatically closes when scrolling the task list (improves navigation)

## Critical: Mobile vs Column Layout Distinction

**⚠️ IMPORTANT**: There are two independent layout concerns that must be handled separately:

### Device Type (`isMobile`) vs Layout Columns
- **`isMobile`**: Detects touch-based devices (phones, tablets) vs pointer-based devices (desktop)
- **Column Layout**: Determines UI structure based on available screen width

```typescript
// These are INDEPENDENT concerns:
const isMobile = getDeviceType() === 'mobile'     // Device interaction method
const layoutType = getLayoutType()                // Screen real estate usage

// Examples of how they combine:
// - Mobile phone: isMobile=true, layoutType='mobile-1-column'
// - iPad portrait: isMobile=true, layoutType='tablet-2-column'
// - iPad landscape: isMobile=true, layoutType='tablet-3-column'
// - Narrow desktop: isMobile=false, layoutType='computer-1-column'
// - Wide desktop: isMobile=false, layoutType='computer-3-column'
```

### When to Use Each

**Use `isMobile` for:**
- Touch vs click interaction patterns
- Text input behavior (auto-focus, keyboard handling)
- Button styling (larger touch targets, different visual styles)
- Gesture-based interactions
- Mobile-specific features (vibration, orientation)

**Use Column Layout for:**
- Sidebar visibility
- Panel arrangements
- Navigation structure
- Content density
- Screen real estate optimization

### Common Anti-Pattern ❌
```typescript
// WRONG: This ignores tablets in landscape mode
if (isMobile) {
  showOnlyPlusIcon()
} else {
  showPlusIconWithText()
}
```

### Correct Pattern ✅
```typescript
// RIGHT: Handle all mobile devices consistently
if (isMobile) {
  showOnlyPlusIcon()           // ALL mobile devices (phone, tablet)
} else {
  showPlusIconWithText()       // Desktop/computer only
}

// OR: Base on column layout if UI structure matters more than device
if (layoutType.includes('1-column')) {
  useCompactUI()
} else {
  useExpandedUI()
}
```

## Usage in Code

### Layout Detection
```typescript
import {
  getLayoutType,
  is1ColumnView,
  getDeviceType,
  shouldShowHamburgerMenu
} from '@/lib/layout-detection'

// Get current layout
const layoutType = getLayoutType() // 'mobile-1-column' | 'tablet-2-column' | etc.

// Check layout characteristics
const isSingleColumn = is1ColumnView() // boolean
const deviceType = getDeviceType() // 'mobile' | 'tablet' | 'computer'
const needsHamburger = shouldShowHamburgerMenu() // boolean

// Conditional behavior based on layout
if (is1ColumnView()) {
  // Skip auto-opening task details for rapid task entry
} else {
  // Auto-open task details for editing
}
```

### Mobile Form Interactions
```typescript
import {
  shouldPreventAutoFocus,
  needsAggressiveKeyboardProtection,
  getKeyboardDetectionThreshold,
  needsScrollIntoViewHandling,
  isIPadDevice
} from '@/lib/layout-detection'

// Form focus handling
useEffect(() => {
  if (editingMode && inputRef.current) {
    if (shouldPreventAutoFocus()) {
      // Don't auto-focus on touch devices - let user gesture handle it
      return
    }
    inputRef.current.focus()
  }
}, [editingMode])

// Keyboard detection
const handleResize = () => {
  const heightDiff = initialHeight - window.innerHeight
  const threshold = getKeyboardDetectionThreshold() // 100 for iPad, 150 for others
  const keyboardOpen = heightDiff > threshold
  // Handle keyboard state...
}

// Click outside protection
const handleClickOutside = (event) => {
  if (needsAggressiveKeyboardProtection() && hasFormFocused) {
    return // Prevent accidental dismissal on iPad
  }
  // Handle click outside...
}

// iOS scroll handling
const handleFocus = (target) => {
  if (needsScrollIntoViewHandling()) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
```

## Real-World Example: Add Task Button

This example from `enhanced-task-creation.tsx` demonstrates the correct approach:

```typescript
// Configuration based on layout type (screen real estate)
const getInputConfig = useCallback((): InputConfig => {
  switch (layoutType) {
    case '3-column':
      return {
        placeholder: 'Add task to current list...',
        buttonText: isMobile ? '' : 'Add Task',     // Device-based UI styling
        showKeyboardHint: false
      }
    case '2-column':
      return {
        placeholder: 'Add task...',
        buttonText: isMobile ? '' : 'Add Task',     // Device-based UI styling
        showKeyboardHint: false
      }
    case '1-column':
      return {
        placeholder: isMobile ? 'Quick add...' : 'Add a new task...',
        buttonText: isMobile ? '' : 'Add Task',     // Device-based UI styling
        showKeyboardHint: false
      }
  }
}, [layoutType, isMobile])

// Button styling based on device type (interaction method)
const getButtonClasses = () => {
  const baseClasses = `bg-blue-600 hover:bg-blue-700 text-white rounded-lg`

  // Mobile gets bold, square touch targets regardless of column layout
  const mobileClasses = isMobile ? 'font-bold p-3' : ''

  switch (layoutType) {
    case '3-column':
      return `${baseClasses} ${mobileClasses} ${isMobile ? '' : 'px-3 py-2 text-sm'}`
    case '2-column':
      return `${baseClasses} ${mobileClasses} ${isMobile ? '' : 'px-4 py-2 text-sm'}`
    case '1-column':
      return `${baseClasses} ${mobileClasses} ${isMobile ? '' : 'px-4 py-2'}`
  }
}

// Icon spacing based on text presence (driven by device type)
<Plus className={`w-4 h-4 ${inputConfig.buttonText ? 'mr-1' : ''}`} />
{inputConfig.buttonText}
```

**Key Insights:**
- **Layout Type** determines placeholder text and overall structure
- **Device Type** (`isMobile`) determines button text presence and styling
- **Both** work together for optimal UX across all device/layout combinations

## Migration from Legacy System

The new system replaces these deprecated patterns:

```typescript
// OLD (deprecated)
const isMobile = width < 910
const isNarrowDesktop = width >= 910 && width < 1200

// NEW (recommended)
const layout = getLayoutType()
const is1Column = is1ColumnView()
const showHamburger = shouldShowHamburgerMenu()
```

## Design Principles

1. **Device-Aware**: Different devices get layouts optimized for their interaction patterns
2. **Responsive**: Layouts adapt smoothly to window resizing
3. **Predictable**: Clear breakpoints and consistent behavior
4. **Accessible**: Touch targets and navigation appropriate for each device type
5. **Performance**: Single source of truth prevents layout calculation duplication

## Testing Layouts

To test different layouts:

1. **Mobile**: Use browser dev tools mobile emulation or actual mobile device
2. **Tablet**: Use iPad or browser window at tablet dimensions
3. **Desktop**: Resize browser window to test different breakpoints
4. **Edge Cases**: Test at exact breakpoint widths (910px, 1100px)

## Future Considerations

- Layout preferences could be user-configurable
- Additional breakpoints may be added for ultra-wide monitors
- Accessibility settings could influence layout choices
- Performance monitoring of layout calculations