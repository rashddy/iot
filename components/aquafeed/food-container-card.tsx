/**
 * FoodContainerCard – displays the remaining food level with a premium gauge.
 */

import type { FoodContainer } from '@/types/feeder';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  food: FoodContainer;
}

export default function FoodContainerCard({ food }: Props) {
  const percentage = food.maxCapacityGrams > 0
    ? Math.min(100, Math.round((food.remainingGrams / food.maxCapacityGrams) * 100))
    : 0;

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
      </View>

      <View style={styles.body}>
        <Text style={styles.remainingValue}>{food.remainingGrams}g</Text>
        <Text style={styles.remainingLabel}>Remaining in funnel</Text>

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
});
