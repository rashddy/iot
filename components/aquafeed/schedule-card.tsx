/**
 * ScheduleCard – elegant schedule list with toggle, edit and delete.
 */

import type { FeedingSchedule } from '@/types/feeder';
import React from 'react';
import {
    FlatList,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface Props {
  schedules: FeedingSchedule[];
  onAdd: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (schedule: FeedingSchedule) => void;
  onDelete: (id: string) => void;
}

export default function ScheduleCard({
  schedules,
  onAdd,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  // Convert 24-hour time to 12-hour format for display
  const formatTime12Hour = (time24: string) => {
    const [hours, minutes] = time24.split(':');
    const h24 = parseInt(hours, 10);
    
    let h12 = h24;
    let ampm = 'AM';
    
    if (h24 === 0) {
      h12 = 12;
      ampm = 'AM';
    } else if (h24 === 12) {
      h12 = 12;
      ampm = 'PM';
    } else if (h24 > 12) {
      h12 = h24 - 12;
      ampm = 'PM';
    }
    
    return `${h12}:${minutes} ${ampm}`;
  };

  const renderItem = ({ item }: { item: FeedingSchedule }) => (
    <View
      style={[
        styles.scheduleRow,
        { backgroundColor: item.enabled ? '#f5f3ff' : '#fafafa' },
      ]}
    >
      <Switch
        value={item.enabled}
        onValueChange={(val) => onToggle(item.id, val)}
        trackColor={{ false: '#ddd', true: '#8494FF' }}
        thumbColor={item.enabled ? '#6367FF' : '#f4f3f4'}
      />
      <View style={styles.scheduleInfo}>
        <Text style={styles.scheduleTime}>{formatTime12Hour(item.time)}</Text>
        <Text style={styles.scheduleAmount}>{item.amount}g per feed</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onEdit(item)}
          style={styles.actionBtn}
        >
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onDelete(item.id)}
          style={[styles.actionBtn, styles.deleteBtn]}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconCircle}>
            <View style={styles.iconBar1} />
            <View style={styles.iconBar2} />
            <View style={styles.iconBar3} />
          </View>
          <Text style={styles.title}>Feeding Schedule</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {schedules.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No schedules</Text>
          <Text style={styles.emptyDesc}>Tap + Add to create your first feeding schedule</Text>
        </View>
      ) : (
        <FlatList
          data={schedules}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          scrollEnabled={false}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 14,
    shadowColor: '#6367FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFDBFD',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconBar1: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#6367FF',
  },
  iconBar2: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#8494FF',
  },
  iconBar3: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#6367FF',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e1e2e',
  },
  addBtn: {
    backgroundColor: '#6367FF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Montserrat_600SemiBold',
  },
  list: {
    gap: 10,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0eeff',
  },
  scheduleInfo: {
    flex: 1,
    marginLeft: 14,
  },
  scheduleTime: {
    fontSize: 18,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e1e2e',
  },
  scheduleAmount: {
    fontSize: 13,
    fontFamily: 'Montserrat_400Regular',
    color: '#8494FF',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f0eeff',
  },
  actionText: {
    fontSize: 12,
    fontFamily: 'Montserrat_500Medium',
    color: '#6367FF',
  },
  deleteBtn: {
    backgroundColor: '#fff0f0',
  },
  deleteText: {
    fontSize: 12,
    fontFamily: 'Montserrat_500Medium',
    color: '#f87171',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#a5a5c0',
  },
  emptyDesc: {
    fontSize: 13,
    fontFamily: 'Montserrat_400Regular',
    color: '#c4c4d4',
    marginTop: 4,
  },
});
