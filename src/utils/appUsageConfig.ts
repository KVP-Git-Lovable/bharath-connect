/**
 * Tuning for the app-usage upload queue.
 *
 * Deliberately NOT a new block inside gpsCaptureGate.ts: a GPS tuning change
 * must not be able to alter usage behaviour, and the policies genuinely differ.
 * GPS produces thousands of points a day and needs freshness for the live admin
 * map; usage produces tens of rows a day and needs none, so it flushes lazily.
 */
export const APP_USAGE_CONFIG = {
  QUEUE: {
    FLUSH_INTERVAL_MS: 5 * 60_000,
    RETRY_BASE_MS: 30_000, // backoff: min(BASE * 2^failures, MAX)
    MAX_BACKOFF_MS: 15 * 60_000,
    CHUNK_SIZE: 200, // rows per upsert request
    MAX_ROWS: 5_000, // hard queue cap (multi-day-offline pathology)
  },
  /** How often the JS side pulls closed intervals off the device journal.
   *  It bounds how long a record sits on disk; it measures nothing, so
   *  background throttling of this timer is irrelevant by design. */
  DRAIN_INTERVAL_MS: 5 * 60_000,
} as const;
