/**
 * DemoControls – sleek bottom panel for simulating ESP32 actions in development.
 */

import {
    addHistoryEntry,
    initFoodContainer,
    setFoodRemaining,
    triggerManualFeed,
} from '@/services/supabase-service';
import React, { useState } from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function DemoControls() {
  const [foodInput, setFoodInput] = useState('450');
  const [manualAmount, setManualAmount] = useState('5');

  const handleSetFood = async () => {
    const grams = parseInt(foodInput, 10);
    if (isNaN(grams) || grams < 0) {
      Alert.alert('Invalid', 'Enter a valid number of grams.');
      return;
    }
    await setFoodRemaining(grams);
  };

  const handleManualFeed = async () => {
    const amount = parseInt(manualAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid', 'Enter a valid amount.');
      return;
    }
    
    // Get current food amount and decrease it
    const currentFood = parseInt(foodInput, 10);
    const newAmount = Math.max(0, currentFood - amount);
    
    // Update food container first
    await setFoodRemaining(newAmount);
    setFoodInput(newAmount.toString());
    
    // Then add history entry
    await triggerManualFeed(amount);
    await addHistoryEntry({
      timestamp: new Date().toISOString().replace('T', ' at ').slice(0, 22),
      amount,
      status: 'completed',
      triggeredBy: 'manual',
    });
    
    Alert.alert('Success', `${amount}g dispensed. Remaining: ${newAmount}g`);
  };

  const handleInitDB = async () => {
    await initFoodContainer(500, 450);
    Alert.alert('Done', 'Firebase database initialised with default values.');
  };

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <Text style={styles.title}>Demo Controls</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Food Remaining</Text>
        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            value={foodInput}
            onChangeText={setFoodInput}
            keyboardType="number-pad"
            placeholder="grams"
            placeholderTextColor="#6b6b8a"
          />
          <Text style={styles.unit}>g</Text>
          <TouchableOpacity style={styles.btn} onPress={handleSetFood}>
            <Text style={styles.btnText}>Set</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Manual Feed</Text>
        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            value={manualAmount}
            onChangeText={setManualAmount}
            keyboardType="number-pad"
            placeholder="grams"
            placeholderTextColor="#6b6b8a"
          />
          <Text style={styles.unit}>g</Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnFeed]}
            onPress={handleManualFeed}
          >
            <Text style={styles.btnText}>Feed</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.initBtn}
        onPress={handleInitDB}
      >
        <Text style={styles.initBtnText}>Initialize Firebase DB</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginTop: 20,
    marginHorizontal: 16,
    borderRadius: 20,
    marginBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3a3a5c',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 18,
  },
  row: {
    marginBottom: 14,
  },
  label: {
    color: '#8494FF',
    fontSize: 12,
    fontFamily: 'Montserrat_500Medium',
    marginBottom: 8,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    backgroundColor: '#2a2a42',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Montserrat_500Medium',
    flex: 1,
    textAlign: 'center',
  },
  unit: {
    color: '#6b6b8a',
    fontSize: 13,
    fontFamily: 'Montserrat_400Regular',
  },
  btn: {
    backgroundColor: '#6367FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnFeed: {
    backgroundColor: '#8494FF',
  },
  btnText: {
    color: '#fff',
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 13,
  },
  initBtn: {
    backgroundColor: '#2a2a42',
    borderWidth: 1,
    borderColor: '#6367FF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  initBtnText: {
    color: '#C9BEFF',
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 13,
  },
});
