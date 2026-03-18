# AquaFeed Pro – Firebase Realtime Database Structure

Below is the complete RTDB JSON structure used by both the React Native app and the ESP32 firmware.

```json
{
  "foodContainer": {
    "remainingGrams": 450,
    "maxCapacityGrams": 500,
    "lastUpdated": "2026-03-01 at 10:00"
  },

  "schedules": {
    "-NxABC123": {
      "id": "-NxABC123",
      "time": "08:00",
      "amount": 5,
      "enabled": true
    },
    "-NxABC456": {
      "id": "-NxABC456",
      "time": "14:00",
      "amount": 5,
      "enabled": true
    },
    "-NxABC789": {
      "id": "-NxABC789",
      "time": "22:00",
      "amount": 5,
      "enabled": true
    }
  },

  "history": {
    "-NxHIST001": {
      "id": "-NxHIST001",
      "timestamp": "2026-02-04 at 08:00",
      "amount": 5,
      "status": "completed",
      "triggeredBy": "schedule"
    },
    "-NxHIST002": {
      "id": "-NxHIST002",
      "timestamp": "2026-02-03 at 20:00",
      "amount": 5,
      "status": "completed",
      "triggeredBy": "manual"
    }
  },

  "deviceStatus": {
    "online": true,
    "lastSeen": "2026-03-01 at 10:00",
    "wifiRSSI": -45,
    "uptime": 86400
  },

  "manualFeed": {
    "trigger": false,
    "amount": 5,
    "timestamp": "2026-03-01 at 09:30"
  }
}
```

## Data Flow

| Direction | Path | Writer | Reader |
|-----------|------|--------|--------|
| App → ESP32 | `/schedules/*` | Mobile App | ESP32 |
| App → ESP32 | `/manualFeed` | Mobile App | ESP32 |
| ESP32 → App | `/foodContainer` | ESP32 | Mobile App |
| ESP32 → App | `/deviceStatus` | ESP32 | Mobile App |
| ESP32 → App | `/history/*` | ESP32 | Mobile App |

## Security Rules (Development)

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

For production, scope rules per-user with Firebase Auth UID-based paths.
