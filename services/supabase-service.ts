/**
 * AquaFeed Pro – Supabase service layer.
 * Every function here operates on the shared Supabase client.
 */

import { supabase } from '@/config/supabase.ts';
import type {
  DeviceStatus,
  FeedingHistory,
  FeedingSchedule,
  FoodContainer,
  ManualFeedCommand,
} from '@/types/feeder';

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  status?: number;
} | null;

type SchedulesRow = {
  id: number;
  feed_time: string;
  min_weight: number;
  max_weight: number;
  enabled: boolean;
};

type FeedingHistoryRow = {
  id: number;
  timestamp: string;
  amount: number;
  status: FeedingHistory['status'];
  triggered_by: FeedingHistory['triggeredBy'];
};

type InventoryRow = {
  id: number;
  amount_remaining: number;
  last_updated: string;
};

type DeviceStatusRow = {
  device_id: string;
  online: boolean;
  last_seen: string;
  wifi_rssi: number;
  uptime: number;
  current_weight?: number | null;
};

type ManualFeedRow = {
  device_id: string;
  trigger: boolean;
  amount: number;
  timestamp: string;
};

const DEVICE_ID = 'esp32-device-001';
let lastInventoryErrorLogAt = 0;

function toNumericId(id: string): number {
  const parsed = Number.parseInt(id, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric id: ${id}`);
  }
  return parsed;
}

function formatSupabaseError(error: SupabaseErrorLike): string {
  if (!error) return 'unknown error';
  return [error.message, error.code, error.details]
    .filter((v) => typeof v === 'string' && v.length > 0)
    .join(' | ') || 'unknown error';
}

function toDefaultDeviceStatus(): DeviceStatus {
  return {
    online: false,
    lastSeen: new Date(0).toISOString(),
    wifiRSSI: -100,
    uptime: 0,
    currentWeight: 0,
  };
}

function toDefaultManualFeed(): ManualFeedCommand {
  return {
    trigger: false,
    amount: 0,
    timestamp: new Date(0).toISOString(),
  };
}

function normalizeUtcTimestamp(raw: string): string {
  if (!raw) return new Date(0).toISOString();

  // Some DB schemas return timestamp text without timezone (e.g. "YYYY-MM-DD HH:mm:ss").
  // Treat those values as UTC because firmware sends ISO timestamps with Z.
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw);
  const base = raw.includes('T') ? raw : raw.replace(' ', 'T');
  return hasTimezone ? base : `${base}Z`;
}

/* ------------------------------------------------------------------ */
/*  Schedules                                                          */
/* ------------------------------------------------------------------ */

/** Add a new feeding schedule and return the generated id */
export async function addSchedule(
  schedule: Omit<FeedingSchedule, 'id'>,
): Promise<string> {
  const { data, error } = (await supabase
    .from('schedules')
    .insert({
      feed_time: schedule.time,
      min_weight: schedule.amount * 0.9,  // ESP32 expects min/max range
      max_weight: schedule.amount * 1.1,
      enabled: schedule.enabled,
    })
    .select()
    .single()) as { data: SchedulesRow; error: SupabaseErrorLike };

  if (error) throw error;
  return data.id.toString();
}

/** Update an existing schedule */
export async function updateSchedule(schedule: FeedingSchedule): Promise<void> {
  const scheduleId = toNumericId(schedule.id);
  const { error } = (await supabase
    .from('schedules')
    .update({
      feed_time: schedule.time,
      min_weight: schedule.amount * 0.9,
      max_weight: schedule.amount * 1.1,
      enabled: schedule.enabled,
    })
    .eq('id', scheduleId)) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/** Toggle the enabled flag of a schedule */
export async function toggleSchedule(
  id: string,
  enabled: boolean,
): Promise<void> {
  const scheduleId = toNumericId(id);
  const { error } = (await supabase
    .from('schedules')
    .update({ enabled })
    .eq('id', scheduleId)) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/** Delete a schedule */
export async function deleteSchedule(id: string): Promise<void> {
  const scheduleId = toNumericId(id);
  const { error } = (await supabase
    .from('schedules')
    .delete()
    .eq('id', scheduleId)) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/** Subscribe to real-time schedule changes */
export function onSchedulesChanged(
  callback: (schedules: FeedingSchedule[]) => void,
): () => void {
  const channel = supabase
    .channel('schedules-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'schedules' },
      async () => {
        // Refetch all schedules when something changes
        const { data, error } = await supabase
          .from('schedules')
          .select('*')
          .order('feed_time');

        if (error) {
          console.error('Error fetching schedules:', error);
          return;
        }

        // Convert Supabase format to app format
        const schedules: FeedingSchedule[] = (data as SchedulesRow[]).map((row: SchedulesRow) => ({
          id: row.id.toString(),
          time: row.feed_time,
          amount: (row.min_weight + row.max_weight) / 2, // Use average for display
          enabled: row.enabled,
        }));

        callback(schedules);
      }
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('schedules')
    .select('*')
    .order('feed_time')
    .then((res: { data: SchedulesRow[] | null; error: SupabaseErrorLike }) => {
      const { data, error } = res;
      if (!error && data) {
        const schedules: FeedingSchedule[] = data.map((row: SchedulesRow) => ({
          id: row.id.toString(),
          time: row.feed_time,
          amount: (row.min_weight + row.max_weight) / 2,
          enabled: row.enabled,
        }));
        callback(schedules);
      }
    });

  return () => supabase.removeChannel(channel);
}

/* ------------------------------------------------------------------ */
/*  Feeding History                                                    */
/* ------------------------------------------------------------------ */

/** Subscribe to recent feeding history (last 20 entries) */
export function onHistoryChanged(
  callback: (history: FeedingHistory[]) => void,
): () => void {
  const channel = supabase
    .channel('history-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'feeding_history' },
      async () => {
        const { data, error } = await supabase
          .from('feeding_history')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(20);

        if (error) {
          console.error('Error fetching history:', error);
          return;
        }

        const history: FeedingHistory[] = (data as FeedingHistoryRow[]).map((row: FeedingHistoryRow) => ({
          id: row.id.toString(),
          timestamp: row.timestamp,
          amount: row.amount,
          status: row.status,
          triggeredBy: row.triggered_by,
        }));

        callback(history);
      }
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('feeding_history')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(20)
    .then((res: { data: FeedingHistoryRow[] | null; error: SupabaseErrorLike }) => {
      const { data, error } = res;
      if (!error && data) {
        const history: FeedingHistory[] = data.map((row: FeedingHistoryRow) => ({
          id: row.id.toString(),
          timestamp: row.timestamp,
          amount: row.amount,
          status: row.status,
          triggeredBy: row.triggered_by,
        }));
        callback(history);
      }
    });

  return () => supabase.removeChannel(channel);
}

/** Manually push a history entry (used by demo controls) */
export async function addHistoryEntry(
  entry: Omit<FeedingHistory, 'id'>,
): Promise<string> {
  const { data, error } = (await supabase
    .from('feeding_history')
    .insert({
      timestamp: entry.timestamp,
      amount: entry.amount,
      status: entry.status,
      triggered_by: entry.triggeredBy,
    })
    .select()
    .single()) as { data: FeedingHistoryRow; error: SupabaseErrorLike };

  if (error) throw error;
  return data.id.toString();
}

/** Delete a feeding history entry */
export async function deleteHistoryEntry(id: string): Promise<void> {
  const historyId = toNumericId(id);
  const { error } = (await supabase
    .from('feeding_history')
    .delete()
    .eq('id', historyId)) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Food Container                                                     */
/* ------------------------------------------------------------------ */

/** Subscribe to food container telemetry */
export function onFoodContainerChanged(
  callback: (data: FoodContainer) => void,
): () => void {
  const emitInventoryRow = (row: InventoryRow) => {
    callback({
      remainingGrams: row.amount_remaining,
      maxCapacityGrams: 500,
      lastUpdated: row.last_updated,
    });
  };

  const fetchAndEmit = async () => {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      const now = Date.now();
      if (now - lastInventoryErrorLogAt > 15000) {
        lastInventoryErrorLogAt = now;
        console.warn('Inventory fetch issue:', formatSupabaseError(error));
      }
      return;
    }

    if (!data) {
      return;
    }

    emitInventoryRow(data as InventoryRow);
  };

  const channel = supabase
    .channel('inventory-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory', filter: 'id=eq.1' },
      async () => {
        await fetchAndEmit();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void fetchAndEmit();
      }
    });

  // Fallback polling keeps UI fresh even if Realtime events are blocked or dropped.
  const pollId = setInterval(() => {
    void fetchAndEmit();
  }, 5000);

  // Initial fetch
  void fetchAndEmit();

  return () => {
    clearInterval(pollId);
    supabase.removeChannel(channel);
  };
}

/** Update food remaining (used by demo controls) */
export async function setFoodRemaining(grams: number): Promise<void> {
  const { error } = (await supabase
    .from('inventory')
    .update({
      amount_remaining: grams,
      last_updated: new Date().toISOString(),
    })
    .eq('id', 1)) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/** Initialise the food container if it doesn't exist */
export async function initFoodContainer(
  maxCapacity = 500,
  remaining = 450,
): Promise<void> {
  const { error } = (await supabase
    .from('inventory')
    .upsert({
      id: 1,
      amount_remaining: remaining,
      last_updated: new Date().toISOString(),
    }, {
      onConflict: 'id'
    })) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Device Status                                                      */
/* ------------------------------------------------------------------ */

/** Subscribe to live device status */
export function onDeviceStatusChanged(
  callback: (status: DeviceStatus) => void,
): () => void {
  const emitDeviceStatusRow = (row: DeviceStatusRow) => {
    callback({
      online: row.online,
      lastSeen: normalizeUtcTimestamp(row.last_seen),
      wifiRSSI: row.wifi_rssi,
      uptime: row.uptime,
      currentWeight: row.current_weight ?? 0,
    });
  };

  const fetchAndEmit = async () => {
    const { data, error } = await supabase
      .from('device_status')
      .select('*')
      .eq('device_id', DEVICE_ID)
      .maybeSingle();

    if (error) {
      console.warn('Device status fetch issue:', formatSupabaseError(error));
      return;
    }

    if (!data) {
      callback(toDefaultDeviceStatus());
      return;
    }

    emitDeviceStatusRow(data as DeviceStatusRow);
  };

  const channel = supabase
    .channel('device-status-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'device_status', filter: `device_id=eq.${DEVICE_ID}` },
      async () => {
        await fetchAndEmit();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void fetchAndEmit();
      }
    });

  const pollId = setInterval(() => {
    void fetchAndEmit();
  }, 3000);

  // Initial fetch
  void fetchAndEmit();

  return () => {
    clearInterval(pollId);
    supabase.removeChannel(channel);
  };
}

/* ------------------------------------------------------------------ */
/*  Manual Feed                                                        */
/* ------------------------------------------------------------------ */

/** Trigger a manual feed command that the ESP32 will pick up */
export async function triggerManualFeed(amount: number): Promise<void> {
  const { error } = (await supabase
    .from('manual_feed')
    .upsert({
      device_id: DEVICE_ID,
      trigger: true,
      amount,
      timestamp: new Date().toISOString(),
    }, {
      onConflict: 'device_id'
    })) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/** Reset the manual feed trigger (called by ESP32 after dispensing, or for demo) */
export async function clearManualFeed(): Promise<void> {
  const { error } = (await supabase
    .from('manual_feed')
    .update({ trigger: false })
    .eq('device_id', DEVICE_ID)) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/** Subscribe to manual feed node changes */
export function onManualFeedChanged(
  callback: (cmd: ManualFeedCommand) => void,
): () => void {
  const channel = supabase
    .channel('manual-feed-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'manual_feed' },
      async () => {
        const { data, error } = await supabase
          .from('manual_feed')
          .select('*')
          .eq('device_id', DEVICE_ID)
          .maybeSingle();

        if (error) {
          console.error('Error fetching manual feed:', error);
          return;
        }

        if (!data) {
          callback(toDefaultManualFeed());
          return;
        }

        const row = data as ManualFeedRow;
        callback({
          trigger: row.trigger,
          amount: row.amount,
          timestamp: row.timestamp,
        });
      }
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('manual_feed')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .maybeSingle()
    .then((res: { data: ManualFeedRow | null; error: SupabaseErrorLike }) => {
      const { data, error } = res;
      if (!error) {
        if (!data) {
          callback(toDefaultManualFeed());
          return;
        }

        callback({
          trigger: data.trigger,
          amount: data.amount,
          timestamp: data.timestamp,
        });
      }
    });

  return () => supabase.removeChannel(channel);
}
