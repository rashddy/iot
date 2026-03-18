/**
 * AppHeader – premium header with status dot indicator.
 */

import React from 'react';
import {
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native';

interface Props {
  deviceOnline?: boolean;
}

export default function AppHeader({ deviceOnline }: Props) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#6367FF" />
      <View style={styles.inner}>
        <View>
          <Text style={styles.title}>AquaFeed Pro</Text>
          <Text style={styles.subtitle}>Smart Fish Feeder Control</Text>
        </View>
        <View style={styles.statusContainer}>
          {deviceOnline !== undefined && (
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: deviceOnline ? '#34d399' : '#f87171' },
                ]}
              />
              <Text style={styles.statusText}>
                {deviceOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#6367FF',
    paddingTop: 54,
    paddingBottom: 28,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 26,
    fontFamily: 'Montserrat_800ExtraBold',
    color: '#fff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Montserrat_400Regular',
    color: '#C9BEFF',
    marginTop: 4,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Montserrat_500Medium',
    color: '#fff',
  },
});
