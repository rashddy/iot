/**
 * Schedule management service.
 * Handles CRUD for feeding schedules.
 */

import { Backend } from '@/types/index';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';

export class ScheduleService {
  private db = admin.database();

  /**
   * Create a new feeding schedule.
   */
  async createSchedule(
    deviceId: string,
    userId: string,
    input: {
      time: string;
      amount: number;
      enabled: boolean;
      dayOfWeek?: number[];
    },
  ): Promise<Backend.FeedingSchedule> {
    const scheduleId = uuidv4();
    const now = new Date().toISOString();

    const schedule: Backend.FeedingSchedule = {
      id: scheduleId,
      deviceId,
      userId,
      time: input.time,
      amount: input.amount,
      enabled: input.enabled,
      dayOfWeek: input.dayOfWeek || [], // Empty = daily
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.db.ref(`/users/${userId}/devices/${deviceId}/schedules/${scheduleId}`).set(schedule);
      await this.db.ref(`/schedules/${deviceId}/${scheduleId}`).set(schedule);

      logger.info('Schedule created', { scheduleId, deviceId });
      return schedule;
    } catch (error) {
      logger.error('Failed to create schedule', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Update a schedule.
   */
  async updateSchedule(
    deviceId: string,
    userId: string,
    scheduleId: string,
    updates: Partial<Omit<Backend.FeedingSchedule, 'id' | 'deviceId' | 'userId' | 'createdAt'>>,
  ): Promise<Backend.FeedingSchedule> {
    try {
      const existing = await this.db
        .ref(`/users/${userId}/devices/${deviceId}/schedules/${scheduleId}`)
        .once('value');

      if (!existing.exists()) {
        throw new Error('Schedule not found');
      }

      const updated = {
        ...existing.val(),
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await this.db.ref(`/users/${userId}/devices/${deviceId}/schedules/${scheduleId}`).set(updated);
      await this.db.ref(`/schedules/${deviceId}/${scheduleId}`).set(updated);

      logger.info('Schedule updated', { scheduleId, deviceId });
      return updated;
    } catch (error) {
      logger.error('Failed to update schedule', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Delete a schedule.
   */
  async deleteSchedule(
    deviceId: string,
    userId: string,
    scheduleId: string,
  ): Promise<void> {
    try {
      const updates: Record<string, unknown> = {
        [`/users/${userId}/devices/${deviceId}/schedules/${scheduleId}`]: null,
        [`/schedules/${deviceId}/${scheduleId}`]: null,
      };
      await this.db.ref().update(updates);

      logger.info('Schedule deleted', { scheduleId, deviceId });
    } catch (error) {
      logger.error('Failed to delete schedule', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get all schedules for a device.
   */
  async getSchedules(deviceId: string): Promise<Backend.FeedingSchedule[]> {
    try {
      const snapshot = await this.db.ref(`/schedules/${deviceId}`).once('value');

      if (!snapshot.exists()) {
        return [];
      }

      const schedules = Object.values(snapshot.val() || {}) as Backend.FeedingSchedule[];
      return schedules.sort((a, b) => a.time.localeCompare(b.time));
    } catch (error) {
      logger.error('Failed to fetch schedules', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get enabled schedules for a device.
   */
  async getEnabledSchedules(deviceId: string): Promise<Backend.FeedingSchedule[]> {
    const schedules = await this.getSchedules(deviceId);
    return schedules.filter((s) => s.enabled);
  }

  /**
   * Check if a schedule should trigger now (for server-side scheduling).
   * Business logic: returns true if current time matches schedule time
   * and enabled and dayOfWeek matches.
   */
  isScheduleActive(schedule: Backend.FeedingSchedule, now: Date = new Date()): boolean {
    if (!schedule.enabled) return false;

    const nowUtcTime = now.toISOString().slice(11, 16); // HH:mm from ISO string
    const timeMatches = schedule.time === nowUtcTime;

    if (!timeMatches) return false;

    // If dayOfWeek specified, check current day (ISO 8601: Monday=1, Sunday=7)
    if (schedule.dayOfWeek && schedule.dayOfWeek.length > 0) {
      const isoDay = (now.getDay() + 6) % 7; // Convert JS (0=Sunday) to ISO (0=Monday)
      return schedule.dayOfWeek.includes(isoDay);
    }

    return true; // Daily
  }

  /**
   * Find all active schedules for a device at a specific time.
   */
  async findActiveSchedules(
    deviceId: string,
    at?: Date,
  ): Promise<Backend.FeedingSchedule[]> {
    const schedules = await this.getEnabledSchedules(deviceId);
    const time = at || new Date();
    return schedules.filter((s) => this.isScheduleActive(s, time));
  }
}
