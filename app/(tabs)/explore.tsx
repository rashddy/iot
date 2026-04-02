/**
 * AquaFeed Pro – Device & Diagnostics screen
 */

import { useDeviceStatus, useFoodContainer } from '@/hooks/use-firebase';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function DeviceScreen() {
  const { status, loading: statusLoading } = useDeviceStatus();
  const { food, loading: foodLoading } = useFoodContainer();

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>Device Info</Text>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconCircle}>
            <View style={styles.iconInner} />
          </View>
          <Text style={styles.cardTitle}>ESP32 Status</Text>
        </View>

        {statusLoading || !status ? (
          <Text style={styles.muted}>Waiting for device data…</Text>
        ) : (
          <>
            <Row
              label="Status"
              value={status.online ? 'Online' : 'Offline'}
              highlight={status.online}
            />
            <Row label="Last Seen" value={status.lastSeen} />
            <Row label="WiFi RSSI" value={`${status.wifiRSSI} dBm`} />
            <Row label="Uptime" value={formatUptime(status.uptime)} />
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: '#FFDBFD' }]}>
            <View style={[styles.iconInner, { backgroundColor: '#8494FF' }]} />
          </View>
          <Text style={styles.cardTitle}>Food Container</Text>
        </View>

        {foodLoading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : (
          <>
            <Row
              label="Remaining"
              value={`${food.remainingGrams}g / ${food.maxCapacityGrams}g`}
            />
            <Row label="Last Updated" value={food.lastUpdated} />
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: '#C9BEFF' }]}>
            <View style={styles.iconInner} />
          </View>
          <Text style={styles.cardTitle}>System Info</Text>
        </View>
        <Row label="App Version" value="1.0.0" />
        <Row label="Database" value="Supabase" />
        <Row label="MCU" value="ESP32" />
        <Row label="NTP Sync" value="pool.ntp.org" />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f6fd',
  },
  content: {
    padding: 16,
    paddingTop: 60,
    paddingBottom: 40,
  },
  screenTitle: {
    fontSize: 24,
    fontFamily: 'Montserrat_800ExtraBold',
    color: '#1e1e2e',
    marginBottom: 20,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 14,
    shadowColor: '#6367FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0eeff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6367FF',
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e1e2e',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f3ff',
  },
  rowLabel: {
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    color: '#8494FF',
  },
  rowValue: {
    fontSize: 14,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#1e1e2e',
    maxWidth: '60%',
    textAlign: 'right',
  },
  rowHighlight: {
    color: '#6367FF',
  },
  muted: {
    color: '#a5a5c0',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
