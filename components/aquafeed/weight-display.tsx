import { onDeviceStatusChanged, triggerManualFeed } from '@/services/supabase-service';
import { DeviceStatus } from '@/types/feeder';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function WeightDisplay() {
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [testingServo, setTestingServo] = useState<number | null>(null);

  useEffect(() => {
    // Subscribe to real-time loadcell telemetry from device_status.current_weight
    const unsubscribe = onDeviceStatusChanged((data) => {
      setDeviceStatus(data);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const getWeightColor = () => {
    const weight = deviceStatus?.currentWeight ?? null;
    if (weight === null) return '#666';
    if (weight < 100) return '#f44336'; // Red - low
    if (weight < 200) return '#ff9800'; // Orange - medium
    return '#4caf50'; // Green - good
  };

  const getStatusText = () => {
    if (!deviceStatus) return 'Connecting...';
    if (!deviceStatus.online) return 'Device offline';
    return 'Live';
  };

  const callServoTest = async (servoNumber: 1 | 2) => {
    try {
      setTestingServo(servoNumber);
      // Bridge command through Supabase so it works even when direct LAN HTTP is unreachable.
      await triggerManualFeed(servoNumber === 1 ? -1 : -2);
      Alert.alert('Servo Test', `Servo ${servoNumber} command sent. ESP32 will execute within ~2 seconds.`);
    } catch (error) {
      Alert.alert(
        'Servo Test Failed',
        'Could not send command through Supabase bridge. Check internet/Supabase connection.',
      );
    } finally {
      setTestingServo(null);
    }
  };

  const formatManilaTime = (isoString: string) => {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'Invalid time';

    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  };

  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Food Container Weight</Text>
          <View style={[styles.statusDot, { backgroundColor: deviceStatus?.online ? '#4caf50' : '#f44336' }]} />
        </View>
        
        <View style={styles.weightContainer}>
          <Text style={[styles.weightValue, { color: getWeightColor() }]}>
            {deviceStatus?.currentWeight !== undefined ? deviceStatus.currentWeight.toFixed(1) : '---'}
          </Text>
          <Text style={styles.weightUnit}>g</Text>
        </View>
        
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
          {deviceStatus && (
            <Text style={styles.timestampText}>
              Last (Manila): {formatManilaTime(deviceStatus.lastSeen)}
            </Text>
          )}
        </View>

        <View style={styles.testButtonsRow}>
          <TouchableOpacity
            style={styles.testButton}
            onPress={() => void callServoTest(1)}
            disabled={testingServo !== null}
          >
            <Text style={styles.testButtonText}>
              {testingServo === 1 ? 'Testing...' : 'Test Servo 1'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.testButton}
            onPress={() => void callServoTest(2)}
            disabled={testingServo !== null}
          >
            <Text style={styles.testButtonText}>
              {testingServo === 2 ? 'Testing...' : 'Test Servo 2'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    // Content styles are handled by the parent card
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  weightContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginVertical: 20,
  },
  weightValue: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  weightUnit: {
    fontSize: 24,
    marginLeft: 8,
    color: '#666',
  },
  statusContainer: {
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  timestampText: {
    fontSize: 12,
    color: '#999',
  },
  testButtonsRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  testButton: {
    backgroundColor: '#6367FF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
