/**
 * ScheduleCard – elegant schedule list with toggle, edit and delete.
 */

import type { FeedingSchedule } from '@/types/feeder';
import React, { useEffect, useMemo, useState } from 'react';
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
  const [nowMs, setNowMs] = useState(Date.now());

  const getManilaNow = () => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = fmt.formatToParts(new Date());
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }

    return new Date(
      Number.parseInt(map.year, 10),
      Number.parseInt(map.month, 10) - 1,
      Number.parseInt(map.day, 10),
      Number.parseInt(map.hour, 10),
      Number.parseInt(map.minute, 10),
      Number.parseInt(map.second, 10),
      0,
    );
  };

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, []);

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

  const formatWeight = (value: number) => {
    return Number.isInteger(value) ? `${value}` : value.toFixed(1);
  };

  const formatScheduleAmount = (schedule: FeedingSchedule) => {
    if (
      typeof schedule.minWeight === 'number' &&
      typeof schedule.maxWeight === 'number'
    ) {
      return `${formatWeight(schedule.minWeight)}-${formatWeight(schedule.maxWeight)}g per feed`;
    }

    return `${formatWeight(schedule.amount)}g per feed`;
  };

  const nextSchedule = useMemo(() => {
    const now = getManilaNow();
    let best: { schedule: FeedingSchedule; runAt: Date } | null = null;

    for (const schedule of schedules) {
      if (!schedule.enabled) continue;

      const [hRaw, mRaw] = schedule.time.split(':');
      const h = Number.parseInt(hRaw, 10);
      const m = Number.parseInt(mRaw, 10);
      if (Number.isNaN(h) || Number.isNaN(m)) continue;

      const runAt = new Date(now);
      runAt.setHours(h, m, 0, 0);
      if (runAt.getTime() <= now.getTime()) {
        runAt.setDate(runAt.getDate() + 1);
      }

      if (!best || runAt.getTime() < best.runAt.getTime()) {
        best = { schedule, runAt };
      }
    }

    if (!best) return null;

    const diffMs = Math.max(0, best.runAt.getTime() - now.getTime());
    const totalSec = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    return {
      label: formatTime12Hour(best.schedule.time),
      hours,
      minutes,
      seconds,
    };
  }, [nowMs, schedules]);

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
        <Text style={styles.scheduleAmount}>{formatScheduleAmount(item)}</Text>
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

      {nextSchedule ? (
        <View style={styles.nextRunBox}>
          <Text style={styles.nextRunTitle}>Next feed at {nextSchedule.label}</Text>
          <Text style={styles.nextRunValue}>
            {nextSchedule.hours}h {nextSchedule.minutes}m {nextSchedule.seconds}s remaining
          </Text>
        </View>
      ) : (
        <View style={styles.nextRunBox}>
          <Text style={styles.nextRunTitle}>Next feed</Text>
          <Text style={styles.nextRunValue}>No enabled schedules</Text>
        </View>
      )}

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
  nextRunBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ebe8ff',
    backgroundColor: '#f7f6ff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  nextRunTitle: {
    fontSize: 12,
    fontFamily: 'Montserrat_500Medium',
    color: '#6367FF',
  },
  nextRunValue: {
    marginTop: 2,
    fontSize: 14,
    fontFamily: 'Montserrat_700Bold',
    color: '#2d2d44',
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
