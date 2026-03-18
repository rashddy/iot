/**
 * AquaFeed Pro – TypeScript type definitions
 * Mirrors the Firebase Realtime Database structure.
 */

/** A single feeding schedule entry */
export interface FeedingSchedule {
  id: string;
  time: string;       // HH:mm format
  amount: number;      // grams
  enabled: boolean;
}

/** A feeding history log entry */
export interface FeedingHistory {
  id: string;
  timestamp: string;   // ISO 8601 or readable string
  amount: number;      // grams dispensed
  status: 'completed' | 'failed' | 'skipped';
  triggeredBy: 'schedule' | 'manual';
}

/** Device status reported by ESP32 */
export interface DeviceStatus {
  online: boolean;
  lastSeen: string;    // ISO 8601
  wifiRSSI: number;    // signal strength in dBm
  uptime: number;      // seconds since boot
}

/** Food container telemetry */
export interface FoodContainer {
  remainingGrams: number;
  maxCapacityGrams: number;
  lastUpdated: string;
}

/** Manual feed command sent from app → ESP32 */
export interface ManualFeedCommand {
  trigger: boolean;
  amount: number;
  timestamp: string;
}

/** Root database shape */
export interface AquaFeedDatabase {
  foodContainer: FoodContainer;
  schedules: Record<string, FeedingSchedule>;
  history: Record<string, FeedingHistory>;
  deviceStatus: DeviceStatus;
  manualFeed: ManualFeedCommand;
}
