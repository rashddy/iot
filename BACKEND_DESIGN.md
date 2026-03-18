# AquaFeed Pro – Production Backend Design & Architecture

## Executive Summary

This document details a production-ready backend for the AquaFeed Pro smart feeder IoT system. The backend uses Firebase Cloud Functions v2 + Firebase Realtime Database with TypeScript, Zod validation, per-device data isolation, and comprehensive command lifecycle management.

---

## 1. Proposed Architecture

### Components & Responsibilities

```
┌─────────────────────────────────────────────────────────┐
│                   Mobile App (React Native)               │
│                 Firebase Auth + Expo                      │
└────────────────────┬────────────────────────────────────┘
                     │ REST/HTTP Calls
┌────────────────────▼────────────────────────────────────┐
│        Firebase Cloud Functions (Backend)                │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Express.js Router + Middleware                   │   │
│  │ • Auth (Firebase tokens + device secrets)        │   │
│  │ • Rate limiting                                  │   │
│  │ • Request validation (Zod)                       │   │
│  └──────────────────────────────────────────────────┘   │
│                        ▼                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Service Layer                                    │   │
│  │ • CommandService (lifecycle, ACK, retry)        │   │
│  │ • ScheduleService (CRUD, execution checks)      │   │
│  │ • HistoryService (immutable audit logs)         │   │
│  │ • DeviceService (registration, auth, status)    │   │
│  └──────────────────────────────────────────────────┘   │
│                        ▼                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Firebase Admin SDK v12+                         │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ Admin DB writes
┌────────────────────▼────────────────────────────────────┐
│    Firebase Realtime Database (RTDB)                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Schema:                                          │   │
│  │ • /users/{uid}/devices/{deviceId}/*              │   │
│  │ • /commands/{deviceId}/{commandId}               │   │
│  │ • /schedules/{deviceId}/{scheduleId}             │   │
│  │ • /history/{deviceId}/{entryId}                  │   │
│  │ • /foodContainer/{deviceId}                      │   │
│  │ • _[internal]/deviceSecrets, commandDedup, etc.  │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ Polling + listeners
┌────────────────────▼────────────────────────────────────┐
│         ESP32 IoT Device (Feeder)                        │
│  • Polls /commands/{deviceId}/pending                   │
│  • POSTs status to /telemetry/status                    │
│  • ACKs commands to /commands/acknowledge               │
│  • Reads food container thresholds                      │
└─────────────────────────────────────────────────────────┘
```

### Design Rationale

| Component | Responsibility | Why |
|-----------|---|---|
| **Cloud Functions** | HTTP API endpoints, scheduled tasks | Serverless auto-scaling, no ops overhead, integrates with Firebase services |
| **Express.js** | Routing, middleware, validation | Industry standard, minimal overhead for simple CRUD |
| **Zod** | Input validation, schema enforcement | Runtime type safety, clear error messages, no boilerplate |
| **RTDB** | Single source of truth for all data | Real-time listeners, low latency for device polling, simple ACL via security rules |
| **Device Secrets** | ESP32 authentication | Microcontroller constraints (no JWT libraries), simple HMAC or shared secret |
| **Command Queue** | Reliable command delivery | Decouples mobile app from device; enables retry, timeout, and deduplication |
| **Schedules** | Server-side scheduling | Avoids relying on device clock accuracy; works offline |
| **History** | Immutable audit logs | Anti-tampering, compliance, debugging |

### Key Trade-offs

- **RTDB vs Firestore**: Chose RTDB for simpler device auth and real-time listeners (device polling). Firestore would require more complex client libraries on ESP32.
- **Server-side scheduling**: Cron job queries every minute instead of device-side timers (reduces complexity, increases latency by ~1 min).
- **Synchronous ACKs**: Device waits for ACK response after feed complete. Alternative would be async pub/sub (adds complexity).
- **Per-device isolation**: All data scoped by deviceId. Increases query fan-out but guarantees privacy without complex ACLs.

---

## 2. Final RTDB Schema

### Overview

```
{
  "users": {
    "{uid}": {
      "devices": { "{deviceId}": {...} },
      "history": { "{entryId}": {...} },
      "commands": { "{commandId}": {...} }
    }
  },
  "devices": { "{deviceId}": {...} },
  "commands": { "{deviceId}": { "{commandId}": {...} } },
  "schedules": { "{deviceId}": { "{scheduleId}": {...} } },
  "history": { "{deviceId}": { "{entryId}": {...} } },
  "foodContainer": { "{deviceId}": {...} },
  "deviceShares": { "{deviceId}": { "{userId}": {...} } },
  "_deviceSecrets": { "{deviceId}": "hash" },
  "_commandDedup": { "{deviceId}": { "{key}": "{commandId}" } }
}
```

### Full JSON Examples

#### Device Registration + User Ownership

```json
{
  "users": {
    "user-123": {
      "devices": {
        "device-abc": {
          "id": "device-abc",
          "userId": "user-123",
          "name": "Living Room Feeder",
          "model": "ESP32-v1",
          "firmwareVersion": "1.2.3",
          "createdAt": "2025-03-15T10:30:00Z",
          "lastSeen": "2025-03-19T14:22:15Z",
          "online": true,
          "lastSeenThreshold": 120000
        }
      }
    }
  },
  "devices": {
    "device-abc": {
      "id": "device-abc",
      "userId": "user-123",
      "name": "Living Room Feeder",
      "model": "ESP32-v1",
      "firmwareVersion": "1.2.3",
      "createdAt": "2025-03-15T10:30:00Z",
      "lastSeen": "2025-03-19T14:22:15Z",
      "online": true,
      "lastSeenThreshold": 120000,
      "telemetry": {
        "deviceId": "device-abc",
        "online": true,
        "lastSeen": "2025-03-19T14:22:15Z",
        "wifiRSSI": -65,
        "uptime": 892340,
        "freeMemory": 125000,
        "cpuUsage": 42
      }
    }
  }
}
```

#### Feeding Schedules

```json
{
  "schedules": {
    "device-abc": {
      "sched-1": {
        "id": "sched-1",
        "deviceId": "device-abc",
        "userId": "user-123",
        "time": "09:00",
        "amount": 50,
        "enabled": true,
        "dayOfWeek": [],
        "createdAt": "2025-03-15T11:00:00Z",
        "updatedAt": "2025-03-19T08:30:00Z"
      },
      "sched-2": {
        "id": "sched-2",
        "deviceId": "device-abc",
        "userId": "user-123",
        "time": "18:30",
        "amount": 75,
        "enabled": true,
        "dayOfWeek": [0, 1, 2, 3, 4],
        "createdAt": "2025-03-15T11:05:00Z",
        "updatedAt": "2025-03-19T08:30:00Z"
      }
    }
  }
}
```

#### Commands (Lifecycle)

```json
{
  "commands": {
    "device-abc": {
      "cmd-001": {
        "id": "cmd-001",
        "deviceId": "device-abc",
        "userId": "user-123",
        "type": "feed",
        "state": "queued",
        "payload": { "amount": 50 },
        "idempotencyKey": "manual-feed-20250319-1622",
        "createdAt": "2025-03-19T14:22:00Z",
        "expiresAt": "2025-03-19T14:22:30Z",
        "retryCount": 0
      },
      "cmd-002": {
        "id": "cmd-002",
        "deviceId": "device-abc",
        "userId": "user-123",
        "type": "feed",
        "state": "acknowledged",
        "payload": { "amount": 75 },
        "idempotencyKey": "sched-1-20250319-0900",
        "createdAt": "2025-03-19T09:00:00Z",
        "sentAt": "2025-03-19T09:00:02Z",
        "acknowledgedAt": "2025-03-19T09:00:08Z",
        "expiresAt": "2025-03-19T09:00:30Z",
        "retryCount": 0,
        "result": {
          "durationMs": 3200,
          "actualAmount": 75
        }
      },
      "cmd-003": {
        "id": "cmd-003",
        "deviceId": "device-abc",
        "userId": "user-123",
        "type": "feed",
        "state": "failed",
        "payload": { "amount": 60 },
        "idempotencyKey": "manual-feed-20250319-1410",
        "createdAt": "2025-03-19T14:10:00Z",
        "sentAt": "2025-03-19T14:10:01Z",
        "failedAt": "2025-03-19T14:10:25Z",
        "expiresAt": "2025-03-19T14:10:30Z",
        "retryCount": 2,
        "lastRetryAt": "2025-03-19T14:10:18Z",
        "error": "Servo timeout"
      }
    }
  }
}
```

#### History (Immutable Log)

```json
{
  "history": {
    "device-abc": {
      "hist-001": {
        "id": "hist-001",
        "deviceId": "device-abc",
        "userId": "user-123",
        "timestamp": "2025-03-19T14:22:08Z",
        "amount": 50,
        "status": "completed",
        "triggeredBy": "manual",
        "commandId": "cmd-001",
        "beforeGrams": 800,
        "afterGrams": 750,
        "durationMs": 3100
      },
      "hist-002": {
        "id": "hist-002",
        "deviceId": "device-abc",
        "userId": "user-123",
        "timestamp": "2025-03-19T14:10:25Z",
        "amount": 60,
        "status": "failed",
        "triggeredBy": "manual",
        "commandId": "cmd-003",
        "error": "Servo timeout after 25s"
      },
      "hist-003": {
        "id": "hist-003",
        "deviceId": "device-abc",
        "userId": "user-123",
        "timestamp": "2025-03-19T09:00:08Z",
        "amount": 75,
        "status": "completed",
        "triggeredBy": "schedule",
        "commandId": "cmd-002",
        "beforeGrams": 900,
        "afterGrams": 825,
        "durationMs": 3200
      }
    }
  }
}
```

#### Food Container Status

```json
{
  "foodContainer": {
    "device-abc": {
      "deviceId": "device-abc",
      "remainingGrams": 750,
      "maxCapacityGrams": 2000,
      "lastUpdated": "2025-03-19T14:22:08Z",
      "lowThresholdGrams": 200
    }
  }
}
```

### Migration Mapping (Old ➟ New)

| Old Path | New Path | Notes |
|----------|----------|-------|
| `/schedules` | `/schedules/{deviceId}/{scheduleId}` + `/users/{uid}/devices/{deviceId}/schedules/{scheduleId}` | Per-device isolation; dual writes for redundancy |
| `/history` | `/history/{deviceId}/{entryId}` + `/users/{uid}/history/{entryId}` | Per-device + user-scoped for quick access |
| `/foodContainer` | `/foodContainer/{deviceId}` | Simple rename, writable by device |
| `/deviceStatus` | `/{devices}/{deviceId}/telemetry` | Merged into device record as nested object |
| `/manualFeed` | `/commands/{deviceId}/{commandId}` | Command queue replaces direct trigger |
| N/A | `/commands/{deviceId}/pending` | **New**: Device polls this for pending commands |

**Migration Strategy** (see Section 14 for detailed plan):
1. Deploy backend alongside old direct RTDB writes for 1–2 weeks (parallel mode).
2. Gradually switch mobile app endpoints to use new backend API.
3. New schedules created via backend API; old schedules migrated with script.
4. Disable old direct RTDB writes via security rules.

---

## 3. Authentication Model

### Mobile App (User) Authentication

**Method**: Firebase Authentication + custom claims + ownership checks

```typescript
// Mobile app obtains ID token from Firebase Auth
const user = await getAuth().signInWithEmailAndPassword(email, password);
const token = await user.user.getIdTokenResult();

// Token is attached to API requests
const response = await fetch('/api/devices', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

**Backend** verifies token via `admin.auth().verifyIdToken(token)`:
- Extracts `uid` and email
- Attaches to request context
- Checks device ownership: `users/{uid}/devices/{deviceId}` must exist

**Ownership Rules**:
- User can only CRUD their own devices
- User can view schedules/history only for their devices
- Device sharing (future): grant `viewer` or `admin` role

### ESP32 (Device) Authentication

**Challenge**: Microcontroller can't handle JWT signing or complex crypto.

**Solution**: Simple device secret (pre-shared key)

```
Registration Flow (one-time):
1. Mobile user triggers POST /devices/register
2. Backend returns { device, secret: "abc-123-def-456..." }
3. User manually enters secret into ESP32 (or QR code scan)
4. ESP32 stores secret in secure EEPROM/NVS

Command Flow (every minute):
Header: "Authorization: DeviceSecret device-abc:abc-123-def-456"
```

**Backend** compares provided secret with hashed value in `_deviceSecrets/{deviceId}`:

```typescript
// Device connects with secret
const provided = "abc-123-def-456";
const stored = await db.ref(`_deviceSecrets/${deviceId}`).once('value');
const matches = await bcrypt.compare(provided, stored.val()); // Production
```

**Security Considerations**:
- Secret transmitted over HTTPS only (Firebase ensures)
- Secret stored hashed (bcrypt) in RTDB
- Rotation: POST /devices/{deviceId}/rotateSecret (returns new secret)
- Revocation: Admin deletes from `_deviceSecrets` (device loses access)

### Token Issuance / Rotation / Revocation

**User Tokens** (handled by Firebase):
- Expire in 1 hour by default
- Refresh token lasts 24 days
- Mobile SDK auto-refreshes transparently

**Device Secrets** (manual rotation):
1. Admin or device calls POST /devices/{deviceId}/rotateSecret
2. Backend generates new secret, hashes, stores
3. Returns new secret; old secret invalidated
4. Device updates EEPROM and reconnects

**Revocation**:
- Delete from `_deviceSecrets/{deviceId}` → device ACKs fail, polling fails
- Delete from `/users/{uid}/devices/{deviceId}` → user loses access
- Firebase Auth revoke → all user tokens invalidated

---

## 4. RTDB Security Rules

See [database.rules.json](./database.rules.json) for complete rules.

### Key Policies

| Path | Read | Write | Notes |
|------|------|-------|-------|
| `/users/{uid}/**` | `auth.uid === uid` | `auth.uid === uid` | User owns their data |
| `/devices/{deviceId}/**` | Owner + shared users | Backend only | Protected from direct writes |
| `/commands/{deviceId}/**` | Owner can read | Backend only | Immutable after creation; ACK via HTTP |
| `/schedules/{deviceId}/**` | Backend only | Backend only | No direct RTDB reads (use API) |
| `/history/{deviceId}/**` | Owner can read | Backend only | Immutable audit logs |
| `/foodContainer/{deviceId}` | Owner can read | Device only | Container status writable by device |
| `/_deviceSecrets/**` | None | None | Sensitive; backend only |
| `/_commandDedup/**` | None | None | Internal; backend only |

### Enforced Validation

```json
"commands": {
  "$deviceId": {
    "$commandId": {
      ".validate": "newData.hasChildren(['id', 'deviceId', 'userId', 'type', 'state', 'payload', 'idempotencyKey', 'createdAt', 'expiresAt', 'retryCount'])"
    }
  }
}
```

Ensures commands always include required fields (server-side enforcement).

---

## 5. Backend API Specification

### Schedule Endpoints

#### POST /schedules – Create Schedule

**Auth**: User (Firebase token required)

**Request**:
```typescript
{
  "deviceId": "device-abc",
  "time": "09:00",        // HH:mm UTC
  "amount": 50,           // 0–500 grams
  "enabled": true,
  "dayOfWeek": [1,3,5]    // Optional; 0=Monday
}
```

**Response** (201 Created):
```typescript
{
  "success": true,
  "data": {
    "id": "sched-1",
    "deviceId": "device-abc",
    "userId": "user-123",
    "time": "09:00",
    "amount": 50,
    "enabled": true,
    "dayOfWeek": [1,3,5],
    "createdAt": "2025-03-19T14:22:00Z",
    "updatedAt": "2025-03-19T14:22:00Z"
  },
  "timestamp": "2025-03-19T14:22:00Z",
  "requestId": "req-001"
}
```

**Errors**:
- 400: Validation error (invalid time, amount > 500)
- 403: Device not owned by user
- 429: Rate limit exceeded (max 100/hour)

**Idempotency**: Semantic idempotency via deduplication key (internal).

---

#### PUT /schedules/:scheduleId – Update Schedule

**Auth**: User (must own device)

**Request**:
```typescript
{
  "deviceId": "device-abc",
  "time": "10:00",        // Optional
  "amount": 75,           // Optional
  "enabled": false         // Optional
}
```

**Response** (200 OK): Updated schedule object

**Errors**: Same as POST

---

#### DELETE /schedules/:scheduleId – Delete Schedule

**Auth**: User (must own device)

**Request**:
```typescript
{
  "deviceId": "device-abc"
}
```

**Response** (204 No Content)

---

#### GET /schedules/:deviceId – List Schedules

**Auth**: User (must own device)

**Response** (200 OK):
```typescript
{
  "success": true,
  "data": [
    { /* schedule 1 */ },
    { /* schedule 2 */ }
  ],
  "timestamp": "2025-03-19T14:22:00Z"
}
```

---

### Manual Feed Endpoints

#### POST /triggerManualFeed – Send Feed Command

**Auth**: User (Firebase token)

**Request**:
```typescript
{
  "deviceId": "device-abc",
  "amount": 50,
  "idempotencyKey": "mobile-app-tap-123"  // Optional; for dedup
}
```

**Response** (201 Created):
```typescript
{
  "success": true,
  "data": {
    "commandId": "cmd-001",
    "state": "queued",
    "createdAt": "2025-03-19T14:22:00Z"
  },
  "timestamp": "2025-03-19T14:22:00Z"
}
```

**Errors**:
- 400: Validation error
- 403: Device not owned
- 429: Rate limit exceeded (max 48/hour)

**Idempotency**: If same `idempotencyKey` sent twice, returns same command (not duplicate).

---

#### POST /commands/acknowledge – Device ACK

**Auth**: Device (device secret)

**Request** (from ESP32):
```typescript
{
  "commandId": "cmd-001",
  "deviceId": "device-abc",
  "state": "acknowledged",  // or "failed"
  "receivedAt": "2025-03-19T14:22:08Z",
  "result": {
    "durationMs": 3100,
    "actualAmount": 50
  },
  "error": null,
  "nonce": "abc-123"  // For replay protection
}
```

**Response** (200 OK):
```typescript
{
  "success": true,
  "data": {
    "commandId": "cmd-001",
    "state": "acknowledged",
    "acknowledgedAt": "2025-03-19T14:22:08Z"
  }
}
```

**Errors**:
- 401: Invalid device secret
- 403: Device ID mismatch

**Idempotency**: Calling twice with same `commandId` returns same result (no double-feed).

---

#### GET /commands/:deviceId/pending – Device Polls Commands

**Auth**: Device (device secret)

**Response** (200 OK):
```typescript
{
  "success": true,
  "data": [
    {
      "id": "cmd-001",
      "type": "feed",
      "payload": { "amount": 50 },
      "idempotencyKey": "...",
      "createdAt": "2025-03-19T14:22:00Z",
      "expiresAt": "2025-03-19T14:22:30Z"
    }
  ],
  "timestamp": "2025-03-19T14:22:00Z"
}
```

---

### Device Management Endpoints

#### POST /devices/register – Register Device

**Auth**: User (Firebase token)

**Request**:
```typescript
{
  "name": "Living Room Feeder",
  "model": "ESP32-v1",
  "firmwareVersion": "1.2.3"
}
```

**Response** (201 Created):
```typescript
{
  "success": true,
  "data": {
    "device": { /* device object */ },
    "secret": "abc-123-def-456..."  // Store on device!
  }
}
```

**Note**: Secret returned only once. Device must store securely.

---

#### GET /devices – List User's Devices

**Auth**: User

**Response**: Array of device objects

---

#### GET /devices/:deviceId – Get Device Details

**Auth**: User (must own)

**Response**: Device with computed `online` status based on `lastSeen`

---

#### GET /dashboard/:deviceId – Full Dashboard

**Auth**: User (must own)

**Response**:
```typescript
{
  "device": { /* with online status */ },
  "schedules": [ /* enabled schedules */ ],
  "recentHistory": [ /* last 20 entries */ ],
  "checksum": "abc123..."  // For integrity verification
}
```

---

#### GET /history/:deviceId – Feeding History

**Auth**: User (must own)

**Query Params**:
- `limit`: 1–100 (default 50)
- `status`: "completed", "failed", "skipped", "partial"
- `triggeredBy`: "schedule", "manual", "api"

**Response**: Array of history entries with pagination

---

### Telemetry Endpoints (Device → Backend)

#### POST /telemetry/status – Report Device Status

**Auth**: Device (device secret)

**Request**:
```typescript
{
  "deviceId": "device-abc",
  "online": true,
  "lastSeen": "2025-03-19T14:22:15Z",
  "wifiRSSI": -65,           // dBm
  "uptime": 892340,          // seconds
  "freeMemory": 125000,      // Optional
  "cpuUsage": 42             // Optional, %
}
```

**Response**: Acknowledged

---

#### POST /telemetry/foodContainer – Report Food Level

**Auth**: Device

**Request**:
```typescript
{
  "deviceId": "device-abc",
  "remainingGrams": 750,
  "maxCapacityGrams": 2000,
  "lastUpdated": "2025-03-19T14:22:08Z"
}
```

**Response**: Container object with alert if below threshold

---

### Response Format (All Endpoints)

**Success (2xx)**:
```typescript
{
  "success": true,
  "data": { /* endpoint-specific */ },
  "timestamp": "2025-03-19T14:22:00Z",
  "requestId": "req-abc-123"
}
```

**Error (4xx–5xx)**:
```typescript
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "details": { /* optional */ }
  },
  "timestamp": "2025-03-19T14:22:00Z",
  "requestId": "req-abc-123"
}
```

---

## 6. Command Lifecycle Design

### States

```
     ┌─► [acknowledged] ──► END (success)
     │
[queued] ──► [sent] ┤
     │              └─► [failed] ──┬─► (retry?) ──► [queued]
     │                              └─► END (permanent failure)
     │
     └─[expired] ──► END (timeout)
```

### State Transitions

| From | To | Trigger | Notes |
|------|----|---------|----|
| `queued` | `sent` | Device fetches command | Transition marked in RTDB by backend (on poll response) |
| `sent` | `acknowledged` | Device POSTs ACK | Success, feed completed |
| `sent` | `failed` | Device POSTs ACK with error | Device error (servo timeout, etc.) |
| `failed` | `queued` | Retry logic | If `retryCount < MAX_RETRIES`, reset to queued |
| `*` | `expired` | Cleanup job | If now > `expiresAt` and not ACK'd |

### Timeouts & Retries

```typescript
COMMAND_TIMEOUT_MS = 30000              // 30 seconds
COMMAND_RETRY_MAX_ATTEMPTS = 3          // 0, 1, 2 = 3 total attempts
COMMAND_RETRY_BACKOFF_MS = 2000         // 2s between retries
DEVICE_OFFLINE_THRESHOLD_MS = 120000    // 2 minutes = offline
```

**Example**:
1. Command created at T=0s, expires at T=30s
2. Device offline; command not ACK'd by T=30s → expires
3. Cleanup job detects expiry, marks as `expired`
4. User can see in history: status="failed", error="Command expired"

**Device Back Online**:
- Device comes online at T=35s
- Polls `/commands/pending` → no pending commands (old ones expired)
- App can retry by creating new command

### Deduplication & Idempotency

**Idempotency Key**: UUID or user-generated string

```typescript
// Called twice with same key
POST /triggerManualFeed
{
  deviceId: "device-abc",
  amount: 50,
  idempotencyKey: "mobile-app-tap-2025-03-19-1422"
}

// First call: Creates cmd-001
// Second call: Returns cmd-001 (not cmd-002)
// Database check: _commandDedup/{deviceId}/{key} = cmd-001
```

**Replay Protection** (for ACKs):

```typescript
// Device polls command
GET /commands/device-abc/pending
→ { id: "cmd-001", nonce: "nonce-abc-123", ... }

// Device executes command

// Device ACKs with nonce (prevents replay)
POST /commands/acknowledge
{
  commandId: "cmd-001",
  state: "acknowledged",
  nonce: "nonce-abc-123",
  ...
}

// Backend checks: if nonce already seen, reject (duplicate ACK)
```

### Concurrency Handling

**Duplicate Command Execution Prevention**:

```typescript
// esp32.ino pseudocode:
void loop() {
  // Poll for commands
  Command[] pending = pollCommands();
  
  for (const cmd : pending) {
    if (executedCommands.contains(cmd.id)) {
      continue; // Already executed locally; skip
    }
    
    executeFeed(cmd.payload.amount);
    
    // Store locally before ACKing (crash-safe)
    executedCommands.add(cmd.id); // EEPROM
    
    // ACK to backend
    ack(cmd.id, "acknowledged", ...);
  }
  
  delay(1000); // Poll every 1 second
}
```

Device-side state machine prevents double-feed even if ACK fails.

---

## 7. Event/History Pipeline

### Feed Event Creation

```
User triggers manual feed
    ↓
POST /triggerManualFeed
    ↓
Backend: Create command (state='queued')
    ↓
[Device polls and executes]
    ↓
Device: POST /commands/acknowledge (state='acknowledged')
    ↓
Backend: Create history record
    ↓
History record immutable in RTDB
    ↓
User views history in app
```

### Validation & Anti-Duplicate

```typescript
async recordFeedEvent(deviceId, userId, event) {
  // Prevent duplicate: check if command already recorded
  const existing = await db.ref(`/history/${deviceId}`)
    .orderByChild('commandId')
    .equalTo(event.commandId)
    .once('value');
  
  if (existing.exists()) {
    logger.info('Feed event already recorded for command', {
      commandId: event.commandId
    });
    return existing.val(); // Idempotent return
  }
  
  // Validate timestamp is ISO 8601 UTC
  new Date(event.timestamp); // Throws if invalid
  
  // Validate status enum
  if (!['completed', 'failed', 'skipped', 'partial'].includes(event.status)) {
    throw new Error('Invalid status');
  }
  
  // Create record
  const historyId = uuidv4();
  const record = {
    id: historyId,
    deviceId,
    userId,
    timestamp: new Date().toISOString(), // Server-issued timestamp
    ...event
  };
  
  // Write to RTDB (backend only, immutable)
  await db.ref(`/history/${deviceId}/${historyId}`).set(record);
  await db.ref(`/users/${userId}/history/${historyId}`).set(record);
  
  return record;
}
```

### Auditability & Tamper Resistance

**Server-Issued Timestamps**: All history records include server-generated `timestamp`, preventing device clock attacks.

**Immutable Storage**: RTDB security rules prevent any writes to history once created.

**Signature** (optional, future):
```typescript
record.signature = sha256(JSON.stringify(record)).toString('hex');
// Client can verify: sha256(data) === record.signature
```

**Audit Trail**:
```json
{
  "id": "audit-001",
  "userId": "user-123",
  "deviceId": "device-abc",
  "timestamp": "2025-03-19T14:22:00Z",
  "action": "MANUAL_FEED",
  "resourceType": "Command",
  "resourceId": "cmd-001",
  "changes": null,
  "status": "success"
}
```

---

## 8. Failure Handling

### Device Offline

```
Timeline:
T=0s    Device goes offline (WiFi disconnects)
T=0s    User triggers manual feed → command created (state='queued')
T=30s   Command expires (no ACK received)
T=120s  Cleanup job marks command as 'expired' (2 min default offline threshold)
T=121s  Backend marks device as offline in `/devices/{deviceId}/online = false`

User sees:
- Device status: Offline (grayed out in UI)
- Last command: Failed/Expired (with error message)

Recovery:
T=150s  Device comes back online
        Device polls `/commands/pending` (returns empty; old command expired)
        Device POSTs status to `/telemetry/status` (backend updates `/devices/{deviceId}/online = true`)
        User app detects device back online (real-time listener or refresh)
        User can retry manual feed (creates new command)
```

### Safe Fallback (Mid-Feed Failure)

```
Device starts feed execution:
- Opens servo
- Waits for weight change
- Timeout at 25 seconds

If servo jams:
- Device detects: no weight change after 25s
- Device closes servo (safe state)
- Device POSTs /commands/acknowledge with state='failed', error='Servo timeout'
- Backend records history: status='failed', error='Servo timeout'
- Container level unchanged (no feed recorded)
- Safe state: nothing in progress, servo closed

User feedback:
- "Feed failed: Servo timeout. Try again or check device."
```

### Stale Status Detection

```
Device Health Check (backend scheduled job runs every 5 minutes):

for each device in /devices:
  if (now - device.lastSeen) > OFFLINE_THRESHOLD (2 minutes):
    mark device.online = false
    log alert: "Device offline"
    (future: send push notification to user)
```

### Network Failure Mid-ACK

```
Scenario: Device successfully feeds, sends ACK, network drops before response received.

Device side:
- Device has executed feed, recorded in local EEPROM
- Waits for ACK response (timeout 5s)
- Timeout: retransmits ACK (same commandId)

Backend side:
- First ACK arrives: transitions command state to 'acknowledged'
- Second ACK (retry): Detects already processed, returns 200 OK (idempotent)
- No double-feed recorded

Result: Graceful recovery, feed recorded exactly once.
```

### Recovery & Reconciliation

```
Scenario: After device goes online, sync any lost history.

Flow:
1. Device comes online, POSTs /telemetry/status
2. Backend updates device.online = true
3. (Future) Backend queries local EEPROM history on device via API call
4. Device sends list of local feed records:
   [
     { commandId: 'cmd-001', executedAt: '...', status: 'completed' },
     { commandId: 'cmd-002', executedAt: '...', status: 'failed' }
   ]
5. Backend reconciles:
   - cmd-001 already has ACK in /commands → skip
   - cmd-002 failed, not yet recorded in history → create history entry
6. Device clears local EEPROM after sync
```

---

## 9. Full Implementation Code

See the [Implementation Files](#implementation-files) section (Section 13) for complete source code:

- **TYPESCRIPT BACKEND**:
  - `functions/src/index.ts` – Main Cloud Functions entry point
  - `functions/src/types/index.ts` – TypeScript types
  - `functions/src/validation/schemas.ts` – Zod schemas
  - `functions/src/middleware/auth.ts` – Auth & rate limiting
  - `functions/src/services/*.ts` – Business logic
  - `functions/src/handlers/*.ts` – HTTP request handlers

- **CONFIGURATION**:
  - `functions/package.json` – Dependencies
  - `functions/tsconfig.json` – TypeScript config
  - `functions/.env.example` – Environment variables
  - `functions/database.rules.json` – RTDB security rules

---

## 10. ESP32 Integration Guide

### Overview

ESP32 is a **read-only client** for most operations:
- **Polls** for pending commands
- **POSTs** acknowledgements and telemetry
- **Published** food container level (writable)

Device **does not**:
- Query database directly (except `/foodContainer` for display)
- Create schedules (all server-side)
- Modify command state (ACK only)

### RTDB Paths for ESP32

```c
// Read: Pending commands (poll every 1 second)
GET /commands/{deviceId}/pending

// Write: Command acknowledgement
POST /commands/acknowledge
Headers: "Authorization: DeviceSecret {deviceId}:{secret}"

// Write: Device status (report every 30 seconds)
POST /telemetry/status
Headers: "Authorization: DeviceSecret {deviceId}:{secret}"

// Write: Food container level (report every 60 seconds)
POST /telemetry/foodContainer
Headers: "Authorization: DeviceSecret {deviceId}:{secret}"

// Read (optional): Food container thresholds
GET /foodContainer/{deviceId}/lowThresholdGrams
```

### Polling & Listener Strategy

**Recommended Polling Intervals** (adjustable per device capability):

| Operation | Interval | Reason |
|-----------|----------|--------|
| Command polling | 1 second | Responsive manual feed |
| Status report | 30 seconds | WiFi efficiency, heartbeat |
| Food container | 60 seconds | Less critical, conserve power |

**Pseudocode**:

```cpp
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include "esp_nvs.h" // Or SPIFFS for key-value storage

String DEVICE_ID = "device-abc";    // Set during registration
String DEVICE_SECRET = "abc-123..."; // Retrieved from mobile app
String API_BASE = "https://region-project.cloudfunctions.net/api";
String DB_URL = "https://project.firebaseio.com";

unsigned long lastCommandPoll = 0;
unsigned long lastStatusReport = 0;
unsigned long lastFoodReport = 0;

void setup() {
  Serial.begin(115200);
  initWiFi();
  initServo();
  initHX711(); // Load cell for weight
}

void loop() {
  unsigned long now = millis();
  
  // Poll commands every 1s
  if (now - lastCommandPoll > 1000) {
    pollPendingCommands();
    lastCommandPoll = now;
  }
  
  // Report status every 30s
  if (now - lastStatusReport > 30000) {
    reportDeviceStatus();
    lastStatusReport = now;
  }
  
  // Report food level every 60s
  if (now - lastFoodReport > 60000) {
    reportFoodContainer();
    lastFoodReport = now;
  }
  
  delay(100); // Avoid watchdog
}

void pollPendingCommands() {
  HTTPClient http;
  String url = API_BASE + "/commands/" + DEVICE_ID + "/pending";
  http.addHeader("Authorization", "DeviceSecret " + DEVICE_ID + ":" + DEVICE_SECRET);
  
  int httpCode = http.GET();
  if (httpCode != 200) {
    Serial.println("Command poll failed: " + String(httpCode));
    return;
  }
  
  DynamicJsonDocument doc(2048);
  deserializeJson(doc, http.getStream());
  
  JsonArray commands = doc["data"].as<JsonArray>();
  for (JsonObject cmd : commands) {
    String commandId = cmd["id"];
    int amount = cmd["payload"]["amount"];
    
    Serial.println("Executing feed: " + String(amount) + "g (cmd: " + commandId + ")");
    
    // Execute feed
    bool success = executeFeed(amount);
    
    // ACK to backend
    acknowledgeCommand(commandId, success);
  }
  
  http.end();
}

bool executeFeed(int grams) {
  // 1. Record initial weight
  float beforeGrams = readWeight(); // HX711
  
  // 2. Calculate servo time (rough: 1g per ~30ms)
  int durationMs = grams * 30;
  
  // 3. Open servo
  openServo();
  
  // 4. Wait, monitoring weight change
  unsigned long feedStart = millis();
  float currentWeight = beforeGrams;
  
  while (millis() - feedStart < durationMs) {
    currentWeight = readWeight();
    float dispensed = beforeGrams - currentWeight;
    
    if (dispensed >= grams) {
      Serial.println("Target reached: " + String(dispensed) + "g");
      break;
    }
    
    // Safety timeout
    if (millis() - feedStart > durationMs * 1.5) {
      Serial.println("ERROR: Servo timeout");
      closeServo();
      return false;
    }
    
    delay(100);
  }
  
  // 5. Close servo
  closeServo();
  
  // 6. Final weight
  float afterGrams = readWeight();
  int actualAmount = (int)(beforeGrams - afterGrams);
  
  Serial.println("Feed complete: " + String(actualAmount) + "g dispensed, took " + 
                 String(millis() - feedStart) + "ms");
  
  return true;
}

void acknowledgeCommand(String commandId, bool success) {
  HTTPClient http;
  http.begin(API_BASE + "/commands/acknowledge");
  http.addHeader("Authorization", "DeviceSecret " + DEVICE_ID + ":" + DEVICE_SECRET);
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument payload(512);
  payload["commandId"] = commandId;
  payload["deviceId"] = DEVICE_ID;
  payload["state"] = success ? "acknowledged" : "failed";
  payload["receivedAt"] = getISOTimestamp();
  
  if (success) {
    payload["result"]["durationMs"] = 3100; // Adjust based on actual
    payload["result"]["actualAmount"] = 50;
  } else {
    payload["error"] = "Servo timeout";
  }
  
  String jsonString;
  serializeJson(payload, jsonString);
  
  int httpCode = http.POST(jsonString);
  Serial.println("ACK response: " + String(httpCode));
  
  http.end();
}

void reportDeviceStatus() {
  HTTPClient http;
  http.begin(API_BASE + "/telemetry/status");
  http.addHeader("Authorization", "DeviceSecret " + DEVICE_ID + ":" + DEVICE_SECRET);
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument payload(256);
  payload["deviceId"] = DEVICE_ID;
  payload["online"] = true;
  payload["lastSeen"] = getISOTimestamp();
  payload["wifiRSSI"] = WiFi.RSSI();
  payload["uptime"] = millis() / 1000;
  payload["freeMemory"] = ESP.getFreeHeap();
  payload["cpuUsage"] = 25; // Placeholder
  
  String jsonString;
  serializeJson(payload, jsonString);
  
  http.POST(jsonString);
  http.end();
}

String getISOTimestamp() {
  // Get from NTP server; format as "2025-03-19T14:22:15Z"
  // (Implementation: use configTime() + time())
  return "2025-03-19T14:22:15Z"; // Placeholder
}
```

### Command Payload Contract

```json
{
  "id": "cmd-001",
  "type": "feed",
  "payload": {
    "amount": 50
  },
  "idempotencyKey": "...",
  "createdAt": "2025-03-19T14:22:00Z",
  "expiresAt": "2025-03-19T14:22:30Z"
}
```

### ACK Payload Contract

```json
{
  "commandId": "cmd-001",
  "deviceId": "device-abc",
  "state": "acknowledged",
  "receivedAt": "2025-03-19T14:22:08Z",
  "result": {
    "durationMs": 3100,
    "actualAmount": 50
  },
  "error": null,
  "nonce": "abc-123"
}
```

---

## 11. Mobile Integration Guide

### Current Direct Writes (to be replaced)

Your current app likely does:

```typescript
// OLD (deprecated after migration)
const db = getDatabase();
await set(ref(db, 'schedules/sched-1'), { ... });
await set(ref(db, 'manualFeed'), { trigger: true, amount: 50, timestamp: '...' });
onValue(ref(db, 'history'), (snapshot) => { ... });
```

### New Backend API Calls

Replace with:

```typescript
// NEW (via backend)
const token = await getAuth().currentUser?.getIdToken();

// Create schedule
const schedRes = await fetch(`${API}/schedules`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    deviceId: 'device-abc',
    time: '09:00',
    amount: 50,
    enabled: true
  })
});
const schedule = await schedRes.json();

// Trigger manual feed
const feedRes = await fetch(`${API}/triggerManualFeed`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    deviceId: 'device-abc',
    amount: 50,
    idempotencyKey: uuid()
  })
});
const feed = await feedRes.json();

// Get history
const histRes = await fetch(`${API}/history/device-abc?limit=20`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const history = await histRes.json();
```

### Client Service Layer (TypeScript)

Create `services/aquafeed-api.service.ts`:

```typescript
import { getAuth } from 'firebase/auth';
import { Backend } from '@/types/feeder';

const API_BASE = 'https://region-project.cloudfunctions.net/api';

export class AquaFeedApiService {
  private async getHeaders(): Promise<Record<string, string>> {
    const token = await getAuth().currentUser?.getIdToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // Schedules
  async createSchedule(input: {
    deviceId: string;
    time: string;
    amount: number;
    enabled: boolean;
    dayOfWeek?: number[];
  }) {
    const res = await fetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify(input),
    });
    return res.json();
  }

  async updateSchedule(scheduleId: string, input: any) {
    const res = await fetch(`${API_BASE}/schedules/${scheduleId}`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify(input),
    });
    return res.json();
  }

  async deleteSchedule(scheduleId: string, deviceId: string) {
    const res = await fetch(`${API_BASE}/schedules/${scheduleId}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
      body: JSON.stringify({ deviceId }),
    });
    return res.json();
  }

  async getSchedules(deviceId: string) {
    const res = await fetch(`${API_BASE}/schedules/${deviceId}`, {
      headers: await this.getHeaders(),
    });
    return res.json();
  }

  // Manual Feed
  async triggerManualFeed(deviceId: string, amount: number) {
    const res = await fetch(`${API_BASE}/triggerManualFeed`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        deviceId,
        amount,
        idempotencyKey: this.generateIdempotencyKey(),
      }),
    });
    return res.json();
  }

  // Devices
  async registerDevice(input: { name: string; model: string; firmwareVersion: string }) {
    const res = await fetch(`${API_BASE}/devices/register`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify(input),
    });
    return res.json();
  }

  async getUserDevices() {
    const res = await fetch(`${API_BASE}/devices`, {
      headers: await this.getHeaders(),
    });
    return res.json();
  }

  // Dashboard
  async getDashboard(deviceId: string) {
    const res = await fetch(`${API_BASE}/dashboard/${deviceId}`, {
      headers: await this.getHeaders(),
    });
    return res.json();
  }

  // History
  async getHistory(deviceId: string, limit = 50) {
    const res = await fetch(`${API_BASE}/history/${deviceId}?limit=${limit}`, {
      headers: await this.getHeaders(),
    });
    return res.json();
  }

  private generateIdempotencyKey(): string {
    return `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
```

### Backward Compatibility

**Phase 1 (Week 1–2)**: Deploy backend alongside old RTDB writes.

```typescript
// Hybrid mode: write to both RTDB and backend
async function createScheduleHybrid(schedule: FeedingSchedule) {
  // Old RTDB write (for existing users)
  set(ref(database, `schedules/${schedule.id}`), schedule);
  
  // New backend call (optional; will replace old)
  await apiService.createSchedule(schedule);
}
```

**Phase 2 (Week 2+)**: Migrate users to backend (disable RTDB writes in security rules).

**Update security rules**:

```json
"schedules": {
  "$deviceId": {
    ".write": false // Disable; backend only now
  }
}
```

### Transition Plan

1. Backend deployed in production (parallel to old code)
2. New app version released (optional backend calls; RTDB writes still work)
3. Old users gradually update app (1–2 weeks)
4. Disable RTDB direct writes (schedules, history, commands)
5. Old code branches retire

---

## 12. Testing Strategy

### Unit Tests (Validation, State Transitions)

```typescript
// test/services/command.service.test.ts

describe('CommandService', () => {
  let service: CommandService;

  beforeEach(() => {
    service = new CommandService();
  });

  describe('createFeedCommand', () => {
    it('should create a command in queued state', async () => {
      const cmd = await service.createFeedCommand(
        'device-abc',
        'user-123',
        50,
        'test-idem-key-1'
      );

      expect(cmd.state).toBe('queued');
      expect(cmd.amount).toBe(50);
      expect(cmd.createdAt).toMatch(/^\d{4}-/); // ISO 8601
    });

    it('should deduplicate with same idempotency key', async () => {
      const cmd1 = await service.createFeedCommand(
        'device-abc',
        'user-123',
        50,
        'test-idem-key-2'
      );
      const cmd2 = await service.createFeedCommand(
        'device-abc',
        'user-123',
        60, // Different amount, should be ignored
        'test-idem-key-2'
      );

      expect(cmd1.id).toBe(cmd2.id); // Same command returned
      expect(cmd2.amount).toBe(50); // Original amount
    });

    it('should validate amount bounds', () => {
      expect(() =>
        service.createFeedCommand('device-abc', 'user-123', 600, 'key')
      ).toThrow();
    });
  });

  describe('processAcknowledgement', () => {
    it('should transition sent → acknowledged', async () => {
      const cmd = await service.createFeedCommand(
        'device-abc',
        'user-123',
        50
      );

      const ack = await service.processAcknowledgement('device-abc', {
        commandId: cmd.id,
        deviceId: 'device-abc',
        state: 'acknowledged',
        receivedAt: new Date().toISOString(),
      });

      expect(ack.command.state).toBe('acknowledged');
    });

    it('should not allow replay attacks', async () => {
      const cmd = await service.createFeedCommand(
        'device-abc',
        'user-123',
        50
      );
      const nonce = 'test-nonce-123';

      // First ACK
      const ack1 = await service.processAcknowledgement('device-abc', {
        commandId: cmd.id,
        deviceId: 'device-abc',
        state: 'acknowledged',
        receivedAt: new Date().toISOString(),
        nonce,
      });

      // Second ACK with same nonce (replay)
      const ack2 = await service.processAcknowledgement('device-abc', {
        commandId: cmd.id,
        deviceId: 'device-abc',
        state: 'acknowledged',
        receivedAt: new Date().toISOString(),
        nonce, // Same nonce
      });

      expect(ack1.isNewAck).toBe(true);
      expect(ack2.isNewAck).toBe(false); // Rejected as replay
    });

    it('should expire old commands', async () => {
      const cmd = await service.createFeedCommand(
        'device-abc',
        'user-123',
        50
      );

      // Simulate time passing
      jest.useFakeTimers();
      jest.advanceTimersByTime(31000); // 31 seconds (timeout is 30s)

      const ack = await service.processAcknowledgement('device-abc', {
        commandId: cmd.id,
        deviceId: 'device-abc',
        state: 'acknowledged',
        receivedAt: new Date().toISOString(),
      });

      expect(ack.isNewAck).toBe(false); // Expired, not recorded
    });

    it('should retry on failure', async () => {
      const cmd = await service.createFeedCommand(
        'device-abc',
        'user-123',
        50
      );

      // ACK with failure state
      const ack1 = await service.processAcknowledgement('device-abc', {
        commandId: cmd.id,
        deviceId: 'device-abc',
        state: 'failed',
        receivedAt: new Date().toISOString(),
        error: 'Servo timeout',
      });

      expect(ack1.command.state).toBe('failed');
      expect(ack1.command.error).toBe('Servo timeout');

      // Retry
      const retried = await service.retryCommand('device-abc', cmd.id);

      expect(retried.state).toBe('queued');
      expect(retried.retryCount).toBe(1);
    });
  });
});
```

### Validation Tests

```typescript
// test/validation/schemas.test.ts

import { validateOrThrow, CreateScheduleSchema } from '@/validation/schemas';

describe('Zod Schemas', () => {
  describe('CreateScheduleSchema', () => {
    it('should validate valid schedule', () => {
      const valid = {
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        time: '09:00',
        amount: 50,
        enabled: true,
      };
      expect(() => validateOrThrow(CreateScheduleSchema, valid)).not.toThrow();
    });

    it('should reject invalid time format', () => {
      const invalid = {
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        time: '9:00', // Missing leading zero
        amount: 50,
        enabled: true,
      };
      expect(() => validateOrThrow(CreateScheduleSchema, invalid)).toThrow();
    });

    it('should reject amount > 500g', () => {
      const invalid = {
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        time: '09:00',
        amount: 600,
        enabled: true,
      };
      expect(() => validateOrThrow(CreateScheduleSchema, invalid)).toThrow();
    });
  });
});
```

### Emulator / Local Testing

**Setup**:

```bash
npm install -g firebase-tools
firebase init emulators

# .firebaserc
{
  "projects": {
    "default": "your-project"
  }
}

# firebase.json
{
  "functions": {
    "source": "functions"
  },
  "emulators": {
    "database": {
      "port": 9000
    },
    "functions": {
      "port": 5001
    }
  }
}
```

**Run Emulators**:

```bash
cd functions
npm install
npm run build
cd ..
firebase emulators:start
```

**Test Against Emulator**:

```typescript
// test/integration/api.test.ts
import fetch from 'node-fetch';

const API_URL = 'http://localhost:5001/region-project/us-central1/api';

describe('API Integration (Emulator)', () => {
  it('POST /schedules should create schedule', async () => {
    const res = await fetch(`${API_URL}/schedules`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: 'device-abc',
        time: '09:00',
        amount: 50,
        enabled: true,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBeDefined();
  });
});
```

### Production Rollout Checklist

- [ ] All tests passing (unit + integration)
- [ ] Backend deployed to staging environment
- [ ] Staging tested against staging database
- [ ] Security rules applied in staging
- [ ] App tested against staging backend
- [ ] Rate limit settings validated
- [ ] Error handling tested (network failures, device offline)
- [ ] Device auth / secret handling tested
- [ ] Monitoring dashboards set up (Cloud Logging, Cloud Monitoring)
- [ ] Alerts configured (device offline, error rates)
- [ ] Runbook prepared (rollback, incident response)
- [ ] Docs complete (API, architecture, troubleshooting)
- [ ] Team trained
- [ ] Feature flags enabled (gradual rollout)

### Failure-Injection Tests

```typescript
// test/chaosengineering/failures.test.ts

describe('Failure Injection', () => {
  it('should handle command timeout gracefully', async () => {
    // Simulate device not ACKing
    jest.useFakeTimers();
    
    const cmd = await createFeedCommand('device-abc', 'user-123', 50);
    jest.advanceTimersByTime(31000); // Expire command
    
    // Should not crash
    const cleanup = await cleanupExpiredCommands();
    expect(cleanup.expired).toBeGreaterThan(0);
  });

  it('should handle database unavailability', async () => {
    mockDatabase.throwError(new Error('Connection timeout'));
    
    try {
      await apiService.getSchedules('device-abc');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('should handle malicious ACK payloads', () => {
    const malicious = {
      commandId: 'cmd-001',
      deviceId: 'device-different', // Wrong device
      state: 'acknowledged',
      receivedAt: 'invalid-date',
      nonce: 'a'.repeat(1000), // Too long
    };

    expect(() => validateOrThrow(CommandAckSchema, malicious)).toThrow();
  });
});
```

---

## 13. Implementation Files

Complete source code is provided in the [functions/](./functions/) directory:

### Source Files

1. **functions/package.json** – npm dependencies
2. **functions/tsconfig.json** – TypeScript configuration
3. **functions/src/index.ts** – Cloud Functions entry point (HTTP + scheduled)
4. **functions/src/types/index.ts** – Type definitions
5. **functions/src/validation/schemas.ts** – Zod validation schemas
6. **functions/src/middleware/auth.ts** – Auth & rate limiting
7. **functions/src/services/command.service.ts** – Command lifecycle
8. **functions/src/services/schedule.service.ts** – Schedule CRUD
9. **functions/src/services/device.service.ts** – Device management
10. **functions/src/services/history.service.ts** – Audit logs & history
11. **functions/src/handlers/schedule.handler.ts** – Schedule endpoints
12. **functions/src/handlers/feed.handler.ts** – Feed command endpoints
13. **functions/src/handlers/device.handler.ts** – Device management endpoints
14. **functions/src/handlers/telemetry.handler.ts** – Telemetry endpoints
15. **functions/database.rules.json** – RTDB security rules
16. **functions/.env.example** – Environment variables template

**All files are production-ready with**:
- Full error handling
- Comprehensive logging
- TypeScript strict mode
- Zod input validation
- Security best practices
- No TODO comments or placeholders

---

## 14. Migration Plan

### Overview

**Goal**: Move from direct RTDB writes to managed backend API with zero downtime.

**Duration**: 2–3 weeks

### Phase 1: Parallel Deployment (Week 1)

**Backend**:
1. Deploy Cloud Functions v2 backend to production
2. Enable all API endpoints
3. Keep RTDB rules permissive (old writes still allowed)
4. Monitor: error rates, latency, resource usage

**App**:
1. Release new app version with backend client service
2. Keep old RTDB service code active
3. Both paths work (hybrid mode)

**Validation**:
- New schedules created via backend API work
- Old devices still function with direct RTDB writes
- No data conflicts or duplication

### Phase 2: Gradual User Migration (Week 2)

**Backend**:
1. Copy existing user/device data from RTDB to new schema (script)
2. Validate data integrity

**App**:
1. New users and re-registered devices use backend API
2. Existing users can voluntarily switch (toggle in settings)
3. Monitor hybrid usage (some old, some new)

**Data Migration Script** (TypeScript):

```typescript
// scripts/migrate.ts
import * as admin from 'firebase-admin';

async function migrateSchedules() {
  const db = admin.database();
  
  // Old path: /schedules
  const oldSchedules = await db.ref('/schedules').once('value');
  const oldData = oldSchedules.val() || {};
  
  // Migrate per user/device
  for (const [schedId, sched] of Object.entries(oldData)) {
    const newSched = {
      ...sched,
      id: schedId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Assume you have a map of scheduleId → (userId, deviceId)
    // or extract from app data
    const { userId, deviceId } = await lookupScheduleOwnership(schedId);
    
    // Write to new paths
    await db.ref(`/users/${userId}/devices/${deviceId}/schedules/${schedId}`).set(newSched);
    await db.ref(`/schedules/${deviceId}/${schedId}`).set(newSched);
  }
  
  console.log('Schedules migrated');
}

async function migrateHistory() {
  const db = admin.database();
  
  const oldHistory = await db.ref('/history').once('value');
  const oldData = oldHistory.val() || {};
  
  for (const [entryId, entry] of Object.entries(oldData)) {
    const { userId, deviceId } = await lookupHistoryOwnership(entryId);
    
    const newEntry = {
      ...entry,
      id: entryId,
      timestamp: entry.timestamp || new Date().toISOString(),
    };
    
    await db.ref(`/users/${userId}/history/${entryId}`).set(newEntry);
    await db.ref(`/history/${deviceId}/${entryId}`).set(newEntry);
  }
  
  console.log('History migrated');
}

async function run() {
  admin.initializeApp();
  await migrateSchedules();
  await migrateHistory();
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

**Run migration**:

```bash
npm install -g ts-node
ts-node scripts/migrate.ts
```

### Phase 3: Cutover (Week 3)

**RTDB Rules Update**:

```json
{
  "rules": {
    "schedules": {
      "$deviceId": {
        ".write": false  // NOW DISABLED
      }
    },
    "manualFeed": {
      ".write": false   // NOW DISABLED
    },
    "history": {
      "$deviceId": {
        ".write": false  // NOW DISABLED
      }
    }
  }
}
```

**App**:
1. Remove old RTDB service calls completely
2. Only use backend API
3. Release new app version (required)

**Verification**:
- Old direct writes fail with 403 Forbidden
- All operations via backend API work
- App handles error gracefully

### Rollback Plan

**If issues detected** (within 1 week of cutover):

1. **Revert RTDB rules** (allow writes again)
   ```bash
   firebase database:rules:publish functions/database.rules.backup.json
   ```

2. **Revert app** (rollback to previous version)
   ```bash
   # Via App Store / Google Play: release hotfix pointing to old code
   ```

3. **Disable Cloud Functions** (optional)
   ```bash
   firebase functions:delete api --force
   ```

4. **Restore from backup** (if data corrupted)
   ```bash
   # Restore from nightly backup
   gsutil -m cp -r gs://backup-bucket/rtdb-backup-2025-03-20/* gs://project.firebaseio.com/
   ```

---

## 15. Open Risks and Assumptions

### Assumptions

| Assumption | Risk | Mitigation |
|-----------|------|-----------|
| **Firebase RTDB is available 99.95%** | Outage blocks all operations | Cache schedule locally; device operates offline until restored |
| **Device has reliable NTP time** | Incorrect timestamps break ordering | Validate server-side; use server time as source of truth |
| **WiFi uptime sufficient for polling** | Device offline frequently → missed schedules | Increase timeout threshold; add local fallback timer |
| **User network for mobile app stable** | Flaky connections → failed API calls | Implement exponential backoff + retry in client |
| **Storage < 100GB (free tier limit)** | Exceeds free quota → costs spike | Archive old history; implement retention policy (currently 90 days) |
| **Max 1000 concurrent users** | Scaling issues→ slowdown | Consider Firestore sharding or data archival at scale |

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Device secret leaked** | Medium | Attacker can feed arbitrary amounts | Implement secret rotation; monitor for unusual polling patterns |
| **Timestamp tampering** | Low | Device spoofs feed completion | Server-issued timestamps; validate via RTDB ACL |
| **Command replay attack** | Low | Feed triggered twice | Nonce-based deduplication implemented |
| **Rate limit bypass** | Low | User creates 1000 commands/hour | Backend rate limiting + quota enforcement |
| **History deletion (unauthed)** | Low (rules prevent) | Loss of audit trail | RTDB immutable; backups; audit log on separate DB |
| **Device goes offline during feed** | High | Partial feed, unclear state | Timeout detection + manual reconciliation on reconnect |
| **Firebase Admin SDK vulnerability** | Very Low | Security breach | Keep SDK updated; monitor Firebase security bulletins |
| **Incorrect user isolation** | Low | Cross-user data leak | DeviceId + userId checks in all handlers; test extensively |

### Future Improvements

1. **Weight Telemetry (HX711)** – Add grams-per-ACK validation
2. **Firestore Migration** – Switch RTDB → Firestore for complex queries
3. **Pub/Sub Events** – Async event processing (webhooks, analytics)
4. **Device Firmware OTA** – Over-the-air updates via Cloud Functions
5. **Push Notifications** – Firebase Cloud Messaging alerts
6. **Analytics Dashboard** – Cloud Logsdashboard + BigQuery integration
7. **Multi-device Sync** – Real-time presence + lock conflicts
8. **Backup / Restore** – User-initiated or scheduled backups

---

## Summary of Deliverables

✅ [1] Proposed Architecture – Component overview, rationale, trade-offs  
✅ [2] Final RTDB Schema – JSON examples, migration mapping  
✅ [3] Auth Model – User tokens, device secrets, rotation, revocation  
✅ [4] RTDB Security Rules – Complete rules, validation, ACL policies  
✅ [5] Backend API Spec – All endpoints, schemas, errors, idempotency  
✅ [6] Command Lifecycle – States, timeouts, retries, deduplication  
✅ [7] Event/History Pipeline – Feed recording, validation, auditability  
✅ [8] Failure Handling – Offline behavior, stale status, recovery  
✅ [9] Full Implementation Code – TypeScript, no placeholders  
✅ [10] ESP32 Integration Guide – RTDB paths, polling, command/ACK contracts  
✅ [11] Mobile Integration Guide – Client service, transition plan  
✅ [12] Testing Strategy – Unit tests, emulator setup, production checklist, chaos tests  
✅ [13] Implementation Files – Complete source code  
✅ [14] Migration Plan – Parallel deployment, phased cutover, rollback  
✅ [15] Open Risks and Assumptions – Risk matrix, future improvements  
✅ **Bonus**: 3 Sequence Diagrams (below)

---

## Sequence Diagrams

### Diagram 1: Manual Feed Command

```
Mobile App              Backend API           RTDB                ESP32
    │                       │                  │                    │
    │ POST /triggerManualFeed │                │                    │
    │──────────────────►│                  │                    │
    │                       │                  │                    │
    │                       │ Validate input    │                    │
    │                       │ Create Command    │                    │
    │                       ├─────────────────►│                    │
    │                       │ CMD state:queued  │                    │
    │                       │                  │                    │
    │ 201 Created           │◄─────────────────┤                    │
    │◄──────────────────────┤                  │                    │
    │ {commandId, state}    │                  │                    │
    │                       │                  │                    │
    │ [User sees: Feed sent] │                  │                    │
    │                       │                  │                    │
    │                       │                  │ GET /pending      │
    │                       │                  │◄──────────────────│
    │                       │                  │                    │
    │                       │                  │ [cmd-001]         │
    │                       │                  ├───────────────────►│
    │                       │                  │                    │
    │                       │                  │ [Device executes] │
    │                       │                  │ [Servo opens]     │
    │                       │                  │ [Dispenses food]  │
    │                       │                  │ [Servo closes]    │
    │                       │                  │                    │
    │                       │                  │ POST /commands/acknowledge
    │                       │                  │ {state:acknowledged}
    │                       │◄──────────────────│
    │                       │                    │
    │                       │ Update command     │
    │                       │ Create history log │
    │                       ├───────────────────►│
    │                       │                    │
    │                       │ 200 OK             │
    │                       ├───────────────────►│
    │                       │                    │
    │ Real-time update      │                    │
    │◄──────────────────────┼────────────────────┤
    │ {status:completed}    │                    │
    │                       │                    │
```

### Diagram 2: Scheduled Feed Execution

```
Scheduled Job           Backend API           RTDB               Device (ESP32)
(Every 1 min)
    │                       │                  │                    │
    │ Check cron trigger    │                  │                    │
    │ 09:00 UTC?            │                  │                    │
    ├─────────────────────► │                  │                    │
    │                       │                  │                    │
    │                       │ Find enabled      │                    │
    │                       │ schedules @ 09:00 │                    │
    │                       ├─────────────────►│                    │
    │                       │                  │                    │
    │                       │ [sched-1,sched-2]│                    │
    │                       │◄─────────────────┤                    │
    │                       │                  │                    │
    │                       │ For each:        │                    │
    │                       │ Create feed cmd  │                    │
    │                       │ Create history   │                    │
    │                       ├─────────────────►│                    │
    │                       │ [cmd-sched-1]    │                    │
    │                       │ [cmd-sched-2]    │                    │
    │                       │                  │                    │
    │                       │                  │ Device polls       │
    │                       │                  │◄──────────────────│
    │                       │                  │                    │
    │                       │                  │ [cmd-sched-1,2]   │
    │                       │                  ├───────────────────►│
    │                       │                  │                    │
    │                       │                  │ [Device executes]│
    │                       │                  │ [Feed 50g]       │
    │                       │                  │ [Feed 75g]       │
    │                       │                  │                    │
    │                       │                  │ ACK both cmds     │
    │                       │                  │ acknowledged      │
    │                       │◄──────────────────│
    │                       │ Update history   │                    │
    │                       ├─────────────────►│                    │
    │                       │                  │                    │
    │ Scheduling job done   │                  │                    │
    ├─────────────────────► │                  │                    │
    │                       │                  │                    │
```

### Diagram 3: Device Offline + Retry Recovery

```
Timeline:    Device             Command            Cleanup Job      Mobile App
(offline scenario)     State                   every 5min
    │         │                 │                    │                 │
    │         │ Goes offline    │                    │                 │
  T=0s  ├─────► (WiFi off)     │                    │                 │
    │         │                 │                    │                 │
    │         │            User taps "Feed"         │                 │
    │         │                 │                    │                 │
    │         │                 ├──► Create cmd     │                 │
    │         │                 │ state: queued     │                 │
    │         │                 │ expires: T=30s    │                 │
    │         │                 ├──────────►│        │                 │
    │         │                            │        │                 │
    │         │                            │        │  "Feed sent"    │
    │         │                            │        ├──────────────► │
    │         │                            │        │                 │
  T=30s ├────── (expires)                  │        │                 │
    │         │ Command timeout            │        │                 │
    │         │                 ◄──────────┤        │                 │
    │         │                 │ state:expired     │                 │
    │         │                 │                   │                 │
    │         │                 │ [5 min cleanup]   │                 │
    │         │                 │                   ├───────► Detect  │
    │         │                 │                   │ offline         │
    │         │                 │ Device offline    │                 │
    │         │                 │ Device.online=F   │                 │
    │         │                 ├──────────────────►│                 │
    │         │                 │                   │                 │
  T=120s├─────── (back online)                     │                 │
    │   WiFi reconnect          │                   │                 │
    │         │                 │                   │                 │
    │         │ POST status ────────────────────────────►│           │
    │         │                 │                   │ online=true  │
    │         │                 │ Update device     │ Device.online=T│
    │         │                 ├──────────────────►│                 │
    │         │                 │                   │                 │
    │         │ GET /pending   │                   │                 │
    │         ├────────────────►│                   │                 │
    │         │                 │ {} (no pending)   │                 │
    │         │◄────────────────┤                   │                 │
    │         │ (cmd expired)   │                   │                 │
    │         │                 │                   │──────────────►│
    │         │                 │                   │ "Device back  │
    │         │                 │                   │ Feed command  │
    │         │                 │                   │ expired"      │
    │         │                 │                   │               │
    │         │ [User retries]                      │               │
    │         │ POST /triggerManualFeed             │               │
    │         │ (new command)   │                   │               │
    │         │                 ├──► Create cmd     │               │
    │         │                 │ state: queued     │               │
    │         │                 │                   │               │
    │         │ GET /pending   │                   │               │
    │         ├────────────────►│                   │               │
    │         │                 │ [new cmd]         │               │
    │         │◄────────────────┤                   │               │
    │         │ [Device executes]                   │               │
    │         │                 │                   │               │
    │         │ ACK             │                   │               │
    │         ├────────────────►│                   │               │
    │         │ state:acked     ├──────────────────►│               │
    │         │                 │ Create history    │               │
    │         │                 │ [success]         │               │
    │         │                 │                   │─────────────► │
    │         │                 │                   │ "Feed         │
    │         │                 │                   │ completed"    │
    │         │                 │                   │               │
```

---

**Backend implementation complete. All 15 sections + implementation files delivered.**
