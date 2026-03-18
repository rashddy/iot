/**
 * Zod validation schemas for all API inputs.
 * Centralized validation, strongly typed.
 */

import { z } from 'zod';

// ============================================
// Primitives
// ============================================

const ISO8601String = z.string().datetime().describe('ISO 8601 UTC timestamp');
const DeviceId = z.string().uuid('Invalid device ID').describe('Valid UUID');
const UserId = z.string().uuid('Invalid user ID').describe('Valid UUID');
const CommandId = z.string().uuid('Invalid command ID').describe('Valid UUID');
const ScheduleId = z.string().uuid('Invalid schedule ID').describe('Valid UUID');

const HHmmTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format')
  .describe('HH:mm UTC time');

const CommandState = z.enum(['queued', 'sent', 'acknowledged', 'failed', 'expired']);
const FeedEventStatus = z.enum(['completed', 'failed', 'skipped', 'partial']);
const FeedEventTrigger = z.enum(['schedule', 'manual', 'api']);

// ============================================
// Schedule Management
// ============================================

export const CreateScheduleSchema = z.object({
  deviceId: DeviceId,
  time: HHmmTime,
  amount: z.number().positive('Amount must be positive').max(500, 'Amount too large (max 500g)'),
  enabled: z.boolean().default(true),
  dayOfWeek: z.array(z.number().min(0).max(6)).optional().describe('0-6, Monday=0'),
});

export const UpdateScheduleSchema = z.object({
  scheduleId: ScheduleId,
  time: HHmmTime.optional(),
  amount: z.number().positive().max(500).optional(),
  enabled: z.boolean().optional(),
  dayOfWeek: z.array(z.number().min(0).max(6)).optional(),
});

export const DeleteScheduleSchema = z.object({
  scheduleId: ScheduleId,
});

export const ToggleScheduleSchema = z.object({
  scheduleId: ScheduleId,
  enabled: z.boolean(),
});

// ============================================
// Manual Feed Command
// ============================================

export const TriggerManualFeedSchema = z.object({
  deviceId: DeviceId,
  amount: z.number().positive().max(500),
  idempotencyKey: z.string().min(8).max(256).optional().describe('For deduplication'),
});

// ============================================
// Device Management
// ============================================

export const RegisterDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  model: z.string().min(1).max(50),
  firmwareVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semantic version x.y.z'),
});

export const UpdateDeviceSchema = z.object({
  deviceId: DeviceId,
  name: z.string().min(1).max(100).optional(),
  lastSeen: ISO8601String.optional(),
});

// ============================================
// Command Acknowledgement from ESP32
// ============================================

export const CommandAckSchema = z.object({
  commandId: CommandId,
  deviceId: DeviceId,
  state: z.enum(['acknowledged', 'failed']).describe('Command final state'),
  receivedAt: ISO8601String.describe('Device-reported timestamp'),
  result: z.record(z.unknown()).optional().describe('Command result payload'),
  error: z.string().max(500).optional().describe('Error message from device'),
  nonce: z.string().max(256).optional().describe('For replay protection'),
});

// ============================================
// Telemetry Ingestion
// ============================================

export const TelemetrySchema = z.object({
  deviceId: DeviceId,
  timestamp: ISO8601String,
  type: z.enum(['status', 'weight', 'feed', 'error']),
  data: z.record(z.unknown()).describe('Telemetry payload'),
});

export const DeviceStatusSchema = z.object({
  deviceId: DeviceId,
  online: z.boolean(),
  lastSeen: ISO8601String,
  wifiRSSI: z.number().int().min(-120).max(0).describe('dBm'),
  uptime: z.number().nonnegative().describe('seconds since boot'),
  freeMemory: z.number().nonnegative().optional().describe('bytes'),
  cpuUsage: z.number().min(0).max(100).optional().describe('percentage'),
});

export const FoodContainerSchema = z.object({
  deviceId: DeviceId,
  remainingGrams: z.number().nonnegative(),
  maxCapacityGrams: z.number().positive(),
  lastUpdated: ISO8601String,
  lowThresholdGrams: z.number().nonnegative().optional().default(100),
});

// ============================================
// Query / Filters
// ============================================

export const PaginationSchema = z.object({
  pageSize: z.number().int().min(1).max(100).default(50),
  pageNumber: z.number().int().min(1).default(1),
});

export const HistoryFilterSchema = z.object({
  deviceId: DeviceId,
  startTime: ISO8601String.optional(),
  endTime: ISO8601String.optional(),
  status: FeedEventStatus.optional(),
  triggeredBy: FeedEventTrigger.optional(),
  ...PaginationSchema.shape,
});

export const CommandFilterSchema = z.object({
  deviceId: DeviceId,
  state: CommandState.optional(),
  ...PaginationSchema.shape,
});

// ============================================
// Utility validators
// ============================================

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): { valid: true; data: T } | { valid: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, error: result.error };
}

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = validateInput(schema, data);
  if (!result.valid) {
    const formatted = result.error.flatten();
    throw new ValidationError('Input validation failed', formatted);
  }
  return result.data;
}

export class ValidationError extends Error {
  constructor(
    public message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
