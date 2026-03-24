import { database } from '@/config/firebase';
import { ref, set, get, onValue } from 'firebase/database';

// Test Firebase connection
export const testFirebaseConnection = async () => {
  try {
    console.log('Testing Firebase connection...');
    
    // Test write
    const testRef = ref(database, 'test/connection');
    await set(testRef, {
      timestamp: new Date().toISOString(),
      status: 'connected',
      from: 'mobile-app'
    });
    
    console.log('✅ Firebase write successful');
    
    // Test read
    const snapshot = await get(testRef);
    if (snapshot.exists()) {
      console.log('✅ Firebase read successful:', snapshot.val());
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Firebase connection failed:', error);
    return false;
  }
};

// Listen to device status
export const listenToDeviceStatus = (deviceId: string, callback: (status: any) => void) => {
  const statusRef = ref(database, `telemetry/status/${deviceId}`);
  
  return onValue(statusRef, (snapshot) => {
    const data = snapshot.val();
    console.log('Device status updated:', data);
    callback(data);
  });
};

// Send feed command to device
export const sendFeedCommand = async (deviceId: string, amount: number) => {
  try {
    const commandRef = ref(database, `commands/${deviceId}/pending`);
    const commandId = Date.now().toString();
    
    await set(commandRef, {
      [commandId]: {
        id: commandId,
        type: 'feed',
        amount: amount,
        timestamp: new Date().toISOString(),
        status: 'pending'
      }
    });
    
    console.log(`✅ Feed command sent to ${deviceId}: ${amount}g`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send feed command:', error);
    return false;
  }
};
