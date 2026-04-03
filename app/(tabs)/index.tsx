/**
 * AquaFeed Pro – Main Dashboard Screen
 * Shows food container, feeding schedules, feeding history, and demo controls.
 */

import React, { useCallback, useState } from 'react';
import {
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import AppHeader from '@/components/aquafeed/app-header';
import FoodContainerCard from '@/components/aquafeed/food-container-card';
import HistoryCard from '@/components/aquafeed/history-card';
import ScheduleCard from '@/components/aquafeed/schedule-card';
import ScheduleModal from '@/components/aquafeed/schedule-modal';
import { WeightDisplay } from '@/components/aquafeed/weight-display';

import {
    useDeviceStatus,
    useFoodContainer,
    useHistory,
    useSchedules,
} from '@/hooks/use-firebase';

import {
    addSchedule,
    deleteHistoryEntry,
    deleteSchedule,
    toggleSchedule,
    updateSchedule,
} from '@/services/supabase-service';

import type { FeedingSchedule } from '@/types/feeder';

export default function HomeScreen() {
  const { schedules } = useSchedules();
  const { history } = useHistory();
  const { status } = useDeviceStatus();
  const { food, loading: foodLoading } = useFoodContainer();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] =
    useState<FeedingSchedule | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
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
    setDeleteScheduleId(id);
    setDeleteModalVisible(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalVisible(false);
    setDeleteScheduleId(null);
  }, []);

  const confirmDeleteSchedule = useCallback(async () => {
    if (!deleteScheduleId) return;

    try {
      await deleteSchedule(deleteScheduleId);
      Alert.alert('Deleted', 'Schedule removed successfully.');
      closeDeleteModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete schedule.';
      Alert.alert('Error', message);
    }
  }, [closeDeleteModal, deleteScheduleId]);

  const handleDeleteHistory = useCallback(async (id: string) => {
    Alert.alert('Delete History Entry', 'Delete this history item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteHistoryEntry(id);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete history entry.';
            Alert.alert('Error', message);
          }
        },
      },
    ]);
  }, []);

  const handleSaveSchedule = useCallback(
    async (
      data: { time: string; amount: number; minWeight: number; maxWeight: number },
      options?: { keepOpen?: boolean },
    ) => {
      console.log('handleSaveSchedule called with:', data);
      console.log('editingSchedule:', editingSchedule);
      
      try {
        if (editingSchedule) {
          console.log('Updating existing schedule...');
          await updateSchedule({
            ...editingSchedule,
            time: data.time,
            amount: data.amount,
            minWeight: data.minWeight,
            maxWeight: data.maxWeight,
          });
          console.log('Schedule updated successfully');
        } else {
          console.log('Adding new schedule...');
          const result = await addSchedule({
            time: data.time,
            amount: data.amount,
            minWeight: data.minWeight,
            maxWeight: data.maxWeight,
            enabled: true,
          });
          console.log('Schedule added successfully with ID:', result);
        }

        if (!options?.keepOpen) {
          setModalVisible(false);
          console.log('Modal closed');
        }
      } catch (error) {
        console.error('Failed to save schedule:', error);
        Alert.alert('Error', 'Failed to save schedule.');
        throw error;
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
      <AppHeader
        deviceOnline={status?.online}
        lowFoodAlert={!foodLoading && food.remainingGrams <= 100}
        onNotificationsPress={() => setNotificationsVisible(true)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <FoodContainerCard food={food} />
        <WeightDisplay />

        <ScheduleCard
          schedules={schedules}
          onAdd={handleAddPress}
          onToggle={handleToggle}
          onEdit={handleEditPress}
          onDelete={handleDelete}
        />

        <HistoryCard history={history} onDelete={handleDeleteHistory} />
      </ScrollView>

      <ScheduleModal
        visible={modalVisible}
        schedule={editingSchedule}
        containerRemainingGrams={food.remainingGrams}
        onSave={handleSaveSchedule}
        onClose={() => setModalVisible(false)}
      />

      <Modal
        transparent
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteCard}>
            <Text style={styles.deleteTitle}>Delete Schedule?</Text>
            <Text style={styles.deleteMessage}>
              This action cannot be undone.
            </Text>

            <View style={styles.deleteButtonRow}>
              <TouchableOpacity
                style={[styles.deleteBtn, styles.deleteCancelBtn]}
                onPress={closeDeleteModal}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteBtn, styles.deleteConfirmBtn]}
                onPress={() => {
                  void confirmDeleteSchedule();
                }}
              >
                <Text style={styles.deleteConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={notificationsVisible}
        animationType="fade"
        onRequestClose={() => setNotificationsVisible(false)}
      >
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteCard}>
            <Text style={styles.deleteTitle}>Notifications</Text>
            {!foodLoading && food.remainingGrams <= 100 ? (
              <Text style={styles.deleteMessage}>
                Low food alert: only {food.remainingGrams}g remaining in container.
              </Text>
            ) : (
              <Text style={styles.deleteMessage}>No active alerts right now.</Text>
            )}

            <View style={styles.deleteButtonRow}>
              <TouchableOpacity
                style={[styles.deleteBtn, styles.deleteCancelBtn]}
                onPress={() => setNotificationsVisible(false)}
              >
                <Text style={styles.deleteCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 30, 46, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
  },
  deleteTitle: {
    fontSize: 20,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e1e2e',
    textAlign: 'center',
  },
  deleteMessage: {
    marginTop: 10,
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    color: '#6b6b8a',
    textAlign: 'center',
  },
  deleteButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  deleteCancelBtn: {
    backgroundColor: '#f5f3ff',
  },
  deleteConfirmBtn: {
    backgroundColor: '#e5484d',
  },
  deleteCancelText: {
    color: '#8494FF',
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 15,
  },
  deleteConfirmText: {
    color: '#fff',
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 15,
  },
});
