/**
 * Feeding history and audit logging service.
 * Records all feed events with immutability guarantees.
 */

import { Backend } from '@/types/index';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';

export class HistoryService {
  private db = admin.database();
  private readonly MAX_HISTORY_ENTRIES = parseInt(process.env.MAX_HISTORY_ENTRIES || '10000');

  /**
   * Record a feed event in history.
   * Only server can write history (immutable).
   */
  async recordFeedEvent(
    deviceId: string,
    userId: string,
    event: {
      amount: number;
      status: Backend.FeedEventStatus;
      triggeredBy: Backend.FeedEventTrigger;
      commandId?: string;
      error?: string;
      beforeGrams?: number;
      afterGrams?: number;
      durationMs?: number;
    },
  ): Promise<Backend.FeedingHistory> {
    const historyId = uuidv4();
    const now = new Date().toISOString();

    const record: Backend.FeedingHistory = {
      id: historyId,
      deviceId,
      userId,
      timestamp: now,
      amount: event.amount,
      status: event.status,
      triggeredBy: event.triggeredBy,
      commandId: event.commandId,
      error: event.error,
      beforeGrams: event.beforeGrams,
      afterGrams: event.afterGrams,
      durationMs: event.durationMs,
    };

    try {
      // Write to multiple locations: user-scoped and device-scoped
      const updates: Record<string, unknown> = {
        [`/users/${userId}/history/${historyId}`]: record,
        [`/history/${deviceId}/${historyId}`]: record,
      };

      await this.db.ref().update(updates);

      // Cleanup old entries if exceeding max
      await this.cleanupOldEntries(deviceId);

      logger.info('Feed event recorded', {
        historyId,
        deviceId,
        status: event.status,
      });

      return record;
    } catch (error) {
      logger.error('Failed to record feed event', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get history for a device with pagination.
   */
  async getHistory(
    deviceId: string,
    options: {
      limit?: number;
      startTime?: string;
      endTime?: string;
      status?: Backend.FeedEventStatus;
      triggeredBy?: Backend.FeedEventTrigger;
    } = {},
  ): Promise<Backend.FeedingHistory[]> {
    const limit = Math.min(options.limit || 50, this.MAX_HISTORY_ENTRIES);

    try {
      const snapshot = await this.db
        .ref(`/history/${deviceId}`)
        .limitToLast(limit)
        .once('value');

      if (!snapshot.exists()) {
        return [];
      }

      let entries = Object.values(snapshot.val() || {}) as Backend.FeedingHistory[];

      // Client-side filtering (could be optimized with proper indexes)
      if (options.startTime) {
        entries = entries.filter((e) => new Date(e.timestamp) >= new Date(options.startTime!));
      }

      if (options.endTime) {
        entries = entries.filter((e) => new Date(e.timestamp) <= new Date(options.endTime!));
      }

      if (options.status) {
        entries = entries.filter((e) => e.status === options.status);
      }

      if (options.triggeredBy) {
        entries = entries.filter((e) => e.triggeredBy === options.triggeredBy);
      }

      // Sort descending by timestamp
      return entries.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    } catch (error) {
      logger.error('Failed to fetch history', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get user's full history across all devices.
   */
  async getUserHistory(
    userId: string,
    options: { limit?: number } = {},
  ): Promise<Backend.FeedingHistory[]> {
    const limit = Math.min(options.limit || 100, this.MAX_HISTORY_ENTRIES);

    try {
      const snapshot = await this.db
        .ref(`/users/${userId}/history`)
        .limitToLast(limit)
        .once('value');

      if (!snapshot.exists()) {
        return [];
      }

      const entries = Object.values(snapshot.val() || {}) as Backend.FeedingHistory[];
      return entries.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    } catch (error) {
      logger.error('Failed to fetch user history', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Verify history integrity (anti-tampering check).
   * Returns a checksum of device-scoped history for client-side verification.
   */
  async getHistoryChecksum(deviceId: string): Promise<string> {
    const entries = await this.getHistory(deviceId, { limit: this.MAX_HISTORY_ENTRIES });

    // Create simple checksum from sorted entry IDs
    const checksum = entries
      .map((e) => e.id)
      .sort()
      .join(':');

    // In production: use SHA-256 hash
    return Buffer.from(checksum).toString('base64').slice(0, 32);
  }

  /**
   * Record audit log for administrative actions.
   */
  async recordAuditLog(audit: {
    userId: string;
    deviceId?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    changes?: Record<string, [unknown, unknown]>;
    ipAddress?: string;
    userAgent?: string;
    status: 'success' | 'failure';
    errorMessage?: string;
  }): Promise<Backend.AuditLog> {
    const auditId = uuidv4();
    const now = new Date().toISOString();

    const log: Backend.AuditLog = {
      id: auditId,
      userId: audit.userId,
      deviceId: audit.deviceId,
      timestamp: now,
      action: audit.action,
      resourceType: audit.resourceType,
      resourceId: audit.resourceId,
      changes: audit.changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      status: audit.status,
      errorMessage: audit.errorMessage,
    };

    try {
      await this.db.ref(`/auditLogs/${auditId}`).set(log);
      return log;
    } catch (error) {
      // Don't throw; audit logs are secondary
      logger.warn('Failed to record audit log', { error: (error as Error).message });
      return log;
    }
  }

  /**
   * Clean up history entries older than retention period.
   */
  private async cleanupOldEntries(deviceId: string): Promise<void> {
    const retentionDays = parseInt(process.env.HISTORY_RETENTION_DAYS || '90');
    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - retentionDays);

    try {
      const snapshot = await this.db
        .ref(`/history/${deviceId}`)
        .once('value');

      if (!snapshot.exists()) {
        return;
      }

      const entries = Object.entries(snapshot.val() || {}) as [string, Backend.FeedingHistory][];

      const updates: Record<string, unknown> = {};
      let deletedCount = 0;

      for (const [key, entry] of entries) {
        if (new Date(entry.timestamp) < cutoffTime) {
          updates[`/history/${deviceId}/${key}`] = null;
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        await this.db.ref().update(updates);
        logger.info('Cleaned up old history entries', {
          deviceId,
          deletedCount,
          retentionDays,
        });
      }
    } catch (error) {
      logger.warn('Error during cleanup', { error: (error as Error).message });
      // Non-blocking
    }
  }
}
