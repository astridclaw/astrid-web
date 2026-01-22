# Reminder System Testing Guide

## 🧪 Testing Overview

The reminder system has multiple layers that need to be tested:
1. **Database Reminders** (Server-side via cron jobs)
2. **Client-side Service Worker** (Local notifications)
3. **In-memory Reminders** (Immediate feedback)
4. **PWA Notifications** (When app is closed)

## 🛠️ Quick Setup

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Ensure database is set up:**
   ```bash
   DATABASE_URL="postgresql://postgres:password@localhost:5432/astrid_dev" npx prisma migrate dev
   ```

3. **Open browser and enable notifications:**
   - Go to `http://localhost:3001`
   - When prompted, **allow notifications**
   - Install as PWA (optional but recommended for full testing)

## 📋 Testing Scenarios

### 1. Basic Reminder Creation

**Test:** Create a task with a due date in the near future

**Steps:**
1. Create a new task
2. Set due date to 2-3 minutes from now
3. Save the task
4. Check browser console for logs like:
   ```
   📅 Added automatic due_reminder to queue for task...
   Service Worker: Scheduled client-side reminder for task...
   ```

**Expected Result:**
- Console shows database reminder created
- Console shows Service Worker reminder scheduled
- You should receive notification ~1-2 minutes later

### 2. Manual Reminder Testing (Debug Mode)

**Test:** Use the existing "Test Reminder" button

**Steps:**
1. Go to Settings page
2. Enable "Reminder Debug Mode" if available
3. Find a task and click "Test Reminder" button
4. Should see immediate notification

**Expected Result:**
- Notification appears immediately
- Can click actions (Complete, Snooze)
- Clicking notification opens app to task

### 3. Database Reminder Check

**Test:** Verify reminders are stored in database

**Steps:**
1. Create a task with due date
2. Open database and check `ReminderQueue` table:
   ```sql
   SELECT * FROM "ReminderQueue" WHERE status = 'pending';
   ```

**Expected Result:**
- Should see entries with `type: "due_reminder"` and `type: "overdue_reminder"`
- `scheduledFor` should be correct times (15 min before due, 1 hour after due)

### 4. Service Worker Functionality

**Test:** Client-side scheduling works

**Steps:**
1. Open browser dev tools
2. Go to Application tab → Service Workers
3. Check that `sw.js` is active
4. Create task with due date in 1-2 minutes
5. Check console for Service Worker logs
6. Wait for notification

**Expected Result:**
- Service Worker shows as "activated"
- Console logs: `Service Worker: Scheduled client-side reminder...`
- Notification appears at scheduled time

### 5. PWA Closed App Testing

**Test:** Notifications work when PWA is closed

**Steps:**
1. Install app as PWA (Add to Home Screen)
2. Create task due in 1-2 minutes
3. **Close the PWA completely** (don't just minimize)
4. Wait for due time
5. Should receive notification

**Expected Result:**
- Notification appears even with app closed
- Clicking notification reopens app to specific task
- Action buttons (Complete/Snooze) work from notification

### 6. Notification Actions

**Test:** Notification action buttons work

**Steps:**
1. Create task due in 1 minute
2. Wait for notification to appear
3. Test each action:
   - **View Task**: Should open app to task detail
   - **Snooze 15min**: Should show "snoozed" confirmation
   - **Mark Complete**: Should mark task as complete

**Expected Result:**
- All actions work without opening app
- Actions update database correctly
- App reflects changes when reopened

### 7. Task Updates

**Test:** Reminders update when tasks change

**Steps:**
1. Create task with due date
2. Edit task to change due date
3. Check console for logs about cancelled/rescheduled reminders
4. Check database for updated reminder times

**Expected Result:**
- Old reminders cancelled
- New reminders scheduled with correct times
- Both database and Service Worker reminders updated

## 🔍 Debug Commands

### Check Active Service Worker
```javascript
// Run in browser console
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('SW Registration:', reg);
  console.log('SW Active:', reg?.active?.state);
});
```

### Manual Service Worker Message
```javascript
// Send test message to Service Worker
navigator.serviceWorker.ready.then(registration => {
  registration.active.postMessage({
    type: 'SCHEDULE_REMINDER',
    data: {
      taskId: 'test-123',
      title: 'Test Reminder',
      scheduledFor: new Date(Date.now() + 30000), // 30 seconds
      type: 'due_reminder',
      userId: 'current-user-id'
    }
  });
});
```

### Check Scheduled Reminders in SW
```javascript
// This will be logged by Service Worker
// Look for: "Service Worker: Scheduled client-side reminder..."
```

### Force Cron Job (Development)
```bash
# Manually trigger reminder processing
curl -X POST http://localhost:3001/api/cron/reminders
```

### Database Query - Check Pending Reminders
```sql
SELECT 
  r.id,
  r.type,
  r."scheduledFor",
  r.status,
  r.data->>'taskTitle' as title,
  t.title as actual_title,
  t."dueDateTime"
FROM "ReminderQueue" r
JOIN "Task" t ON r."taskId" = t.id
WHERE r.status = 'pending'
ORDER BY r."scheduledFor";
```

## 🚨 Common Issues & Troubleshooting

### Notifications Not Appearing
1. **Check permissions**: Browser settings → Notifications → Allow for your site
2. **Check Service Worker**: Dev tools → Application → Service Workers (should be active)
3. **Check console**: Look for error messages

### Service Worker Not Working
1. **Hard refresh**: Ctrl+Shift+R to reload Service Worker
2. **Unregister**: Application → Service Workers → Unregister, then reload
3. **Check HTTPS**: Service Workers require HTTPS (or localhost)

### Database Reminders Not Created
1. **Check database connection**: Verify `DATABASE_URL` is set
2. **Check migration**: Run `npx prisma migrate dev`
3. **Check logs**: Look for `📅 Added... reminder to queue` in console

### PWA Not Installing
1. **Check manifest**: `/manifest.json` should be accessible
2. **Check HTTPS**: PWAs require HTTPS (or localhost)
3. **Check criteria**: Browser may need multiple visits before showing install prompt

## 📊 Expected Logs

When working correctly, you should see logs like:
```
📅 Added automatic due_reminder to queue for task abc123 at 12/9/2025, 2:45:00 PM
📅 Added automatic overdue_reminder to queue for task abc123 at 12/9/2025, 4:00:00 PM
Service Worker: Scheduled client-side reminder for task abc123 in 120 seconds
🔔 Triggered due_reminder for task abc123
Service Worker: Showed client-side reminder for task abc123
```

## 🎯 Success Criteria

✅ **Database reminders**: Created automatically for tasks with due dates  
✅ **Service Worker reminders**: Scheduled and triggered locally  
✅ **PWA notifications**: Work when app is completely closed  
✅ **Deep linking**: Notifications open specific tasks  
✅ **Action buttons**: Complete/Snooze work from notifications  
✅ **Task updates**: Reminders reschedule when tasks change  
✅ **Multiple layers**: Both server and client-side systems work together  

Happy testing! 🚀