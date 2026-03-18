/**
 * Cloud Function handlers for schedule management endpoints.
 */

import { DeviceService } from '@/services/device.service';
import { HistoryService } from '@/services/history.service';
import { ScheduleService } from '@/services/schedule.service';
import {
    CreateScheduleSchema,
    DeleteScheduleSchema,
    UpdateScheduleSchema,
    validateOrThrow,
} from '@/validation/schemas';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions';

const scheduleService = new ScheduleService();
const historyService = new HistoryService();
const deviceService = new DeviceService();

/**
 * POST /schedules
 * Create a new feeding schedule.
 * Auth: User must own the device.
 */
export async function createSchedule(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const input = validateOrThrow(CreateScheduleSchema, req.body);

    // Verify device ownership
    const device = await deviceService.getDevice(input.deviceId);
    if (device.userId !== req.auth.uid) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot access this device' },
      });
      return;
    }

    const schedule = await scheduleService.createSchedule(
      input.deviceId,
      req.auth.uid,
      {
        time: input.time,
        amount: input.amount,
        enabled: input.enabled,
        dayOfWeek: input.dayOfWeek,
      },
    );

    // Record audit log
    await historyService.recordAuditLog({
      userId: req.auth.uid,
      deviceId: input.deviceId,
      action: 'CREATE',
      resourceType: 'FeedingSchedule',
      resourceId: schedule.id,
      status: 'success',
    });

    res.status(201).json({
      success: true,
      data: schedule,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string,
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to create schedule';
    logger.error('Error creating schedule', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * PUT /schedules/:scheduleId
 * Update a schedule.
 */
export async function updateSchedule(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const input = validateOrThrow(UpdateScheduleSchema, {
      scheduleId: req.params.scheduleId,
      ...req.body,
    });

    // Verify ownership (get schedule and check user permissions)
    const deviceId = req.body.deviceId;
    if (!deviceId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_DEVICE_ID' },
      });
      return;
    }

    const device = await deviceService.getDevice(deviceId);
    if (device.userId !== req.auth.uid) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      return;
    }

    const schedule = await scheduleService.updateSchedule(
      deviceId,
      req.auth.uid,
      input.scheduleId,
      {
        time: input.time,
        amount: input.amount,
        enabled: input.enabled,
        dayOfWeek: input.dayOfWeek,
      },
    );

    await historyService.recordAuditLog({
      userId: req.auth.uid,
      deviceId,
      action: 'UPDATE',
      resourceType: 'FeedingSchedule',
      resourceId: schedule.id,
      status: 'success',
    });

    res.status(200).json({
      success: true,
      data: schedule,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to update schedule';
    logger.error('Error updating schedule', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message },
    });
  }
}

/**
 * DELETE /schedules/:scheduleId
 * Delete a schedule.
 */
export async function deleteSchedule(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const input = validateOrThrow(DeleteScheduleSchema, {
      scheduleId: req.params.scheduleId,
    });

    const deviceId = req.body.deviceId;
    if (!deviceId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_DEVICE_ID' },
      });
      return;
    }

    const device = await deviceService.getDevice(deviceId);
    if (device.userId !== req.auth.uid) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      return;
    }

    await scheduleService.deleteSchedule(deviceId, req.auth.uid, input.scheduleId);

    await historyService.recordAuditLog({
      userId: req.auth.uid,
      deviceId,
      action: 'DELETE',
      resourceType: 'FeedingSchedule',
      resourceId: input.scheduleId,
      status: 'success',
    });

    res.status(204).send();
  } catch (error) {
    const message = (error as Error).message || 'Failed to delete schedule';
    logger.error('Error deleting schedule', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}

/**
 * GET /schedules/:deviceId
 * Get all schedules for a device.
 */
export async function getSchedules(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const deviceId = req.params.deviceId;

    const device = await deviceService.getDevice(deviceId);
    if (device.userId !== req.auth.uid) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      return;
    }

    const schedules = await scheduleService.getSchedules(deviceId);

    res.status(200).json({
      success: true,
      data: schedules,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to fetch schedules';
    logger.error('Error fetching schedules', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}
