/**
 * Cloud Function handlers for ESP32 telemetry ingestion.
 */

import { DeviceService } from '@/services/device.service';
import { HistoryService } from '@/services/history.service';
import {
    DeviceStatusSchema,
    FoodContainerSchema,
    validateOrThrow,
} from '@/validation/schemas';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions';

const deviceService = new DeviceService();
const historyService = new HistoryService();

/**
 * POST /telemetry/status
 * Device reports its current status (online, WiFi signal, uptime, etc.).
 * Auth: Device authentication via secret.
 */
export async function reportDeviceStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const input = validateOrThrow(DeviceStatusSchema, req.body);

    // Update device status in database
    await deviceService.recordDeviceStatus(input.deviceId, {
      online: input.online,
      lastSeen: input.lastSeen,
      wifiRSSI: input.wifiRSSI,
      uptime: input.uptime,
      freeMemory: input.freeMemory,
      cpuUsage: input.cpuUsage,
    });

    res.status(200).json({
      success: true,
      data: { received: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to record device status';
    logger.error('Error recording device status', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message },
    });
  }
}

/**
 * POST /telemetry/foodContainer
 * Device reports food container level.
 * Auth: Device authentication via secret.
 */
export async function reportFoodContainer(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const input = validateOrThrow(FoodContainerSchema, req.body);

    const container = await deviceService.recordFoodContainerStatus(input.deviceId, {
      remainingGrams: input.remainingGrams,
      maxCapacityGrams: input.maxCapacityGrams,
      lastUpdated: input.lastUpdated,
      lowThresholdGrams: input.lowThresholdGrams || 100,
    });

    // Log if low
    if (container.remainingGrams <= container.lowThresholdGrams) {
      await historyService.recordAuditLog({
        userId: 'system',
        deviceId: input.deviceId,
        action: 'LOW_FOOD_ALERT',
        resourceType: 'FoodContainer',
        resourceId: input.deviceId,
        status: 'success',
      });
    }

    res.status(200).json({
      success: true,
      data: container,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to record food container status';
    logger.error('Error recording food container', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message },
    });
  }
}

/**
 * GET /telemetry/foodContainer/:deviceId
 * Get latest food container status for a device.
 * Auth: User must own device.
 */
export async function getFoodContainerStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const deviceId = req.params.deviceId;

    // Verify ownership
    const device = await deviceService.getDevice(deviceId);
    if (device.userId !== req.auth.uid) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      return;
    }

    // Theoretically fetch from DB, but for now, we'd need to implement this
    // This would read from /foodContainer/{deviceId}
    // For now, return latest status as recorded

    res.status(200).json({
      success: true,
      data: null, // Would be populated from DB in full implementation
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to fetch food container status';
    logger.error('Error fetching food container', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}
