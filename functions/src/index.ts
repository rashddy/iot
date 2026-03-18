/**
 * AquaFeed Pro Backend – Firebase Cloud Functions v2
 * Entry point for all HTTP callable functions.
 */

import express from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2/https';
import { v4 as uuidv4 } from 'uuid';

// Initialize Firebase Admin SDK
admin.initializeApp();

// Middleware
import {
    errorHandler,
    rateLimitMiddleware,
    verifyAuthToken,
    verifyDeviceToken,
} from '@/middleware/auth';

// Handlers
import * as deviceHandlers from '@/handlers/device.handler';
import * as feedHandlers from '@/handlers/feed.handler';
import * as scheduleHandlers from '@/handlers/schedule.handler';
import * as telemetryHandlers from '@/handlers/telemetry.handler';

// ============================================
// Express App Setup
// ============================================

const app = express();

// Middleware
app.use(express.json({ limit: '10kb' })); // Limit request size
app.use((req, _res, next) => {
  req.requestId = req.headers['x-request-id'] as string || uuidv4();
  req.timestamp = new Date().toISOString();
  next();
});

// ============================================
// Public Routes (no auth required)
// ============================================

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// Authenticated Routes (User)
// ============================================

// All user routes require Firebase Auth token
app.use([
  '/schedules',
  '/devices',
  '/dashboard',
  '/history',
  '/commands',
  '/triggerManualFeed',
], verifyAuthToken);

// Rate limiting for write-heavy endpoints
app.use([
  '/schedules',
  '/devices',
  '/triggerManualFeed',
  '/commands',
], rateLimitMiddleware);

// Schedule Management (User)
app.post('/schedules', scheduleHandlers.createSchedule);
app.put('/schedules/:scheduleId', scheduleHandlers.updateSchedule);
app.delete('/schedules/:scheduleId', scheduleHandlers.deleteSchedule);
app.get('/schedules/:deviceId', scheduleHandlers.getSchedules);

// Manual Feed Commands (User)
app.post('/triggerManualFeed', feedHandlers.triggerManualFeed);
app.get('/commands/:deviceId/history', feedHandlers.getCommandHistory);

// Device Management (User)
app.post('/devices/register', deviceHandlers.registerDevice);
app.get('/devices', deviceHandlers.getUserDevices);
app.get('/devices/:deviceId', deviceHandlers.getDevice);
app.put('/devices/:deviceId', deviceHandlers.updateDevice);

// Dashboard (User)
app.get('/dashboard/:deviceId', deviceHandlers.getDashboard);
app.get('/history/:deviceId', deviceHandlers.getHistory);

// ============================================
// Device Routes (ESP32)
// ============================================

// Device routes require device authentication (secret)
app.use([
  '/telemetry',
  '/commands/:deviceId/pending',
  '/commands/acknowledge',
], verifyDeviceToken);

// Telemetry Ingestion (Device)
app.post('/telemetry/status', telemetryHandlers.reportDeviceStatus);
app.post('/telemetry/foodContainer', telemetryHandlers.reportFoodContainer);
app.get('/telemetry/foodContainer/:deviceId', telemetryHandlers.getFoodContainerStatus);

// Command Polling (Device)
app.get('/commands/:deviceId/pending', feedHandlers.getPendingCommands);
app.post('/commands/acknowledge', feedHandlers.acknowledgeCommand);

// ============================================
// Error Handling
// ============================================

app.use((err: any, _req: express.Request, res: express.Response) => {
  errorHandler(err, _req, res, () => {});
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// ============================================
// Cloud Function Exports – HTTP
// ============================================

/**
 * Main API endpoint combining all routes.
 * Accessible at: https://region-project.cloudfunctions.net/api
 */
export const api = functions.https.onRequest(
  {
    region: ['us-central1'],
    memory: '512MB',
    timeoutSeconds: 60,
    cors: true,
  },
  app,
);

// ============================================
// Cloud Function Exports – Scheduled Tasks
// ============================================

/**
 * Scheduled function: Run every minute to execute scheduled feed commands.
 * Checks for active schedules and creates feed commands.
 */
export const executeScheduledFeeds = functions.pubsub
  .schedule('* * * * *') // Every minute
  .timeZone('UTC')
  .onRun(async () => {
    const { ScheduleService } = await import('@/services/schedule.service');
    const { CommandService } = await import('@/services/command.service');
    const { HistoryService } = await import('@/services/history.service');
    const { DeviceService } = await import('@/services/device.service');

    const db = admin.database();
    const scheduleService = new ScheduleService();
    const commandService = new CommandService();
    const historyService = new HistoryService();
    const deviceService = new DeviceService();

    try {
      // Get all devices
      const devicesSnapshot = await db.ref('/devices').once('value');
      if (!devicesSnapshot.exists()) {
        return;
      }

      const devices = Object.values(devicesSnapshot.val()) as any[];

      for (const device of devices) {
        // Find active schedules for this device
        const activeSchedules = await scheduleService.findActiveSchedules(device.id);

        for (const schedule of activeSchedules) {
          // Create feed command for this schedule
          const command = await commandService.createFeedCommand(
            device.id,
            schedule.userId,
            schedule.amount,
            `schedule:${schedule.id}:${Math.floor(Date.now() / 60000)}`, // Dedup key: once per minute
          );

          // Record history entry
          await historyService.recordFeedEvent(
            device.id,
            schedule.userId,
            {
              amount: schedule.amount,
              status: 'completed',
              triggeredBy: 'schedule',
              commandId: command.id,
            },
          );

          functions.logger.info('Scheduled feed triggered', {
            deviceId: device.id,
            scheduleId: schedule.id,
            commandId: command.id,
          });
        }
      }
    } catch (error) {
      functions.logger.error('Error executing scheduled feeds', {
        error: (error as Error).message,
      });
    }
  });

/**
 * Scheduled function: Clean up expired commands and old telemetry.
 * Runs every hour.
 */
export const cleanupDatabase = functions.pubsub
  .schedule('0 * * * *') // Every hour
  .timeZone('UTC')
  .onRun(async () => {
    const db = admin.database();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

    try {
      // Clean up expired commands
      const commandsSnapshot = await db.ref('/commands').once('value');
      if (commandsSnapshot.exists()) {
        const updates: Record<string, unknown> = {};
        let deletedCount = 0;

        const traverseCommands = (node: any, path: string) => {
          if (typeof node !== 'object') return;

          for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === 'object' && 'expiresAt' in value) {
              const expiresAt = new Date((value as any).expiresAt);
              if (expiresAt < oneHourAgo) {
                updates[`${path}/${key}`] = null;
                deletedCount++;
              }
            } else if (typeof value === 'object') {
              traverseCommands(value, `${path}/${key}`);
            }
          }
        };

        traverseCommands(commandsSnapshot.val(), '/commands');

        if (deletedCount > 0) {
          await db.ref().update(updates);
          functions.logger.info('Cleaned up expired commands', { deletedCount });
        }
      }
    } catch (error) {
      functions.logger.error('Cleanup error', { error: (error as Error).message });
    }
  });

/**
 * Scheduled function: Detect offline devices.
 * Runs every 5 minutes.
 */
export const detectOfflineDevices = functions.pubsub
  .schedule('*/5 * * * *') // Every 5 minutes
  .timeZone('UTC')
  .onRun(async () => {
    const { DeviceService } = await import('@/services/device.service');
    const db = admin.database();

    const deviceService = new DeviceService();
    const offlineThreshold = parseInt(process.env.DEVICE_OFFLINE_THRESHOLD_MS || '120000');

    try {
      const devicesSnapshot = await db.ref('/devices').once('value');
      if (!devicesSnapshot.exists()) {
        return;
      }

      const devices = Object.values(devicesSnapshot.val()) as any[];
      const now = Date.now();

      for (const device of devices) {
        const lastSeen = new Date(device.lastSeen).getTime();
        const isOffline = now - lastSeen > offlineThreshold;

        if (isOffline && device.online) {
          // Mark as offline
          await deviceService.updateDevice(device.id, {
            online: false,
          });

          functions.logger.warn('Device marked offline', {
            deviceId: device.id,
            lastSeen: device.lastSeen,
          });
        }
      }
    } catch (error) {
      functions.logger.error('Offline detection error', {
        error: (error as Error).message,
      });
    }
  });
