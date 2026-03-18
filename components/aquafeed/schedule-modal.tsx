/**
 * ScheduleModal – premium modal for adding / editing a feeding schedule.
 */

import type { FeedingSchedule } from '@/types/feeder';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface Props {
  visible: boolean;
  schedule?: FeedingSchedule | null;
  onSave: (data: { time: string; amount: number }) => void;
  onClose: () => void;
}

export default function ScheduleModal({
  visible,
  schedule,
  onSave,
  onClose,
}: Props) {
  const [hours, setHours] = useState('08');
  const [minutes, setMinutes] = useState('00');
  const [amount, setAmount] = useState('5');

  useEffect(() => {
    if (schedule) {
      const [h, m] = schedule.time.split(':');
      setHours(h);
      setMinutes(m);
      setAmount(String(schedule.amount));
    } else {
      setHours('08');
      setMinutes('00');
      setAmount('5');
    }
  }, [schedule, visible]);

  const handleSave = () => {
    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);
    const a = parseInt(amount, 10);

    if (isNaN(h) || h < 0 || h > 23) {
      Alert.alert('Invalid', 'Hours must be between 0 and 23.');
      return;
    }
    if (isNaN(m) || m < 0 || m > 59) {
      Alert.alert('Invalid', 'Minutes must be between 0 and 59.');
      return;
    }
    if (isNaN(a) || a <= 0 || a > 100) {
      Alert.alert('Invalid', 'Amount must be between 1 and 100 grams.');
      return;
    }

    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onSave({ time, amount: a });
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {schedule ? 'Edit Schedule' : 'New Schedule'}
          </Text>

          <Text style={styles.label}>Time</Text>
          <View style={styles.timeRow}>
            <TextInput
              style={styles.timeInput}
              value={hours}
              onChangeText={setHours}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="HH"
              placeholderTextColor="#a5a5c0"
            />
            <Text style={styles.colon}>:</Text>
            <TextInput
              style={styles.timeInput}
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="MM"
              placeholderTextColor="#a5a5c0"
            />
          </View>

          <Text style={styles.label}>Amount (grams)</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="5"
            placeholderTextColor="#a5a5c0"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={onClose}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.saveBtn]}
              onPress={handleSave}
            >
              <Text style={styles.saveText}>
                {schedule ? 'Update' : 'Add Schedule'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 30, 46, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    width: '88%',
    maxWidth: 400,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e0ddf5',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e1e2e',
    marginBottom: 24,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#8494FF',
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  timeInput: {
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 16,
    fontSize: 32,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e1e2e',
    textAlign: 'center',
    width: 100,
    borderWidth: 2,
    borderColor: '#f0eeff',
  },
  colon: {
    fontSize: 32,
    fontFamily: 'Montserrat_700Bold',
    color: '#6367FF',
  },
  amountInput: {
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 20,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#1e1e2e',
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#f0eeff',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 28,
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#f5f3ff',
  },
  saveBtn: {
    backgroundColor: '#6367FF',
  },
  cancelText: {
    color: '#8494FF',
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 15,
  },
  saveText: {
    color: '#fff',
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 15,
  },
});
