/**
 * HistoryCard – elegant list of recent feeding history entries.
 */

import type { FeedingHistory } from '@/types/feeder';
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

interface Props {
  history: FeedingHistory[];
}

const statusColors: Record<FeedingHistory['status'], string> = {
  completed: '#6367FF',
  failed: '#f87171',
  skipped: '#f59e0b',
};

const statusBg: Record<FeedingHistory['status'], string> = {
  completed: '#f0eeff',
  failed: '#fff0f0',
  skipped: '#fffbe6',
};

export default function HistoryCard({ history }: Props) {
  const renderItem = ({ item, index }: { item: FeedingHistory; index: number }) => (
    <View style={[styles.row, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
      <View style={styles.timelineDot}>
        <View style={[styles.dot, { backgroundColor: statusColors[item.status] }]} />
      </View>
      <View style={styles.info}>
        <Text style={styles.timestamp}>{item.timestamp}</Text>
        <Text style={styles.amount}>{item.amount}g dispensed</Text>
      </View>
      <View
        style={[
          styles.badge,
          { backgroundColor: statusBg[item.status] },
        ]}
      >
        <Text
          style={[styles.badgeText, { color: statusColors[item.status] }]}
        >
          {item.status}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconCircle}>
            <View style={styles.iconLine1} />
            <View style={styles.iconLine2} />
          </View>
          <Text style={styles.title}>Feeding History</Text>
        </View>
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptyDesc}>Feed entries will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={history}
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
    backgroundColor: '#C9BEFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconLine1: {
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#6367FF',
  },
  iconLine2: {
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#8494FF',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e1e2e',
  },
  list: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f3ff',
  },
  rowEven: {},
  rowOdd: {},
  timelineDot: {
    width: 24,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  timestamp: {
    fontSize: 14,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#1e1e2e',
  },
  amount: {
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
    color: '#8494FF',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Montserrat_600SemiBold',
    textTransform: 'capitalize',
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
