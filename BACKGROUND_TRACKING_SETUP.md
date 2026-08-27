# Background Location Tracking Setup Guide

This guide explains the background location tracking system that captures GPS coordinates even when the app is closed.

## What's Implemented

### 1. Foreground Tracking (App Open) ✅
**File**: `src/services/backgroundTracking.ts`
- Captures location every 1 minute automatically
- Runs when app is in foreground
- Uses high accuracy GPS
- Stores in `gps_tracking` table immediately

### 2. PWA Background Tracking (App Closed) ✅
**Files**: 
- `src/services/backgroundTracking.ts` - Service initialization
- `public/sw.js` - Service Worker with Background Sync
- `supabase/functions/capture-gps-location/index.ts` - Edge function

**How it works**:
1. When app is open, auth token is stored in IndexedDB
2. When app closes, Service Worker Background Sync triggers periodically
3. SW requests geolocation from device
4. SW calls edge function endpoint with location data
5. Location saved to `gps_tracking` table

**Browser Support**:
- ✅ Chrome/Edge Android PWA
- ✅ iPhone PWA (iOS 16.4+)
- ⚠️ Limited geolocation in background on some browsers

### 3. APK Background Tracking (Native Code) ✅
**Integration Point**: `captureLocationFromAPK()` function

**How APK uses it**:
```typescript
// From native Android code, call:
window.captureLocationFromAPK(lat, lng, accuracy, speed);

// Or using Cordova/Capacitor bridge:
// Invoke JavaScript function with captured location
```

Native code can call this function from foreground service or work manager to send background-captured locations to Supabase.

## Database Schema

All locations are stored in existing `gps_tracking` table:
```sql
gps_tracking (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  date DATE,
  latitude DECIMAL,
  longitude DECIMAL,
  accuracy DECIMAL (meters),
  speed DECIMAL (m/s),
  timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE
)
```

## Testing

### Test Foreground Tracking
1. Open app on phone
2. Go to GPS Tracking → Tracking tab
3. Select your user, "Today" date range
4. Should see location points appearing and distance calculating
5. Check back after 1 minute - new point should appear

### Test PWA Background Tracking
1. Close browser/PWA completely
2. Wait 1-2 minutes
3. Reopen PWA
4. Go to GPS Tracking → Tracking
5. Check if locations were captured while closed
6. Look at console logs: "Location captured in background"

### Test APK Background Tracking
1. Check native code has implemented foreground service or work manager
2. Ensure native code calls `captureLocationFromAPK()`
3. Monitor `gps_tracking` table for entries from APK
4. Test with app closed and background location capture running

## Troubleshooting

### Service Worker Not Capturing
1. **Check registration**: Open DevTools → Application → Service Workers
2. **Check storage**: Check IndexedDB (Application → IndexedDB → sbee-cables → auth table)
3. **Check token**: Verify "token" key exists with valid JWT
4. **Check logs**: Service Worker console logs in Chrome DevTools

### Geolocation Failing
1. **Permissions**: Ensure location permissions granted for PWA
2. **HTTPS**: Background Sync requires HTTPS (not http://)
3. **Battery Saver**: Device battery saver may block geolocation
4. **Browser limitations**: Some browsers limit background geolocation

### Edge Function Not Responding
1. Verify edge function deployed: Check Supabase dashboard
2. Check logs: `supabase functions list` then check function logs
3. Verify auth token is valid JWT
4. Test endpoint directly with curl:
   ```bash
   curl -X POST https://[project].supabase.co/functions/v1/capture-gps-location \
     -H "Authorization: Bearer [token]" \
     -H "Content-Type: application/json" \
     -d '{"latitude": 0, "longitude": 0, "accuracy": 10, "speed": 0, "date": "2026-08-04"}'
   ```

## Performance Considerations

### PWA Battery Usage
- 1 location capture per minute = ~10-20 minutes of GPS runtime
- Background Sync may be delayed by browser on low battery
- Consider increasing interval if battery drain is significant

### Database Load
- 1 capture/min = 1,440 entries per user per day
- For 10 users = 14,400 entries per day
- Ensure database has appropriate indexes on (user_id, date, timestamp)

### Network Usage
- Each capture = ~200 bytes to edge function
- 1 capture/min = ~288 KB per user per day
- Consider offline queue for areas with poor connectivity

## Configuration

### Adjust Capture Interval
Edit `src/services/backgroundTracking.ts`, line ~59:
```typescript
setInterval(() => {
  captureLocation().catch(console.error);
}, 60000); // Change 60000ms to desired interval
```

### Adjust Geolocation Accuracy
Edit in two places:
1. `src/services/backgroundTracking.ts` - foreground
2. `public/sw.js` - background

Change `enableHighAccuracy: true` to `enableHighAccuracy: false` for lower accuracy but faster response.

## Future Improvements

1. **Offline Queue**: Queue locations when offline, sync when online
2. **Adaptive Interval**: Increase interval if moving slowly, decrease if moving fast
3. **Geofencing**: Only capture in specific areas
4. **Battery Detection**: Adjust capture interval based on battery level
5. **Notification Feedback**: Show user toast when location captured in background
6. **Export GPS Data**: Add bulk export of GPS tracks for field reports

## Native Integration Examples

### Android Foreground Service (Kotlin)
```kotlin
// In foreground service
val latitude = location.latitude
val longitude = location.longitude
val accuracy = location.accuracy.toInt()
val speed = location.speed

// Call JavaScript function via WebView
webView.evaluateJavascript("""
  window.captureLocationFromAPK($latitude, $longitude, $accuracy, $speed);
""".trimIndent()) { _ -> }
```

### React Native Bridge
```typescript
// In React Native module
RNWebView.evaluateJavaScript(`
  window.captureLocationFromAPK(${latitude}, ${longitude}, ${accuracy}, ${speed})
`);
```

## Support

For issues with background tracking:
1. Check browser console (DevTools → Console)
2. Check Service Worker console (DevTools → Application → Service Workers → click worker)
3. Check Supabase edge function logs
4. Verify network connectivity
5. Check location permissions on device

