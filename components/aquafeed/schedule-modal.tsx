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
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

interface Props {
  visible: boolean;
  schedule?: FeedingSchedule | null;
  containerRemainingGrams: number;
  onSave: (
    data: { time: string; amount: number; minWeight: number; maxWeight: number },
    options?: { keepOpen?: boolean },
  ) => Promise<void> | void;
  onClose: () => void;
}

type DraftSchedule = {
  hours: string;
  minutes: string;
  ampm: 'AM' | 'PM';
  minWeight: string;
  maxWeight: string;
};

const createDraftSchedule = (schedule?: FeedingSchedule | null): DraftSchedule => {
  if (!schedule) {
    return {
      hours: '8',
      minutes: '00',
      ampm: 'AM',
      minWeight: '4.5',
      maxWeight: '5.5',
    };
  }

  const [h24, m] = schedule.time.split(':');
  const h24Num = parseInt(h24, 10);

  let h12 = h24Num;
  let newAmpm: 'AM' | 'PM' = 'AM';

  if (h24Num === 0) {
    h12 = 12;
    newAmpm = 'AM';
  } else if (h24Num === 12) {
    h12 = 12;
    newAmpm = 'PM';
  } else if (h24Num > 12) {
    h12 = h24Num - 12;
    newAmpm = 'PM';
  }

  return {
    hours: String(h12),
    minutes: m,
    ampm: newAmpm,
    minWeight: String(schedule.minWeight ?? Math.max(0, schedule.amount * 0.9)),
    maxWeight: String(schedule.maxWeight ?? Math.max(0, schedule.amount * 1.1)),
  };
};

export default function ScheduleModal({
  visible,
  schedule,
  containerRemainingGrams,
  onSave,
  onClose,
}: Props) {
  const [drafts, setDrafts] = useState<DraftSchedule[]>([
    createDraftSchedule(null),
  ]);

  useEffect(() => {
    setDrafts([createDraftSchedule(schedule)]);
  }, [schedule, visible]);

  const updateDraft = (
    index: number,
    field: keyof DraftSchedule,
    value: string,
  ) => {
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, [field]: value } : draft,
      ),
    );
  };

  const appendDraft = () => {
    setDrafts((current) => [...current, createDraftSchedule(null)]);
  };

  const parseDraft = (draft: DraftSchedule) => {
    const h12 = parseInt(draft.hours, 10);
    const m = parseInt(draft.minutes, 10);
    const minWeight = parseFloat(draft.minWeight);
    const maxWeight = parseFloat(draft.maxWeight);

    if (isNaN(h12) || h12 < 1 || h12 > 12) {
      throw new Error('Hours must be between 1 and 12.');
    }
    if (isNaN(m) || m < 0 || m > 59) {
      throw new Error('Minutes must be between 0 and 59.');
    }
    if (Number.isNaN(minWeight) || minWeight <= 0 || minWeight > 500) {
      throw new Error('Minimum weight must be between 0.1 and 500 grams.');
    }
    if (Number.isNaN(maxWeight) || maxWeight <= 0 || maxWeight > 500) {
      throw new Error('Maximum weight must be between 0.1 and 500 grams.');
    }
    if (maxWeight < minWeight) {
      throw new Error('Maximum weight must be greater than or equal to minimum weight.');
    }

    let h24 = h12;
    if (draft.ampm === 'PM' && h12 !== 12) {
      h24 = h12 + 12;
    } else if (draft.ampm === 'AM' && h12 === 12) {
      h24 = 0;
    }

    return {
      time: `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      amount: (minWeight + maxWeight) / 2,
      minWeight,
      maxWeight,
    };
  };

  const handleSave = async () => {
    let entries: Array<{ time: string; amount: number; minWeight: number; maxWeight: number }> = [];

    try {
      entries = drafts.map(parseDraft);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid schedule input.';
      Alert.alert('Invalid', message);
      return;
    }

    const totalRequested = entries.reduce((sum, entry) => sum + entry.maxWeight, 0);

    for (const entry of entries) {
      if (entry.maxWeight > containerRemainingGrams) {
        Alert.alert(
          'Not enough food',
          `Each schedule max range must be ${containerRemainingGrams}g or less because that is the current amount in the container.`,
        );
        return;
      }
    }

    if (totalRequested > containerRemainingGrams) {
      Alert.alert(
        'Not enough food',
        `The total scheduled max range (${totalRequested.toFixed(1)}g) exceeds the current container amount (${containerRemainingGrams}g).`,
      );
      return;
    }

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const keepOpen = index < entries.length - 1;
      console.log('Calling onSave with:', { ...entry, keepOpen });
      await onSave(entry, { keepOpen });
    }

    if (!schedule) {
      setDrafts([createDraftSchedule(null)]);
    }
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

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
          >
            {drafts.map((draft, index) => (
              <View key={`draft-${index}`} style={styles.draftBlock}>
                <Text style={styles.draftLabel}>
                  {schedule ? 'Schedule' : `Schedule ${index + 1}`}
                </Text>

                <Text style={styles.label}>Time</Text>
                <View style={styles.timeRow}>
                  <TextInput
                    style={styles.timeInput}
                    value={draft.hours}
                    onChangeText={(value) => updateDraft(index, 'hours', value)}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="HH"
                    placeholderTextColor="#a5a5c0"
                  />
                  <Text style={styles.colon}>:</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={draft.minutes}
                    onChangeText={(value) => updateDraft(index, 'minutes', value)}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="MM"
                    placeholderTextColor="#a5a5c0"
                  />
                  <View style={styles.ampmContainer}>
                    <TouchableOpacity
                      style={[styles.ampmButton, draft.ampm === 'AM' && styles.ampmButtonActive]}
                      onPress={() => updateDraft(index, 'ampm', 'AM')}
                    >
                      <Text style={[styles.ampmText, draft.ampm === 'AM' && styles.ampmTextActive]}>AM</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ampmButton, draft.ampm === 'PM' && styles.ampmButtonActive]}
                      onPress={() => updateDraft(index, 'ampm', 'PM')}
                    >
                      <Text style={[styles.ampmText, draft.ampm === 'PM' && styles.ampmTextActive]}>PM</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.label}>Food Range (grams)</Text>
                <View style={styles.rangeRow}>
                  <TextInput
                    style={[styles.amountInput, styles.rangeInput]}
                    value={draft.minWeight}
                    onChangeText={(value) => updateDraft(index, 'minWeight', value)}
                    keyboardType="decimal-pad"
                    placeholder="Min"
                    placeholderTextColor="#a5a5c0"
                  />
                  <Text style={styles.rangeDash}>-</Text>
                  <TextInput
                    style={[styles.amountInput, styles.rangeInput]}
                    value={draft.maxWeight}
                    onChangeText={(value) => updateDraft(index, 'maxWeight', value)}
                    keyboardType="decimal-pad"
                    placeholder="Max"
                    placeholderTextColor="#a5a5c0"
                  />
                </View>
              </View>
            ))}

            {!schedule && (
              <TouchableOpacity style={styles.addAnotherBtn} onPress={appendDraft}>
                <Text style={styles.addAnotherText}>Add Another Schedule</Text>
              </TouchableOpacity>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={onClose}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.saveBtn]}
                onPress={() => {
                  void handleSave();
                }}
              >
                <Text style={styles.saveText}>
                  {schedule ? 'Update' : drafts.length > 1 ? 'Add Schedules' : 'Add Schedule'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    maxHeight: '88%',
  },
  formScroll: {
    flexGrow: 0,
  },
  formContent: {
    paddingBottom: 4,
  },
  draftBlock: {
    marginBottom: 8,
  },
  draftLabel: {
    fontSize: 14,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e1e2e',
    marginBottom: 2,
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
  ampmContainer: {
    flexDirection: 'column',
    marginLeft: 8,
  },
  ampmButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0eeff',
    marginVertical: 2,
  },
  ampmButtonActive: {
    backgroundColor: '#6367FF',
  },
  ampmText: {
    fontSize: 14,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#8494FF',
    textAlign: 'center',
  },
  ampmTextActive: {
    color: 'white',
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
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
  },
  rangeInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rangeDash: {
    width: 18,
    textAlign: 'center',
    marginHorizontal: 8,
    fontSize: 20,
    fontFamily: 'Montserrat_700Bold',
    color: '#6367FF',
  },
  addAnotherBtn: {
    marginTop: 12,
    backgroundColor: '#eef0ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7ddff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  addAnotherText: {
    color: '#4f5af7',
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 14,
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
