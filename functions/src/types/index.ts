/**
 * Backend type definitions.
 * Extends frontend types with server-only fields.
 */

export namespace Backend {
  // ============================================
  // Command Management
  // ============================================
  
  export type CommandState = 'queued' | 'sent' | 'acknowledged' | 'failed' | 'expired';
  
  export interface Command {
    id: string;
    deviceId: string;
    userId: string;
    type: 'feed' | 'query' | 'reboot';
    state: CommandState;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    createdAt: string; // ISO 8601 UTC
    sentAt?: string;
    acknowledgedAt?: string;
    failedAt?: string;
    expiresAt: string; // ISO 8601 UTC
    lastRetryAt?: string;
    retryCount: number;
    error?: string;
  }

  export interface CommandAckPayload {
    commandId: string;
    deviceId: string;
    state: 'acknowledged' | 'failed';
    receivedAt: string; // ISO 8601 UTC, device-reported
    result?: Record<string, unknown>;
    error?: string;
    nonce?: string; // For replay protection
  }

  // ============================================
  // Device Management
  // ============================================

  export type DeviceRole = 'owner' | 'viewer';

  export interface Device {
    id: string;
    userId: string;
    name: string;
    model: string; // e.g., "ESP32-v1"
    firmwareVersion: string;
    createdAt: string; // ISO 8601 UTC
    lastSeen: string; // ISO 8601 UTC
    online: boolean;
    lastSeenThreshold: number; // ms before considered offline
  }

  export interface DeviceSecret {
    deviceId: string;
    secret: string; // Hashed, never returned
    createdAt: string;
    rotatedAt: string;
    expiresAt?: string;
  }

  export interface DeviceSharing {
    deviceId: string;
    sharedWithUserId: string;
    role: DeviceRole;
    sharedAt: string;
    sharedByUserId: string;
  }

  // ============================================
  // Telemetry & Status
  // ============================================

  export interface DeviceStatus {
    deviceId: string;
    online: boolean;
    lastSeen: string; // ISO 8601 UTC
    wifiRSSI: number; // dBm
    uptime: number; // seconds since boot
    freeMemory?: number; // bytes
    cpuUsage?: number; // percentage
  }

  export interface Telemetry {
    id: string;
    deviceId: string;
    timestamp: string; // ISO 8601 UTC
    type: 'status' | 'weight' | 'feed' | 'error';
    data: Record<string, unknown>;
  }

  export interface FoodContainerStatus {
    deviceId: string;
    remainingGrams: number;
    maxCapacityGrams: number;
    lastUpdated: string; // ISO 8601 UTC
    lowThresholdGrams: number;
  }

  // ============================================
  // Scheduling
  // ============================================

  export interface FeedingSchedule {
    id: string;
    deviceId: string;
    userId: string;
    time: string; // HH:mm UTC
    amount: number; // grams
    enabled: boolean;
    dayOfWeek?: number[]; // 0-6, Monday=0 ISO 8601; empty = daily
    createdAt: string; // ISO 8601 UTC
    updatedAt: string; // ISO 8601 UTC
  }

  // ============================================
  // History & Audit
  // ============================================

  export type FeedEventStatus = 'completed' | 'failed' | 'skipped' | 'partial';
  export type FeedEventTrigger = 'schedule' | 'manual' | 'api';

  export interface FeedingHistory {
    id: string;
    deviceId: string;
    userId: string;
    timestamp: string; // ISO 8601 UTC, server-issued
    amount: number; // grams
    status: FeedEventStatus;
    triggeredBy: FeedEventTrigger;
    commandId?: string; // Links to Command
    error?: string;
    beforeGrams?: number; // container level before
    afterGrams?: number; // container level after
    durationMs?: number; // servo operation time
  }

  export interface AuditLog {
    id: string;
    userId: string;
    deviceId?: string;
    timestamp: string; // ISO 8601 UTC
    action: string;
    resourceType: string;
    resourceId: string;
    changes?: Record<string, [unknown, unknown]>; // before -> after
    ipAddress?: string;
    userAgent?: string;
    status: 'success' | 'failure';
    errorMessage?: string;
  }

  // ============================================
  // API Request/Response
  // ============================================

  export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
    timestamp: string; // ISO 8601 UTC
    requestId: string;
  }

  export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination: {
      total: number;
      pageSize: number;
      pageNumber: number;
      hasMore: boolean;
    };
  }

  // ============================================
  // Rate Limiting
  // ============================================

  export interface RateLimitBucket {
    userId: string;
    operation: string;
    count: number;
    resetAt: number; // Unix timestamp ms
  }

  // ============================================
  // Authentication Tokens
  // ============================================

  export interface DeviceToken {
    deviceId: string;
    token: string; // JWT
    issuedAt: string; // ISO 8601 UTC
    expiresAt: string; // ISO 8601 UTC
  }
}
