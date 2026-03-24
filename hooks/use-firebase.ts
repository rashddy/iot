/**
 * AquaFeed Pro – Custom React hooks for Firebase subscriptions.
 * Each hook returns live data that updates whenever the RTDB node changes.
 */

import {
    onDeviceStatusChanged,
    onFoodContainerChanged,
    onHistoryChanged,
    onSchedulesChanged,
} from '@/services/supabase-service';
import type {
    DeviceStatus,
    FeedingHistory,
    FeedingSchedule,
    FoodContainer,
} from '@/types/feeder';
import { useEffect, useState } from 'react';

/** Live feeding schedules */
export function useSchedules() {
  const [schedules, setSchedules] = useState<FeedingSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSchedulesChanged((data) => {
      setSchedules(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { schedules, loading };
}

/** Live feeding history */
export function useHistory() {
  const [history, setHistory] = useState<FeedingHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onHistoryChanged((data) => {
      setHistory(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { history, loading };
}

/** Live food container data */
export function useFoodContainer() {
  const [food, setFood] = useState<FoodContainer>({
    remainingGrams: 0,
    maxCapacityGrams: 500,
    lastUpdated: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onFoodContainerChanged((data) => {
      setFood(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { food, loading };
}

/** Live device status */
export function useDeviceStatus() {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onDeviceStatusChanged((data) => {
      setStatus(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { status, loading };
}
