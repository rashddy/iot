/**
 * Cloud Function handlers for device management and dashboard.
 */

import { DeviceService } from '@/services/device.service';
import { HistoryService } from '@/services/history.service';
import { ScheduleService } from '@/services/schedule.service';
import { RegisterDeviceSchema, validateOrThrow } from '@/validation/schemas';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions';

const deviceService = new DeviceService();
const scheduleService = new ScheduleService();
const historyService = new HistoryService();

/**
 * POST /devices/register
 * Register a new device for the user.
 * Auth: User must be authenticated.
 */
export async function registerDevice(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const input = validateOrThrow(RegisterDeviceSchema, req.body);

    const { device, secret } = await deviceService.registerDevice(req.auth.uid, {
      name: input.name,
      model: input.model,
      firmwareVersion: input.firmwareVersion,
    });

    // Record audit log
    await historyService.recordAuditLog({
      userId: req.auth.uid,
      deviceId: device.id,
      action: 'REGISTER',
      resourceType: 'Device',
      resourceId: device.id,
      status: 'success',
    });

    res.status(201).json({
      success: true,
      data: {
        device,
        secret, // Return once during registration; store securely on device
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to register device';
    logger.error('Error registering device', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}

/**
 * GET /devices
 * Get all devices owned by user.
 * Auth: User must be authenticated.
 */
export async function getUserDevices(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const devices = await deviceService.getUserDevices(req.auth.uid);

    res.status(200).json({
      success: true,
      data: devices,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to fetch devices';
    logger.error('Error fetching devices', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}

/**
 * GET /devices/:deviceId
 * Get single device details.
 * Auth: User must own device.
 */
export async function getDevice(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const deviceId = req.params.deviceId;

    const device = await deviceService.getDevice(deviceId);

    if (device.userId !== req.auth.uid) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN' },
      });
      return;
    }

    const status = await deviceService.getDeviceStatus(deviceId);

    res.status(200).json({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to fetch device';
    logger.error('Error fetching device', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}

/**
 * GET /dashboard/:deviceId
 * Get full dashboard state for a device (schedules, recent history, status).
 * Auth: User must own device.
 */
export async function getDashboard(req: Request, res: Response): Promise<void> {
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

    // Fetch all components in parallel
    const [status, schedules, history] = await Promise.all([
      deviceService.getDeviceStatus(deviceId),
      scheduleService.getSchedules(deviceId),
      historyService.getHistory(deviceId, { limit: 20 }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        device: status,
        schedules,
        recentHistory: history,
        checksum: await historyService.getHistoryChecksum(deviceId),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to fetch dashboard';
    logger.error('Error fetching dashboard', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}

/**
 * GET /history/:deviceId
 * Get feeding history for a device with filters and pagination.
 * Auth: User must own device.
 */
export async function getHistory(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const deviceId = req.params.deviceId;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    const triggeredBy = req.query.triggeredBy as string;

    // Verify ownership
    const device = await deviceService.getDevice(deviceId);
    if (device.userId !== req.auth.uid) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      return;
    }

    const history = await historyService.getHistory(deviceId, {
      limit,
      status: status as any,
      triggeredBy: triggeredBy as any,
    });

    res.status(200).json({
      success: true,
      data: history,
      pagination: {
        total: history.length,
        pageSize: limit,
        pageNumber: 1,
        hasMore: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to fetch history';
    logger.error('Error fetching history', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}

/**
 * PUT /devices/:deviceId
 * Update device metadata.
 * Auth: User must own device.
 */
export async function updateDevice(req: Request, res: Response): Promise<void> {
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

    const updated = await deviceService.updateDevice(deviceId, {
      name: req.body.name,
    });

    res.status(200).json({
      success: true,
      data: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to update device';
    logger.error('Error updating device', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}
