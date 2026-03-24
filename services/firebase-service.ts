/**
 * AquaFeed Pro – Firebase Realtime Database service layer.
 * Every function here operates on the shared RTDB instance.
 */

import { database } from '@/config/firebase';
import type {
    DeviceStatus,
    FeedingHistory,
    FeedingSchedule,
    FoodContainer,
    ManualFeedCommand,
} from '@/types/feeder';
import {
    limitToLast,
    off,
    onValue,
    orderByChild,
    push,
    query,
    ref,
    remove,
    set,
    update
} from 'firebase/database';

/* ------------------------------------------------------------------ */
/*  References                                                         */
/* ------------------------------------------------------------------ */

const schedulesRef = ref(database, 'schedules');
const historyRef = ref(database, 'history');
const foodContainerRef = ref(database, 'foodContainer');
const deviceStatusRef = ref(database, 'deviceStatus');
const manualFeedRef = ref(database, 'manualFeed');

/* ------------------------------------------------------------------ */
/*  Schedules                                                          */
/* ------------------------------------------------------------------ */

/** Add a new feeding schedule and return the generated key */
export async function addSchedule(
  schedule: Omit<FeedingSchedule, 'id'>,
): Promise<string> {
  const deviceId = 'esp32-device-001'; // In production, get from auth/device context
  const deviceSchedulesRef = ref(database, `schedules/${deviceId}`);
  const newRef = push(deviceSchedulesRef);
  const id = newRef.key!;
  await set(newRef, { ...schedule, id });
  return id;
}

/** Update an existing schedule */
export async function updateSchedule(schedule: FeedingSchedule): Promise<void> {
  const deviceId = 'esp32-device-001';
  await set(ref(database, `schedules/${deviceId}/${schedule.id}`), schedule);
}

/** Toggle the enabled flag of a schedule */
export async function toggleSchedule(
  id: string,
  enabled: boolean,
): Promise<void> {
  const deviceId = 'esp32-device-001';
  await update(ref(database, `schedules/${deviceId}/${id}`), { enabled });
}

/** Delete a schedule */
export async function deleteSchedule(id: string): Promise<void> {
  const deviceId = 'esp32-device-001';
  await remove(ref(database, `schedules/${deviceId}/${id}`));
}

/** Subscribe to real-time schedule changes */
export function onSchedulesChanged(
  callback: (schedules: FeedingSchedule[]) => void,
): () => void {
  const deviceId = 'esp32-device-001';
  const deviceSchedulesRef = ref(database, `schedules/${deviceId}`);
  const unsubscribe = onValue(deviceSchedulesRef, (snapshot) => {
    const data = snapshot.val() as Record<string, FeedingSchedule> | null;
    const list = data ? Object.values(data) : [];
    // Sort by time ascending
    list.sort((a, b) => a.time.localeCompare(b.time));
    callback(list);
  });

  return () => off(deviceSchedulesRef, 'value', unsubscribe as any);
}

/* ------------------------------------------------------------------ */
/*  Feeding History                                                    */
/* ------------------------------------------------------------------ */

/** Subscribe to recent feeding history (last 20 entries) */
export function onHistoryChanged(
  callback: (history: FeedingHistory[]) => void,
): () => void {
  const q = query(historyRef, orderByChild('timestamp'), limitToLast(20));
  const unsubscribe = onValue(q, (snapshot) => {
    const data = snapshot.val() as Record<string, FeedingHistory> | null;
    const list = data ? Object.values(data) : [];
    // Most recent first
    list.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    callback(list);
  });

  return () => off(q, 'value', unsubscribe as any);
}

/** Manually push a history entry (used by demo controls) */
export async function addHistoryEntry(
  entry: Omit<FeedingHistory, 'id'>,
): Promise<string> {
  const deviceId = 'esp32-device-001';
  const deviceHistoryRef = ref(database, `history/${deviceId}`);
  const newRef = push(deviceHistoryRef);
  const id = newRef.key!;
  await set(newRef, { ...entry, id });
  return id;
}

/* ------------------------------------------------------------------ */
/*  Food Container                                                     */
/* ------------------------------------------------------------------ */

/** Subscribe to food container telemetry */
export function onFoodContainerChanged(
  callback: (data: FoodContainer) => void,
): () => void {
  const unsubscribe = onValue(foodContainerRef, (snapshot) => {
    const data = snapshot.val() as FoodContainer | null;
    if (data) callback(data);
  });

  return () => off(foodContainerRef, 'value', unsubscribe as any);
}

/** Update food remaining (used by demo controls) */
export async function setFoodRemaining(grams: number): Promise<void> {
  await update(foodContainerRef, {
    remainingGrams: grams,
    lastUpdated: new Date().toISOString(),
  });
}

/** Initialise the food container node if it doesn't exist */
export async function initFoodContainer(
  maxCapacity = 500,
  remaining = 450,
): Promise<void> {
  await set(foodContainerRef, {
    remainingGrams: remaining,
    maxCapacityGrams: maxCapacity,
    lastUpdated: new Date().toISOString(),
  } satisfies FoodContainer);
}

/* ------------------------------------------------------------------ */
/*  Device Status                                                      */
/* ------------------------------------------------------------------ */

/** Subscribe to live device status */
export function onDeviceStatusChanged(
  callback: (status: DeviceStatus) => void,
): () => void {
  const unsubscribe = onValue(deviceStatusRef, (snapshot) => {
    const data = snapshot.val() as DeviceStatus | null;
    if (data) callback(data);
  });

  return () => off(deviceStatusRef, 'value', unsubscribe as any);
}

/* ------------------------------------------------------------------ */
/*  Manual Feed                                                        */
/* ------------------------------------------------------------------ */

/** Trigger a manual feed command that the ESP32 will pick up */
export async function triggerManualFeed(amount: number): Promise<void> {
  const command: ManualFeedCommand = {
    trigger: true,
    amount,
    timestamp: new Date().toISOString(),
  };
  await set(manualFeedRef, command);
}

/** Reset the manual feed trigger (called by ESP32 after dispensing, or for demo) */
export async function clearManualFeed(): Promise<void> {
  await update(manualFeedRef, { trigger: false });
}

/** Subscribe to manual feed node changes */
export function onManualFeedChanged(
  callback: (cmd: ManualFeedCommand) => void,
): () => void {
  const unsubscribe = onValue(manualFeedRef, (snapshot) => {
    const data = snapshot.val() as ManualFeedCommand | null;
    if (data) callback(data);
  });

  return () => off(manualFeedRef, 'value', unsubscribe as any);
}
