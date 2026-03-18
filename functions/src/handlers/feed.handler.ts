/**
 * Cloud Function handlers for feed command control.
 */

import { CommandService } from '@/services/command.service';
import { DeviceService } from '@/services/device.service';
import { HistoryService } from '@/services/history.service';
import {
    CommandAckSchema,
    TriggerManualFeedSchema,
    validateOrThrow,
} from '@/validation/schemas';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions';

const commandService = new CommandService();
const historyService = new HistoryService();
const deviceService = new DeviceService();

/**
 * POST /triggerManualFeed
 * Send a manual feed command to device.
 * Auth: User must own device.
 */
export async function triggerManualFeed(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const input = validateOrThrow(TriggerManualFeedSchema, req.body);

    // Verify device ownership
    const device = await deviceService.getDevice(input.deviceId);
    if (device.userId !== req.auth.uid) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot access this device' },
      });
      return;
    }

    // Create feed command
    const command = await commandService.createFeedCommand(
      input.deviceId,
      req.auth.uid,
      input.amount,
      input.idempotencyKey,
    );

    // Record audit log
    await historyService.recordAuditLog({
      userId: req.auth.uid,
      deviceId: input.deviceId,
      action: 'MANUAL_FEED',
      resourceType: 'Command',
      resourceId: command.id,
      status: 'success',
    });

    res.status(201).json({
      success: true,
      data: {
        commandId: command.id,
        state: command.state,
        createdAt: command.createdAt,
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string,
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to trigger manual feed';
    logger.error('Error triggering manual feed', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * POST /commands/acknowledge
 * Device acknowledges a command (ACK).
 * Auth: Device authentication via secret.
 */
export async function acknowledgeCommand(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const input = validateOrThrow(CommandAckSchema, req.body);

    // Verify device ID matches auth context
    if (!req.auth.uid.includes(input.deviceId)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Device mismatch',
        },
      });
      return;
    }

    // Process ACK
    const { command, isNewAck } = await commandService.processAcknowledgement(
      input.deviceId,
      {
        commandId: input.commandId,
        deviceId: input.deviceId,
        state: input.state,
        receivedAt: input.receivedAt,
        result: input.result,
        error: input.error,
        nonce: input.nonce,
      },
    );

    // Record history entry if feed command succeeded
    if (
      isNewAck &&
      command.type === 'feed' &&
      input.state === 'acknowledged'
    ) {
      const userId = command.userId;
      await historyService.recordFeedEvent(
        input.deviceId,
        userId,
        {
          amount: (command.payload?.amount as number) || 0,
          status: 'completed',
          triggeredBy: 'manual',
          commandId: command.id,
          durationMs: input.result?.durationMs as number | undefined,
        },
      );
    }

    res.status(200).json({
      success: true,
      data: {
        commandId: command.id,
        state: command.state,
        acknowledgedAt: command.acknowledgedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to acknowledge command';
    logger.error('Error acknowledging command', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * GET /commands/:deviceId/pending
 * Get pending commands for device (for ESP32 to poll).
 * Auth: Device secret authentication.
 */
export async function getPendingCommands(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const deviceId = req.params.deviceId;

    const commands = await commandService.getPendingCommands(deviceId);

    res.status(200).json({
      success: true,
      data: commands,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to fetch commands';
    logger.error('Error fetching commands', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}

/**
 * GET /commands/:deviceId/history
 * Get command history for device.
 * Auth: User must own device.
 */
export async function getCommandHistory(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.uid) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const deviceId = req.params.deviceId;
    const limit = parseInt(req.query.limit as string) || 100;

    // Verify device ownership
    const device = await deviceService.getDevice(deviceId);
    if (device.userId !== req.auth.uid) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      return;
    }

    const commands = await commandService.getCommandHistory(deviceId, limit);

    res.status(200).json({
      success: true,
      data: commands,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to fetch command history';
    logger.error('Error fetching command history', { error: message });

    res.status(400).json({
      success: false,
      error: { code: 'ERROR', message },
    });
  }
}
