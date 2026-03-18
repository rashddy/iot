/**
 * Device management service.
 * Handles device registration, secrets, status, and telemetry.
 */

import { Backend } from '@/types/index';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';

export class DeviceService {
  private db = admin.database();
  private readonly OFFLINE_THRESHOLD_MS = parseInt(process.env.DEVICE_OFFLINE_THRESHOLD_MS || '120000');

  /**
   * Register a new device for a user.
   */
  async registerDevice(
    userId: string,
    input: {
      name: string;
      model: string;
      firmwareVersion: string;
    },
  ): Promise<{ device: Backend.Device; secret: string }> {
    const deviceId = uuidv4();
    const deviceSecret = uuidv4() + uuidv4(); // Random secret
    const now = new Date().toISOString();

    const device: Backend.Device = {
      id: deviceId,
      userId,
      name: input.name,
      model: input.model,
      firmwareVersion: input.firmwareVersion,
      createdAt: now,
      lastSeen: now,
      online: false, // Becomes true on first telemetry
      lastSeenThreshold: this.OFFLINE_THRESHOLD_MS,
    };

    try {
      // Store device metadata
      const updates: Record<string, unknown> = {
        [`/users/${userId}/devices/${deviceId}`]: device,
        [`/devices/${deviceId}`]: device,
      };

      // Store device secret (hashed in production, plaintext here for simplicity)
      // In production: bcrypt.hash(deviceSecret)
      updates[`/_deviceSecrets/${deviceId}`] = deviceSecret; // TODO: Hash before storing

      await this.db.ref().update(updates);

      logger.info('Device registered', { deviceId, userId });
      return { device, secret: deviceSecret };
    } catch (error) {
      logger.error('Failed to register device', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get device by ID.
   */
  async getDevice(deviceId: string): Promise<Backend.Device> {
    const snapshot = await this.db.ref(`/devices/${deviceId}`).once('value');
    if (!snapshot.exists()) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    return snapshot.val();
  }

  /**
   * Get all devices for a user.
   */
  async getUserDevices(userId: string): Promise<Backend.Device[]> {
    try {
      const snapshot = await this.db.ref(`/users/${userId}/devices`).once('value');

      if (!snapshot.exists()) {
        return [];
      }

      return Object.values(snapshot.val() || {}) as Backend.Device[];
    } catch (error) {
      logger.error('Failed to fetch user devices', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Update device metadata.
   */
  async updateDevice(
    deviceId: string,
    updates: Partial<Omit<Backend.Device, 'id' | 'userId' | 'createdAt'>>,
  ): Promise<Backend.Device> {
    try {
      const existing = await this.getDevice(deviceId);
      const updated = {
        ...existing,
        ...updates,
      };

      const dbUpdates: Record<string, unknown> = {
        [`/devices/${deviceId}`]: updated,
        [`/users/${updated.userId}/devices/${deviceId}`]: updated,
      };

      await this.db.ref().update(dbUpdates);
      logger.info('Device updated', { deviceId });
      return updated;
    } catch (error) {
      logger.error('Failed to update device', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Record device telemetry (status update from ESP32).
   */
  async recordDeviceStatus(
    deviceId: string,
    status: Omit<Backend.DeviceStatus, 'deviceId'>,
  ): Promise<Backend.DeviceStatus> {
    try {
      const record: Backend.DeviceStatus = {
        deviceId,
        ...status,
      };

      const updates: Record<string, unknown> = {
        [`/devices/${deviceId}/telemetry`]: record,
      };

      // Update device online status and lastSeen
      const device = await this.getDevice(deviceId);
      updates[`/devices/${deviceId}/online`] = true;
      updates[`/devices/${deviceId}/lastSeen`] = status.lastSeen;

      await this.db.ref().update(updates);
      logger.info('Device status recorded', { deviceId, online: status.online });
      return record;
    } catch (error) {
      logger.error('Failed to record device status', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Record food container status.
   */
  async recordFoodContainerStatus(
    deviceId: string,
    container: Omit<Backend.FoodContainerStatus, 'deviceId'>,
  ): Promise<Backend.FoodContainerStatus> {
    try {
      const record: Backend.FoodContainerStatus = {
        deviceId,
        ...container,
      };

      await this.db.ref(`/foodContainer/${deviceId}`).set(record);

      // Check if low
      if (container.remainingGrams <= container.lowThresholdGrams) {
        logger.warn('Low food level alert', {
          deviceId,
          remaining: container.remainingGrams,
          threshold: container.lowThresholdGrams,
        });
      }

      return record;
    } catch (error) {
      logger.error('Failed to record food container status', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Check if device is online based on lastSeen timestamp.
   */
  isDeviceOnline(device: Backend.Device): boolean {
    const lastSeen = new Date(device.lastSeen).getTime();
    const now = Date.now();
    return now - lastSeen < device.lastSeenThreshold;
  }

  /**
   * Get device with computed online/offline status.
   */
  async getDeviceStatus(deviceId: string): Promise<Backend.Device & { isOnline: boolean }> {
    const device = await this.getDevice(deviceId);
    return {
      ...device,
      isOnline: this.isDeviceOnline(device),
    };
  }

  /**
   * Rotate device secret (for security).
   */
  async rotateDeviceSecret(deviceId: string): Promise<string> {
    try {
      const newSecret = uuidv4() + uuidv4();
      // TODO: Hash before storing
      await this.db.ref(`/_deviceSecrets/${deviceId}`).set(newSecret);

      logger.info('Device secret rotated', { deviceId });
      return newSecret;
    } catch (error) {
      logger.error('Failed to rotate device secret', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Share device with another user.
   */
  async shareDevice(
    deviceId: string,
    sharedByUserId: string,
    sharedWithUserId: string,
    role: Backend.DeviceRole = 'viewer',
  ): Promise<Backend.DeviceSharing> {
    try {
      const device = await this.getDevice(deviceId);

      // Verify ownership
      if (device.userId !== sharedByUserId) {
        throw new Error('Only device owner can share');
      }

      const sharing: Backend.DeviceSharing = {
        deviceId,
        sharedWithUserId,
        role,
        sharedAt: new Date().toISOString(),
        sharedByUserId,
      };

      const updates: Record<string, unknown> = {
        [`/users/${sharedWithUserId}/deviceShares/${deviceId}`]: sharing,
        [`/deviceShares/${deviceId}/${sharedWithUserId}`]: sharing,
      };

      await this.db.ref().update(updates);

      logger.info('Device shared', { deviceId, sharedWithUserId, role });
      return sharing;
    } catch (error) {
      logger.error('Failed to share device', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Revoke device sharing.
   */
  async revokeDeviceShare(
    deviceId: string,
    sharedByUserId: string,
    sharedWithUserId: string,
  ): Promise<void> {
    try {
      const device = await this.getDevice(deviceId);

      // Verify ownership
      if (device.userId !== sharedByUserId) {
        throw new Error('Only device owner can revoke sharing');
      }

      const updates: Record<string, unknown> = {
        [`/users/${sharedWithUserId}/deviceShares/${deviceId}`]: null,
        [`/deviceShares/${deviceId}/${sharedWithUserId}`]: null,
      };

      await this.db.ref().update(updates);

      logger.info('Device share revoked', { deviceId, sharedWithUserId });
    } catch (error) {
      logger.error('Failed to revoke device share', { error: (error as Error).message });
      throw error;
    }
  }
}
