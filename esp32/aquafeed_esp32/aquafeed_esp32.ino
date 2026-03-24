#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "RTClib.h"
#include "HX711.h"
#include <ESP32Servo.h>

// --- ADDED FOR WIFI MANAGER ---
#include <WiFiManager.h> 

// --- CONFIGURATION ---
// No more hardcoded SSID/Password needed!
const char* supabase_url = "https://hhqrukpscpohrtmrvvvq.supabase.co/rest/v1/schedules?select=*";
const char* supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocXJ1a3BzY3BvaHJ0bXJ2dnZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzgzNjQsImV4cCI6MjA4OTkxNDM2NH0.E_yezcYwEy3LzNE4PgvXQJazQbPv_p73rUQOaiVthEs";

// --- PINS ---
const int HX711_DOUT = 16;
const int HX711_SCK = 17;
const int SERVO1_PIN = 12;
const int SERVO2_PIN = 14;

// --- OBJECTS ---
RTC_DS3231 rtc;
HX711 scale;
Servo servoDispenser; 
Servo servoThrower;   

// --- STORAGE FOR SCHEDULES ---
struct FeedSchedule {
  int hour;
  int minute;
  float minW;
  float maxW;
};
FeedSchedule activeSchedules[10];
int scheduleCount = 0;
int lastFedMinute = -1;

void setup() {
  Serial.begin(115200);
  
  // 1. Hardware Init
  Wire.begin(21, 22);
  if (!rtc.begin()) {
    Serial.println("Couldn't find RTC");
  }
  
  scale.begin(HX711_DOUT, HX711_SCK);
  scale.set_scale(-1891.89); 
  scale.tare();

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  servoDispenser.setPeriodHertz(50);
  servoThrower.setPeriodHertz(50);
  
  // 2. WiFi Manager Setup
  WiFiManager wm;

  // This will create an Access Point named "feeder"
  // It stays here until the user connects and configures WiFi
  bool res;
  res = wm.autoConnect("feeder"); 

  if(!res) {
    Serial.println("Failed to connect or hit timeout");
    // ESP.restart(); // Uncomment to restart if connection fails
  } else {
    Serial.println("WiFi Connected Successfully!");
  }

  // 3. Initial Sync from Supabase
  fetchSchedules();
}

void loop() {
  DateTime now = rtc.now();

  // Refresh schedules every hour at the 30th minute
  if (now.minute() == 30 && now.second() == 0) {
    fetchSchedules();
  }

  // Check schedules
  for (int i = 0; i < scheduleCount; i++) {
    if (now.hour() == activeSchedules[i].hour && 
        now.minute() == activeSchedules[i].minute && 
        now.minute() != lastFedMinute) {
      
      Serial.println("MATCH FOUND! Starting Cycle...");
      runFeedingCycle(activeSchedules[i].minW, activeSchedules[i].maxW);
      lastFedMinute = now.minute(); 
    }
  }

  delay(1000);
}

void fetchSchedules() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(supabase_url);
    http.addHeader("apikey", supabase_key);
    http.addHeader("Authorization", String("Bearer ") + supabase_key);

    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      DynamicJsonDocument doc(4096);
      deserializeJson(doc, payload);
      JsonArray arr = doc.as<JsonArray>();

      scheduleCount = 0;
      for (JsonObject v : arr) {
        if (scheduleCount < 10) {
          String timeStr = v["feed_time"]; 
          activeSchedules[scheduleCount].hour = timeStr.substring(0, 2).toInt();
          activeSchedules[scheduleCount].minute = timeStr.substring(3, 5).toInt();
          activeSchedules[scheduleCount].minW = v["min_weight"];
          activeSchedules[scheduleCount].maxW = v["max_weight"];
          scheduleCount++;
        }
      }
      Serial.println("Schedules synced from Supabase.");
    }
    http.end();
  }
}

void runFeedingCycle(float targetMin, float targetMax) {
  scale.tare(); 
  float dispensed = 0;

  // PHASE 1: DISPENSE
  while (dispensed < targetMin) {
    servoDispenser.attach(SERVO1_PIN);
    for (int p = 0; p <= 90; p += 5) { servoDispenser.write(p); delay(20); }
    delay(400);
    for (int p = 90; p >= 0; p -= 5) { servoDispenser.write(p); delay(20); }
    servoDispenser.detach(); 
    
    delay(2000); 
    dispensed = scale.get_units(10);
    if (dispensed >= targetMax) break; 
  }

  // PHASE 2: THROW
  delay(1000); 
  servoThrower.attach(SERVO2_PIN);
  for (int p = 0; p <= 180; p += 3) { servoThrower.write(p); delay(15); }
  delay(1500); 
  for (int p = 180; p >= 0; p -= 3) { servoThrower.write(p); delay(15); }
  servoThrower.detach(); 
  
  updateSupabaseInventory(dispensed);
}

void updateSupabaseInventory(float amountRemoved) {
  Serial.print("Dispensed: "); Serial.println(amountRemoved);
}