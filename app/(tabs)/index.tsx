/**
 * AquaFeed Pro – Main Dashboard Screen
 * Shows food container, feeding schedules, feeding history, and demo controls.
 */

import React, { useCallback, useState } from 'react';
import {
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import AppHeader from '@/components/aquafeed/app-header';
import FoodContainerCard from '@/components/aquafeed/food-container-card';
import HistoryCard from '@/components/aquafeed/history-card';
import ScheduleCard from '@/components/aquafeed/schedule-card';
import ScheduleModal from '@/components/aquafeed/schedule-modal';

import {
    useDeviceStatus,
    useFoodContainer,
    useHistory,
    useSchedules,
} from '@/hooks/use-firebase';

import {
    addSchedule,
    deleteSchedule,
    toggleSchedule,
    updateSchedule,
} from '@/services/supabase-service';

import type { FeedingSchedule } from '@/types/feeder';

export default function HomeScreen() {
  const { schedules } = useSchedules();
  const { history } = useHistory();
  const { food } = useFoodContainer();
  const { status } = useDeviceStatus();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] =
    useState<FeedingSchedule | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /* ---- Schedule CRUD ---- */

  const handleAddPress = useCallback(() => {
    setEditingSchedule(null);
    setModalVisible(true);
  }, []);

  const handleEditPress = useCallback((schedule: FeedingSchedule) => {
    setEditingSchedule(schedule);
    setModalVisible(true);
  }, []);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      await toggleSchedule(id, enabled);
    } catch {
      Alert.alert('Error', 'Failed to toggle schedule.');
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    Alert.alert('Delete Schedule', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSchedule(id);
          } catch {
            Alert.alert('Error', 'Failed to delete schedule.');
          }
        },
      },
    ]);
  }, []);

  const handleSaveSchedule = useCallback(
    async (data: { time: string; amount: number }) => {
      console.log('handleSaveSchedule called with:', data);
      console.log('editingSchedule:', editingSchedule);
      
      try {
        if (editingSchedule) {
          console.log('Updating existing schedule...');
          await updateSchedule({
            ...editingSchedule,
            time: data.time,
            amount: data.amount,
          });
          console.log('Schedule updated successfully');
        } else {
          console.log('Adding new schedule...');
          const result = await addSchedule({
            time: data.time,
            amount: data.amount,
            enabled: true,
          });
          console.log('Schedule added successfully with ID:', result);
        }
        setModalVisible(false);
        console.log('Modal closed');
      } catch (error) {
        console.error('Failed to save schedule:', error);
        Alert.alert('Error', 'Failed to save schedule.');
      }
    },
    [editingSchedule],
  );

  /* ---- Pull to refresh (no-op since Firebase is real-time) ---- */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  return (
    <View style={styles.root}>
      <AppHeader deviceOnline={status?.online} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <FoodContainerCard food={food} />

        <ScheduleCard
          schedules={schedules}
          onAdd={handleAddPress}
          onToggle={handleToggle}
          onEdit={handleEditPress}
          onDelete={handleDelete}
        />

        <HistoryCard history={history} />
      </ScrollView>

      <ScheduleModal
        visible={modalVisible}
        schedule={editingSchedule}
        onSave={handleSaveSchedule}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f6fd',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
});
