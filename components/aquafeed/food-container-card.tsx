/**
 * FoodContainerCard – displays the remaining food level with a premium gauge.
 */

import { setFoodRemaining } from '@/services/supabase-service';
import type { FoodContainer } from '@/types/feeder';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// Use web-compatible input
const Input = Platform.OS === 'web' ? 'input' : TextInput;

interface Props {
  food: FoodContainer;
}

export default function FoodContainerCard({ food }: Props) {
  const [manualAmount, setManualAmount] = useState(food.remainingGrams);
  const [inputAmount, setInputAmount] = useState(food.remainingGrams.toString());
  const isLowFood = manualAmount <= 100;

  useEffect(() => {
    setManualAmount(food.remainingGrams);
    setInputAmount(food.remainingGrams.toString());
  }, [food.remainingGrams]);
  
  const percentage = food.maxCapacityGrams > 0
    ? Math.min(100, Math.round((manualAmount / food.maxCapacityGrams) * 100))
    : 0;

  const handleSetFood = async () => {
    const grams = parseInt(inputAmount, 10);
    if (isNaN(grams) || grams < 0 || grams > food.maxCapacityGrams) {
      Alert.alert('Invalid', `Enter a value between 0 and ${food.maxCapacityGrams} grams.`);
      return;
    }

    try {
      await setFoodRemaining(grams);
      setManualAmount(grams);
      Alert.alert('Success', `Food amount set to ${grams}g`);
    } catch {
      Alert.alert('Error', 'Failed to update inventory in Supabase');
    }
  };

  const getBarColor = () => {
    if (percentage > 50) return '#6367FF';
    if (percentage > 25) return '#8494FF';
    return '#f87171';
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconCircle}>
            <View style={styles.iconDot} />
          </View>
          <Text style={styles.title}>Food Container</Text>
        </View>
        {isLowFood && (
          <View style={styles.lowBadge}>
            <MaterialIcons name="warning-amber" size={14} color="#fff" />
            <Text style={styles.lowBadgeText}>Low Food</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.remainingValue}>{manualAmount}g</Text>
        <Text style={styles.remainingLabel}>Remaining in funnel</Text>
        {isLowFood && (
          <Text style={styles.lowFoodCaption}>
            Food is running low. Refill soon.
          </Text>
        )}

        <View style={styles.gaugeContainer}>
          <View style={styles.gaugeTrack}>
            <View
              style={[
                styles.gaugeFill,
                { width: `${percentage}%`, backgroundColor: getBarColor() },
              ]}
            />
          </View>
          <View style={styles.gaugeLabels}>
            <Text style={styles.gaugeText}>0g</Text>
            <Text style={styles.gaugeText}>{food.maxCapacityGrams}g</Text>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Set Food Amount:</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={inputAmount}
              onChangeText={setInputAmount}
              keyboardType="number-pad"
              placeholder="grams"
              placeholderTextColor="#999"
            />
            <TouchableOpacity style={styles.setButton} onPress={handleSetFood}>
              <Text style={styles.setButtonText}>Set</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
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
  },
  iconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6367FF',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e1e2e',
  },
  lowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e5484d',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  lowBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Montserrat_700Bold',
  },
  body: {
    alignItems: 'center',
    marginTop: 20,
  },
  remainingValue: {
    fontSize: 48,
    fontFamily: 'Montserrat_800ExtraBold',
    color: '#6367FF',
    letterSpacing: -1,
  },
  remainingLabel: {
    fontSize: 13,
    fontFamily: 'Montserrat_400Regular',
    color: '#8494FF',
    marginTop: 4,
  },
  lowFoodCaption: {
    marginTop: 10,
    fontSize: 13,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#e5484d',
    textAlign: 'center',
  },
  gaugeContainer: {
    width: '100%',
    marginTop: 20,
  },
  gaugeTrack: {
    height: 8,
    backgroundColor: '#f0eeff',
    borderRadius: 4,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  gaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  gaugeText: {
    fontSize: 11,
    fontFamily: 'Montserrat_400Regular',
    color: '#a5a5c0',
  },
  inputContainer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0eeff',
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: 'Montserrat_500Medium',
    color: '#6367FF',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    color: '#333',
  },
  setButton: {
    backgroundColor: '#6367FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
  },
  feedContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0eeff',
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    color: '#333',
  },
  feedButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
  },
});
