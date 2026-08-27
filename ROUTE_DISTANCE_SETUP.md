# Google Maps Route Distance Calculation

This implementation calculates actual route distance (not straight-line distance) using Google Maps Directions API.

## 📋 Setup Instructions

### 1. **Get Google Maps API Key**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable these APIs:
   - **Maps SDK for JavaScript**
   - **Directions API**
   - **Distance Matrix API**

4. Create an **API Key**:
   - Go to Credentials
   - Click "Create Credentials" → "API Key"
   - Copy the API key

### 2. **Set Environment Variable in Supabase**

1. Go to your Supabase project
2. Settings → Edge Functions
3. Add environment variable:
   ```
   Key: GOOGLE_MAPS_API_KEY
   Value: <your-api-key>
   ```

### 3. **Deploy Edge Function**

```bash
# Deploy the function
supabase functions deploy calculate-route-distance

# Or if using Lovable, push to GitHub and it will deploy automatically
git push origin main
```

## 🚀 Usage

### In Your Components

```typescript
import { useRouteDistance } from '@/hooks/useRouteDistance';

function DayTracking() {
  const { calculateDistance, loading, error } = useRouteDistance();

  const handleCalculateDistance = async (gpsPoints) => {
    const result = await calculateDistance(gpsPoints);
    if (result) {
      console.log(`Total distance: ${result.distanceKm} km`);
    }
  };

  return (
    // Your component JSX
  );
}
```

### GPS Points Format

```typescript
interface GPSPoint {
  lat: number;
  lng: number;
  timestamp?: string; // optional
}

// Example
const points = [
  { lat: 23.1815, lng: 79.9864 },
  { lat: 23.1825, lng: 79.9874 },
  { lat: 23.1835, lng: 79.9884 },
];
```

## 📊 Response Format

```typescript
{
  "totalDistance": 2500,      // in meters
  "distanceKm": 2.5,          // in kilometers
  "segments": [
    {
      "from": "23.1815,79.9864",
      "to": "23.1825,79.9874",
      "distance": 1250,        // in meters
      "duration": 120          // in seconds
    }
  ],
  "error": null
}
```

## ⚙️ How It Works

1. **Input**: Array of GPS coordinates (latitude, longitude)
2. **Processing**:
   - Splits coordinates into consecutive pairs
   - Calls Google Maps Directions API for each pair
   - Gets actual route distance (not straight-line)
   - Sums all segments for total distance
3. **Fallback**: If route not found, uses Haversine formula (straight-line)
4. **Output**: Total distance in km with segment details

## 🔧 Integration Points

### To Use in Day Tracking Component

1. Import the hook:
   ```typescript
   import { useRouteDistance } from '@/hooks/useRouteDistance';
   ```

2. Get GPS points from database:
   ```typescript
   const gpsPoints = gpsTrackingData.map(point => ({
     lat: point.location_lat,
     lng: point.location_lng,
   }));
   ```

3. Calculate distance:
   ```typescript
   const result = await calculateDistance(gpsPoints);
   setDistance(result?.distanceKm || 0);
   ```

## 💰 Cost Considerations

- Google Maps Directions API: ~$0.005 per request (may vary)
- 50 points = ~50 API calls = ~$0.25
- Consider caching results to reduce API calls

## 🐛 Troubleshooting

### "API key not configured"
- Make sure GOOGLE_MAPS_API_KEY environment variable is set in Supabase

### "ZERO_RESULTS"
- Route not found between two points
- Falls back to straight-line distance automatically

### "RATE_LIMIT_EXCEEDED"
- Too many requests to Google Maps API
- Add delays between requests (already implemented: 100ms)
- Consider batching requests differently

## 📝 API Limits

- Google Maps Directions API: 25,000 requests/day (free tier)
- Rate limit: ~100 requests/second

---

**Files Created:**
- `supabase/functions/calculate-route-distance/index.ts` - Edge Function
- `src/hooks/useRouteDistance.ts` - React Hook
- `ROUTE_DISTANCE_SETUP.md` - This file
