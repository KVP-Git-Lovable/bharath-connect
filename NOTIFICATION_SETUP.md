# Activity Check-in Notifications Setup Guide

This guide explains how to set up push notifications for activity check-ins.

## What's Included

1. **Activity Check-in Notification Service** (`src/services/activityNotifications.ts`)
   - Creates in-app notifications (bell icon)
   - Sends FCM notifications (APK)
   - Sends Web Push notifications (PWA)
   - Notifies: user, manager, and admins

2. **Supabase Edge Functions**
   - `send-fcm-notification` - Sends push to mobile APK
   - `send-web-push-notification` - Sends push to PWA

## Setup Steps

### 1. Set Up Firebase Cloud Messaging (FCM) for APK

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or select existing one
3. Go to Project Settings → Service Accounts
4. Click "Generate New Private Key"
5. Save the JSON file with these values:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_CLIENT_EMAIL`

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp supabase/functions/.env.example supabase/functions/.env.local
```

Fill in the values from Firebase and VAPID setup.

### 3. Set Up VAPID Keys for Web Push (PWA)

Generate VAPID keys:

```bash
# Using web-push CLI
npm install -g web-push
web-push generate-vapid-keys
```

Or use [VAPID Key Generator](https://d3v.one/vapid-key-generator/)

Save the keys as:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (format: `mailto:your-email@example.com`)

### 4. Deploy Supabase Functions

```bash
# Install Supabase CLI if not already
npm install -g supabase

# Deploy functions
supabase functions deploy send-fcm-notification --env-file supabase/functions/.env.local
supabase functions deploy send-web-push-notification --env-file supabase/functions/.env.local
```

### 5. Integrate in Activity Check-in Code

When user checks into an activity, call:

```typescript
import { createActivityCheckInNotification } from "@/services/activityNotifications";

await createActivityCheckInNotification({
  userId: user.id,
  activityId: activity.id,
  activityName: activity.activity_name,
  latitude: location.lat,
  longitude: location.lng,
  address: location.address,
  timestamp: new Date().toISOString(),
  userFullName: user.full_name,
});
```

## Database Tables Required

### `notifications` (for bell icon)
```sql
- id (uuid)
- user_id (uuid)
- title (text)
- message (text)
- type (text) -- 'activity_check_in', 'day_start', 'leave_approved', etc
- is_read (boolean)
- related_table (text)
- related_id (uuid)
- created_at (timestamp)
```

### `push_tokens` (for storing device tokens)
```sql
- id (uuid)
- user_id (uuid)
- token (text) -- FCM token or Web Push subscription
- platform (text) -- 'android', 'web'
- last_seen_at (timestamp)
```

## Testing

1. **In-app notification**: Check bell icon for new notification
2. **APK push**: Should receive notification even with app closed
3. **PWA push**: Should receive notification even with browser closed

## Troubleshooting

- **FCM not sending**: Check Firebase credentials in environment
- **Web Push not sending**: Verify VAPID keys and service worker registered
- **No notifications**: Check `push_tokens` table has device tokens for users
- **Wrong recipients**: Verify user's manager_id and admin role assignment

## Next Steps

- Test activity check-in with all three notification types
- Add notifications for Day Start, Day End, Leave Requests
- Set up notification preferences UI (allow users to disable certain notifications)
