# Reminder System Implementation Plan

## Overview

This document outlines the comprehensive implementation plan for adding a full reminder system to the Astrid task management application. The system will include due times, push notifications, email reminders, and user preference settings.

## Current System Analysis

### Existing Infrastructure
- **Database**: PostgreSQL with Prisma ORM
- **Email**: Resend service integration (lib/email.ts)
- **PWA**: Service Worker with basic push notification handling (public/sw.js)
- **Task Model**: Basic due date support via `when` field, but no time component
- **User Settings**: Basic settings page exists at app/settings/page.tsx

### Current Limitations
- Tasks only support due dates, not due times
- No reminder system or notifications
- No user preferences for reminder settings
- Email system exists but only for invitations/verification
- Service worker handles push notifications but not reminder-specific ones

## Implementation Plan

### Phase 1: Database Schema Updates

#### 1.1 Task Model Enhancements
```prisma
model Task {
  // ... existing fields
  dueDateTime    DateTime?    // Replace/supplement `when` field with full datetime
  reminderTime   DateTime?    // When to send reminder notification
  reminderSent   Boolean      @default(false) // Track if reminder was sent
  reminderType   String?      // "push", "email", "both"
}
```

#### 1.2 User Reminder Preferences
```prisma
model User {
  // ... existing fields
  reminderSettings ReminderSettings?
}

model ReminderSettings {
  id                    String   @id @default(cuid())
  userId                String   @unique
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Notification preferences
  enablePushReminders   Boolean  @default(true)
  enableEmailReminders  Boolean  @default(true)
  
  // Default reminder timing (minutes before due)
  defaultReminderTime   Int      @default(60) // 1 hour before
  
  // Daily digest preferences
  enableDailyDigest     Boolean  @default(true)
  dailyDigestTime       String   @default("09:00") // "HH:MM" format
  dailyDigestTimezone   String   @default("UTC")
  
  // Quiet hours
  quietHoursStart       String?  // "22:00"
  quietHoursEnd         String?  // "08:00"
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

#### 1.3 Reminder Queue System
```prisma
model ReminderQueue {
  id            String      @id @default(cuid())
  taskId        String
  userId        String
  scheduledFor  DateTime    // When to send the reminder
  type          String      // "due_reminder", "daily_digest"
  status        String      @default("pending") // "pending", "sent", "failed"
  retryCount    Int         @default(0)
  
  task          Task        @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  
  @@index([scheduledFor, status])
  @@index([userId, status])
  @@index([taskId])
}
```

### Phase 2: Backend API Enhancements

#### 2.1 Reminder Preferences API
- `GET /api/user/reminder-settings` - Get user's reminder preferences
- `PUT /api/user/reminder-settings` - Update user's reminder preferences

#### 2.2 Task API Updates
- Modify task creation/update endpoints to handle due times
- Add reminder scheduling logic when tasks are created/updated

#### 2.3 Push Notification Service
- Implement web push notification server using Web Push Protocol
- Store push subscription data for users
- Create notification template system

#### 2.4 Background Job System
- Implement cron job or scheduled task system for processing reminder queue
- Email reminder processor
- Push notification processor
- Daily digest generator

### Phase 3: Frontend Enhancements

#### 3.1 Task Form Updates
- Add time picker component to due date selector
- Add reminder time configuration (relative to due date)
- Visual indicators for tasks with reminders set

#### 3.2 User Settings Page Enhancement
```typescript
interface ReminderSettingsForm {
  enablePushReminders: boolean
  enableEmailReminders: boolean
  defaultReminderTime: number // minutes before due
  enableDailyDigest: boolean
  dailyDigestTime: string
  dailyDigestTimezone: string
  quietHoursStart?: string
  quietHoursEnd?: string
}
```

#### 3.3 Push Notification Permission Handling
- Request notification permissions on first login or in settings
- Handle permission states (granted, denied, default)
- Fallback to email-only reminders if push is denied

### Phase 4: Notification System Implementation

#### 4.1 Push Notification Infrastructure
- Service Worker enhancements for reminder notifications
- Notification click handling (open specific task)
- Action buttons on notifications (mark complete, snooze)

#### 4.2 Email Reminder Templates
Following the existing email template pattern in lib/email.ts:
- Due reminder email template
- Daily digest email template
- Overdue task email template

#### 4.3 Reminder Scheduling Logic
- Calculate reminder times based on due date/time and user preferences
- Handle timezone conversions
- Respect quiet hours settings
- Queue reminders in ReminderQueue table

### Phase 5: Daily Digest System

#### 5.1 Daily Digest Generation
- Query tasks due today, overdue, and upcoming (next 7 days)
- Group by urgency and list membership
- Generate personalized digest content

#### 5.2 Digest Delivery
- Email digest with task summaries and quick action links
- Push notification summary for users who prefer it
- Respect user's preferred delivery time and timezone

### Phase 6: Background Processing

#### 6.1 Reminder Processor Job
```typescript
// Cron job that runs every minute
async function processReminders() {
  const dueReminders = await getRemindersDueNow()
  
  for (const reminder of dueReminders) {
    try {
      if (reminder.type === 'due_reminder') {
        await sendTaskReminder(reminder)
      } else if (reminder.type === 'daily_digest') {
        await sendDailyDigest(reminder)
      }
      
      await markReminderSent(reminder.id)
    } catch (error) {
      await handleReminderFailure(reminder, error)
    }
  }
}
```

#### 6.2 Deployment Considerations
- Use Vercel Cron Jobs for scheduled processing
- Implement proper retry logic with exponential backoff
- Add monitoring and alerting for failed reminders

### Phase 7: Advanced Features

#### 7.1 Smart Reminder Timing
- Learn from user behavior (when they typically complete tasks)
- Suggest optimal reminder times
- Adjust reminder frequency based on task importance

#### 7.2 Snooze Functionality
- Allow users to snooze reminders from notification actions
- Configurable snooze intervals (15min, 1hr, tomorrow, etc.)
- Track snooze patterns for learning

#### 7.3 Location-Based Reminders (Future)
- Integration with geolocation API
- Context-aware reminders based on user location
- "Remind me when I'm at work" type functionality

## Technical Implementation Details

### Database Migration Strategy
1. Add new fields to existing tables gradually
2. Maintain backward compatibility during transition
3. Populate default reminder settings for existing users
4. Migrate existing `when` field data to new `dueDateTime` format

### Security Considerations
- Encrypt push notification endpoints
- Rate limiting for reminder APIs
- User permission validation for all reminder operations
- Secure handling of timezone and personal preference data

### Performance Optimization
- Index optimization for reminder queries
- Batch processing of reminders
- Caching of user settings
- Efficient querying of due tasks

### Testing Strategy
- Unit tests for reminder calculation logic
- Integration tests for notification delivery
- End-to-end tests for complete reminder flows
- Load testing for batch reminder processing

## Implementation Timeline

### Week 1-2: Database and Backend Foundation
- Database schema updates and migrations
- Basic API endpoints for reminder settings
- Reminder queue system

### Week 3-4: Frontend Integration
- Task form enhancements with time selection
- User settings page for reminder preferences
- Basic push notification permission handling

### Week 5-6: Notification System
- Email reminder templates and delivery
- Push notification enhancement
- Background job system for processing

### Week 7-8: Daily Digest and Advanced Features
- Daily digest generation and delivery
- Advanced reminder logic (quiet hours, timezones)
- Testing and refinement

## Success Metrics
- User engagement with reminder settings (adoption rate)
- Reminder delivery success rate (>95%)
- Task completion rate improvement after reminder implementation
- User satisfaction with reminder timing and frequency
- Reduction in overdue tasks

## Risk Mitigation
- Gradual rollout with feature flags
- Comprehensive testing before production deployment
- Monitoring and alerting for system health
- User feedback collection and iteration
- Fallback mechanisms for notification delivery failures

## Future Enhancements
- AI-powered reminder optimization
- Integration with calendar systems
- Voice-activated reminders
- Team reminder coordination features
- Analytics and insights dashboard for productivity patterns