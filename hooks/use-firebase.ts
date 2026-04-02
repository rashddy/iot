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
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

const LOW_FOOD_THRESHOLD_GRAMS = 100;

async function ensureNotificationPermission() {
  if (Platform.OS === 'web') return false;

  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function notifyLowFood(remainingGrams: number) {
  if (Platform.OS === 'web') {
    Alert.alert('Low Food Warning', `Food container is running low: ${remainingGrams}g remaining.`);
    return;
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('low-food', {
      name: 'Low Food Alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Low Food Warning',
      body: `Food container is at ${remainingGrams}g. Refill soon.`,
      sound: 'default',
    },
    trigger: null,
  });
}

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
  const lastKnownGrams = useRef<number | null>(null);

  useEffect(() => {
    const unsub = onFoodContainerChanged((data) => {
      const previous = lastKnownGrams.current;
      setFood(data);
      setLoading(false);

      if (
        data.remainingGrams <= LOW_FOOD_THRESHOLD_GRAMS &&
        (previous === null || previous > LOW_FOOD_THRESHOLD_GRAMS || previous !== data.remainingGrams)
      ) {
        void notifyLowFood(data.remainingGrams);
      }

      if (data.remainingGrams > LOW_FOOD_THRESHOLD_GRAMS) {
        lastKnownGrams.current = data.remainingGrams;
      } else {
        lastKnownGrams.current = data.remainingGrams;
      }
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
