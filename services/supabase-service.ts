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

type SupabaseErrorLike = { message?: string } | null;

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
};

type ManualFeedRow = {
  device_id: string;
  trigger: boolean;
  amount: number;
  timestamp: string;
};

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
  const { error } = (await supabase
    .from('schedules')
    .update({
      feed_time: schedule.time,
      min_weight: schedule.amount * 0.9,
      max_weight: schedule.amount * 1.1,
      enabled: schedule.enabled,
    })
    .eq('id', schedule.id)) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/** Toggle the enabled flag of a schedule */
export async function toggleSchedule(
  id: string,
  enabled: boolean,
): Promise<void> {
  const { error } = (await supabase
    .from('schedules')
    .update({ enabled })
    .eq('id', id)) as { error: SupabaseErrorLike };

  if (error) throw error;
}

/** Delete a schedule */
export async function deleteSchedule(id: string): Promise<void> {
  const { error } = (await supabase
    .from('schedules')
    .delete()
    .eq('id', id)) as { error: SupabaseErrorLike };

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

/* ------------------------------------------------------------------ */
/*  Food Container                                                     */
/* ------------------------------------------------------------------ */

/** Subscribe to food container telemetry */
export function onFoodContainerChanged(
  callback: (data: FoodContainer) => void,
): () => void {
  const channel = supabase
    .channel('inventory-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory' },
      async () => {
        const { data, error } = await supabase
          .from('inventory')
          .select('*')
          .eq('id', 1)
          .single();

        if (error) {
          console.error('Error fetching inventory:', error);
          return;
        }

        const row = data as InventoryRow;
        callback({
          remainingGrams: row.amount_remaining,
          maxCapacityGrams: 500, // You might want to store this in inventory table too
          lastUpdated: row.last_updated,
        });
      }
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('inventory')
    .select('*')
    .eq('id', 1)
    .single()
    .then((res: { data: InventoryRow | null; error: SupabaseErrorLike }) => {
      const { data, error } = res;
      if (!error && data) {
        callback({
          remainingGrams: data.amount_remaining,
          maxCapacityGrams: 500,
          lastUpdated: data.last_updated,
        });
      }
    });

  return () => supabase.removeChannel(channel);
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
  const channel = supabase
    .channel('device-status-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'device_status' },
      async () => {
        const { data, error } = await supabase
          .from('device_status')
          .select('*')
          .eq('device_id', 'esp32-device-001')
          .single();

        if (error) {
          console.error('Error fetching device status:', error);
          return;
        }

        const row = data as DeviceStatusRow;
        callback({
          online: row.online,
          lastSeen: row.last_seen,
          wifiRSSI: row.wifi_rssi,
          uptime: row.uptime,
        });
      }
    )
    .subscribe();

  // Initial fetch
  supabase
    .from('device_status')
    .select('*')
    .eq('device_id', 'esp32-device-001')
    .single()
    .then((res: { data: DeviceStatusRow | null; error: SupabaseErrorLike }) => {
      const { data, error } = res;
      if (!error && data) {
        callback({
          online: data.online,
          lastSeen: data.last_seen,
          wifiRSSI: data.wifi_rssi,
          uptime: data.uptime,
        });
      }
    });

  return () => supabase.removeChannel(channel);
}

/* ------------------------------------------------------------------ */
/*  Manual Feed                                                        */
/* ------------------------------------------------------------------ */

/** Trigger a manual feed command that the ESP32 will pick up */
export async function triggerManualFeed(amount: number): Promise<void> {
  const { error } = (await supabase
    .from('manual_feed')
    .upsert({
      device_id: 'esp32-device-001',
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
    .eq('device_id', 'esp32-device-001')) as { error: SupabaseErrorLike };

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
          .eq('device_id', 'esp32-device-001')
          .single();

        if (error) {
          console.error('Error fetching manual feed:', error);
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
    .eq('device_id', 'esp32-device-001')
    .single()
    .then((res: { data: ManualFeedRow | null; error: SupabaseErrorLike }) => {
      const { data, error } = res;
      if (!error && data) {
        callback({
          trigger: data.trigger,
          amount: data.amount,
          timestamp: data.timestamp,
        });
      }
    });

  return () => supabase.removeChannel(channel);
}
