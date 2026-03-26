/**
 * Real-time load cell weight tracking service
 * This would connect to ESP32 via WebSocket or HTTP polling
 */

import { supabase } from '@/config/supabase';

export interface WeightReading {
  timestamp: string;
  weight: number;
  unit: 'g' | 'kg';
  stable: boolean;
}

// Start with zero weight (will get real data from ESP32)
let weightInterval: NodeJS.Timeout | null = null;
let currentWeight = 0.0;  // Start at 0g
let isStable = true;
let lastKnownWorkingIp: string | null = null;
let lastProbeAt = 0;
let hasLoggedFallbackWarning = false;

const PROBE_COOLDOWN_MS = 10000;
const REQUEST_TIMEOUT_MS = 1000;

function getConfiguredEsp32Ips(): string[] {
  const env = process.env.EXPO_PUBLIC_ESP32_IPS;

  if (env && env.trim().length > 0) {
    return env
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [
    '192.168.4.1', // ESP32 AP mode (primary)
    '192.168.4.2', // Alternative AP IP
    '192.168.254.154', // Current LAN IP from WiFiManager logs
  ];
}

// Mock weight fluctuations for demo (when ESP32 not connected)
function simulateWeightFluctuation() {
  // Start with a more realistic base weight
  if (currentWeight === 0.0) {
    currentWeight = 150.0; // Start at 150g for demo
  }
  
  const fluctuation = (Math.random() - 0.5) * 2; // ±1g fluctuation
  currentWeight += fluctuation;
  
  // Simulate stability changes
  if (Math.random() < 0.1) { // 10% chance of instability
    isStable = false;
    setTimeout(() => { isStable = true; }, 2000);
  }
  
  return {
    timestamp: new Date().toISOString(),
    weight: Math.max(0, currentWeight),
    unit: 'g' as const,
    stable: isStable
  };
}

export function startWeightTracking(callback: (reading: WeightReading) => void) {
  // Clear existing interval
  if (weightInterval) {
    clearInterval(weightInterval as any);
  }
  
  // Start real-time updates every 500ms
  weightInterval = setInterval(async () => {
    // Try to get real data from ESP32 first
    const realReading = await getWeightFromESP32();
    
    if (realReading) {
      // Use real ESP32 data
      currentWeight = realReading.weight;
      isStable = realReading.stable;
      hasLoggedFallbackWarning = false;
      callback(realReading);
    } else {
      // Fallback to simulated data if ESP32 not available
      if (!hasLoggedFallbackWarning) {
        console.warn('ESP32 not reachable, using simulated data. Set EXPO_PUBLIC_ESP32_IPS to your device IP.');
        hasLoggedFallbackWarning = true;
      }
      const reading = simulateWeightFluctuation();
      callback(reading);
    }
  }, 500) as any;
  
  return () => {
    if (weightInterval) {
      clearInterval(weightInterval as any);
      weightInterval = null;
    }
  };
}

// Get real weight from ESP32
export async function getWeightFromESP32(): Promise<WeightReading | null> {
  try {
    const now = Date.now();
    if (now - lastProbeAt < PROBE_COOLDOWN_MS) {
      return null;
    }

    lastProbeAt = now;

    // Try the last successful IP first, then fallback list.
    const possibleIPs = [
      ...(lastKnownWorkingIp ? [lastKnownWorkingIp] : []),
      ...getConfiguredEsp32Ips().filter((ip) => ip !== lastKnownWorkingIp),
    ];

    for (const ip of possibleIPs) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        
        const response = await fetch(`http://${ip}/weight`, { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          lastKnownWorkingIp = ip;
          console.log(`✅ Connected to ESP32 at ${ip}`);
          return {
            timestamp: new Date().toISOString(),
            weight: data.weight || 0,
            unit: data.unit || 'g',
            stable: data.stable !== false // Default to true
          };
        }
      } catch (ipError) {
        // Silently try next IP
        continue;
      }
    }
    
    // No ESP32 found - return null silently
    return null;
  } catch (error) {
    // Silently return null
    return null;
  }
}

// Update Supabase with current weight
export async function updateWeightInSupabase(weight: number): Promise<void> {
  try {
    const { error } = await supabase
      .from('inventory')
      .update({ amount_remaining: weight })
      .eq('id', 1);
    
    if (error) throw error;
  } catch (error) {
    console.error('Failed to update weight in Supabase:', error);
  }
}
