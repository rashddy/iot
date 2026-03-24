import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { testFirebaseConnection, sendFeedCommand } from '@/services/firebase-test';

export default function FirebaseTest() {
  const [status, setStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const testConnection = async () => {
    setStatus('testing');
    setMessage('Testing Firebase connection...');
    
    const success = await testFirebaseConnection();
    
    if (success) {
      setStatus('connected');
      setMessage('✅ Firebase connection successful!');
    } else {
      setStatus('error');
      setMessage('❌ Firebase connection failed');
    }
  };

  const testFeedCommand = async () => {
    setMessage('Sending feed command...');
    const success = await sendFeedCommand('esp32-device-001', 5);
    
    if (success) {
      setMessage('✅ Feed command sent! Check ESP32 Serial Monitor.');
    } else {
      setMessage('❌ Failed to send feed command');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Firebase Connection Test</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>Status: {status}</Text>
        <Text style={styles.messageText}>{message}</Text>
      </View>

      <TouchableOpacity 
        style={[styles.button, status === 'testing' && styles.buttonDisabled]}
        onPress={testConnection}
        disabled={status === 'testing'}
      >
        <Text style={styles.buttonText}>Test Firebase Connection</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.button, styles.buttonSecondary]}
        onPress={testFeedCommand}
      >
        <Text style={styles.buttonText}>Send Test Feed Command</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  statusContainer: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    minWidth: 300,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  messageText: {
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
    minWidth: 200,
  },
  buttonSecondary: {
    backgroundColor: '#34C759',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
  },
});
