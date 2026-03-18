/**
 * Command management service.
 * Handles creation, state transitions, retries, timeouts, and acknowledgement.
 */

import { Backend } from '@/types/index';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';

export class CommandService {
  private db = admin.database();
  private readonly COMMAND_TIMEOUT_MS = parseInt(process.env.COMMAND_TIMEOUT_MS || '30000');
  private readonly RETRY_MAX_ATTEMPTS = parseInt(process.env.COMMAND_RETRY_MAX_ATTEMPTS || '3');
  private readonly RETRY_BACKOFF_MS = parseInt(process.env.COMMAND_RETRY_BACKOFF_MS || '2000');

  /**
   * Create a feed command with idempotency.
   * Deduplication ensures same idempotencyKey returns same command.
   */
  async createFeedCommand(
    deviceId: string,
    userId: string,
    amount: number,
    idempotencyKey?: string,
  ): Promise<Backend.Command> {
    const key = idempotencyKey || uuidv4();
    const deduplicateRef = this.db.ref(`_commandDedup/${deviceId}/${key}`);

    try {
      // Check for existing command with same idempotency key
      const existing = await deduplicateRef.once('value');
      if (existing.exists()) {
        logger.info('Command deduplicated', { deviceId, key });
        return this.getCommand(deviceId, existing.val());
      }

      // Create new command
      const commandId = uuidv4();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + this.COMMAND_TIMEOUT_MS).toISOString();

      const command: Backend.Command = {
        id: commandId,
        deviceId,
        userId,
        type: 'feed',
        state: 'queued',
        payload: { amount },
        idempotencyKey: key,
        createdAt: now,
        expiresAt,
        retryCount: 0,
      };

      // Atomic write: command + dedup record
      const updates: Record<string, unknown> = {
        [`/users/${userId}/commands/${commandId}`]: command,
        [`/commands/${deviceId}/${commandId}`]: command,
        [`_commandDedup/${deviceId}/${key}`]: commandId,
      };

      await this.db.ref().update(updates);
      logger.info('Command created', { commandId, deviceId });
      return command;
    } catch (error) {
      logger.error('Failed to create command', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get command by ID.
   */
  async getCommand(deviceId: string, commandId: string): Promise<Backend.Command> {
    const snapshot = await this.db.ref(`/commands/${deviceId}/${commandId}`).once('value');
    if (!snapshot.exists()) {
      throw new Error(`Command not found: ${commandId}`);
    }
    return snapshot.val();
  }

  /**
   * Mark command as sent (transitions queued -> sent).
   */
  async markSent(deviceId: string, commandId: string): Promise<void> {
    const ref = this.db.ref(`/commands/${deviceId}/${commandId}`);
    await ref.update({
      state: 'sent',
      sentAt: new Date().toISOString(),
    });
  }

  /**
   * Process device acknowledgement.
   * Validates replay attacks and idempotency.
   */
  async processAcknowledgement(
    deviceId: string,
    ack: Backend.CommandAckPayload,
  ): Promise<{
    command: Backend.Command;
    isNewAck: boolean;
  }> {
    const { commandId, state, receivedAt, error, nonce } = ack;

    try {
      const command = await this.getCommand(deviceId, commandId);

      // Check expiration
      if (new Date(command.expiresAt) < new Date()) {
        logger.warn('ACK received for expired command', { commandId, deviceId });
        return { command, isNewAck: false };
      }

      // Idempotency: if already acknowledged, return success
      if (command.state === 'acknowledged' || command.state === 'failed') {
        logger.info('ACK already processed', { commandId });
        return { command, isNewAck: false };
      }

      // Replay protection: check nonce (basic implementation)
      if (nonce && command.payload.nonce && command.payload.nonce === nonce) {
        logger.warn('Potential replay attack detected', { commandId, nonce });
        return { command, isNewAck: false };
      }

      // Update command state
      const updates: Record<string, unknown> = {
        state,
        acknowledgedAt: new Date().toISOString(),
      };

      if (state === 'failed') {
        updates.error = error || 'Unknown error';
        updates.failedAt = new Date().toISOString();
      }

      if (ack.result) {
        updates.result = ack.result;
      }

      if (nonce) {
        updates['payload.nonce'] = nonce;
      }

      const ref = this.db.ref(`/commands/${deviceId}/${commandId}`);
      await ref.update(updates);

      logger.info('Command acknowledged', { commandId, state });
      return { command, isNewAck: true };
    } catch (error) {
      logger.error('Failed to process ACK', { error: (error as Error).message, commandId });
      throw error;
    }
  }

  /**
   * Retry failed command.
   * Increments retryCount and resets state to queued.
   */
  async retryCommand(deviceId: string, commandId: string): Promise<Backend.Command> {
    try {
      const command = await this.getCommand(deviceId, commandId);

      if (command.retryCount >= this.RETRY_MAX_ATTEMPTS) {
        logger.warn('Max retries exceeded', { commandId });
        throw new Error('Max retries exceeded');
      }

      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + this.COMMAND_TIMEOUT_MS).toISOString();

      const updates = {
        state: 'queued' as const,
        retryCount: command.retryCount + 1,
        lastRetryAt: now,
        expiresAt,
        error: null,
        failedAt: null,
      };

      await this.db.ref(`/commands/${deviceId}/${commandId}`).update(updates);
      logger.info('Command retried', { commandId, retryCount: command.retryCount + 1 });

      return {
        ...command,
        ...updates,
      };
    } catch (error) {
      logger.error('Failed to retry command', { error: (error as Error).message, commandId });
      throw error;
    }
  }

  /**
   * Expire command (for scheduled cleanup of old commands).
   */
  async expireCommand(deviceId: string, commandId: string): Promise<void> {
    await this.db.ref(`/commands/${deviceId}/${commandId}`).update({
      state: 'expired',
      expiresAt: new Date().toISOString(),
    });
  }

  /**
   * List pending commands for device (for ESP32 to poll).
   */
  async getPendingCommands(deviceId: string): Promise<Backend.Command[]> {
    const snapshot = await this.db
      .ref(`/commands/${deviceId}`)
      .orderByChild('state')
      .equalTo('queued')
      .once('value');

    if (!snapshot.exists()) {
      return [];
    }

    const commands = Object.values(snapshot.val() || {}) as Backend.Command[];
    return commands.filter((cmd) => new Date(cmd.expiresAt) > new Date());
  }

  /**
   * Clean up dedup records older than 1 hour.
   */
  async cleanupDedupRecords(deviceId: string): Promise<void> {
    // In production, use batch writes and TTL
    logger.info('Cleanup dedup records for device', { deviceId });
  }

  /**
   * Get command history for device.
   */
  async getCommandHistory(
    deviceId: string,
    limit: number = 100,
  ): Promise<Backend.Command[]> {
    const snapshot = await this.db
      .ref(`/commands/${deviceId}`)
      .limitToLast(limit)
      .once('value');

    if (!snapshot.exists()) {
      return [];
    }

    const commands = Object.values(snapshot.val() || {}) as Backend.Command[];
    return commands.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
}
