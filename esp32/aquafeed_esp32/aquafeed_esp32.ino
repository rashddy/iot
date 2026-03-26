#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "RTClib.h"
#include "HX711.h"
#include <ESP32Servo.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <time.h>

// --- CONFIGURATION ---
const char* supabase_url = "https://hhqrukpscpohrtmrvvvq.supabase.co/rest/v1/schedules?select=*";
const char* supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocXJ1a3BzY3BvaHJ0bXJ2dnZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzgzNjQsImV4cCI6MjA4OTkxNDM2NH0.E_yezcYwEy3LzNE4PgvXQJazQbPv_p73rUQOaiVthEs";

// --- PINS (Pin 12 is avoided to prevent boot hang) ---
const int HX711_DOUT = 16;
const int HX711_SCK = 17;
const int SERVO1_PIN = 32; // DISPENSER - Move wire from 12 to 13
const int SERVO2_PIN = 14; // THROWER

// --- OBJECTS ---
RTC_DS3231 rtc;
HX711 scale;
Servo servoDispenser; 
Servo servoThrower;
WebServer server(80);

// --- STORAGE ---
struct FeedSchedule {
  bool enabled;
  int hour;
  int minute;
  int year;
  int month;
  int day;
  bool hasDate;
  float minW;
  float maxW;
};
const int MAX_SCHEDULES = 30;
const int FALLBACK_DISPENSE_CYCLES = 2;
const unsigned long HX711_READY_WAIT_MS = 2500;
const unsigned long MAX_DISPENSE_RUNTIME_MS = 120000;
const unsigned long DISPENSE_STABILIZE_DELAY_MS = 300;
const unsigned long FEEDING_WEIGHT_SYNC_INTERVAL_MS = 1000;
FeedSchedule activeSchedules[MAX_SCHEDULES];
int scheduleCount = 0;
int lastFedMinute = -1;
uint32_t lastFedScheduleEpoch = 0;
bool wifiConnected = false;
bool rtcAvailable = false;
float currentWeight = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastSupabaseUpdateMs = 0;
unsigned long lastWeightSyncMs = 0;
unsigned long lastWeightDebugMs = 0;
unsigned long lastManualCommandCheckMs = 0;
unsigned long lastScheduleRefreshMs = 0;
wl_status_t lastWifiStatus = WL_IDLE_STATUS;
const unsigned long SUPABASE_UPDATE_INTERVAL = 10000; // 10 seconds
const unsigned long WEIGHT_SYNC_INTERVAL = 5000; // 5 seconds for weight updates
const unsigned long WEIGHT_DEBUG_INTERVAL = 3000; // 3 seconds
const unsigned long MANUAL_COMMAND_CHECK_INTERVAL = 2000; // 2 seconds
const unsigned long SCHEDULE_REFRESH_INTERVAL = 30000; // 30 seconds
const unsigned long NTP_SYNC_INTERVAL = 3600000; // 1 hour
const unsigned long NTP_RETRY_INTERVAL = 60000; // 1 minute retry until first successful sync
String lastGoodTimestamp = "2026-01-01T00:00:00Z";
unsigned long lastNtpSyncMs = 0;
bool rtcSyncedFromNtp = false;

// Manila timezone (UTC+8, no DST)
const char* tz_info = "PHT-8";
const char* ntp_server_1 = "pool.ntp.org";
const char* ntp_server_2 = "time.nist.gov";
const unsigned long NTP_SYNC_TIMEOUT_MS = 10000;

// Function Prototypes
bool fetchSchedules();
void setupWebServer();
void runFeedingCycle(float targetMin, float targetMax);
void updateSupabaseInventory(float amountRemoved);
void updateSupabaseStatus();
void syncWeightToSupabase();
bool parseTimeString(const String& timeStr, int& hour, int& minute);
bool parseDateString(const String& dateStr, int& year, int& month, int& day);
bool parseRangeString(const String& rangeStr, float& minW, float& maxW);
bool isScheduleDue(const DateTime& now, const FeedSchedule& schedule);
bool shouldTriggerSchedule(const DateTime& now, const FeedSchedule& schedule, uint32_t& scheduledEpoch);
String formatIsoTimestamp(const DateTime& now);
String formatLocal12Hour(const DateTime& now);
bool isDateTimeReasonable(const DateTime& dt);
DateTime getCurrentDateTime();
void pulseServo(Servo& servo, int pin, int fromAngle, int toAngle, int holdMs, int returnMs);
void cycleDispenserDoor();
void testServoMotion(int servoNumber);
void checkManualFeedCommand();
void clearManualFeedTrigger();
bool syncRtcFromNtp(bool forceLog);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- AquaFeed System Starting ---");
  
  // 1. WiFi Manager first to avoid Port 80 conflicts
  WiFiManager wm;
  // wm.resetSettings(); // Uncomment this once if you want to force the 'feeder' AP to show up
  wm.setConfigPortalTimeout(180); 
  
  Serial.println("Starting WiFi Portal (Connect to 'feeder')...");
  wifiConnected = wm.autoConnect("feeder");
  lastWifiStatus = WiFi.status();
  Serial.printf("WiFi init status=%d, IP=%s, RSSI=%d\n",
    (int)lastWifiStatus,
    WiFi.localIP().toString().c_str(),
    WiFi.RSSI());

  // 2. Hardware Initialization
  Wire.begin(21, 22);
  rtcAvailable = rtc.begin();
  if (!rtcAvailable) {
    Serial.println("RTC Not Found!");
  } else {
    if (rtc.lostPower()) {
      Serial.println("RTC lost power, adjusting to compile time...");
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }

    DateTime rtcNow = rtc.now();
    if (!isDateTimeReasonable(rtcNow)) {
      Serial.println("RTC has invalid datetime, adjusting to compile time...");
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
      rtcNow = rtc.now();
    }

    Serial.printf("RTC current time: %04d-%02d-%02d %02d:%02d:%02d\n",
      rtcNow.year(), rtcNow.month(), rtcNow.day(), rtcNow.hour(), rtcNow.minute(), rtcNow.second());
  }
  
  scale.begin(HX711_DOUT, HX711_SCK);
  scale.set_scale(-1891.89); 
  delay(500);
  scale.tare();
  Serial.println("Scale Zeroed.");

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  servoDispenser.setPeriodHertz(50);
  servoThrower.setPeriodHertz(50);
  
  // 3. Setup Web Server and Fetch Data
  setupWebServer();
  server.begin();
  
  if (wifiConnected) {
    Serial.println("WiFi Connected! Fetching schedules...");
    rtcSyncedFromNtp = syncRtcFromNtp(true);
    bool ok = fetchSchedules();
    lastScheduleRefreshMs = millis();
    Serial.println(ok ? "Schedules fetched successfully." : "Schedule fetch failed; continuing with local runtime.");
  }

  Serial.println("System ready. Web endpoints: /, /weight, /zero, /test");
}

void loop() {
  server.handleClient();

  wl_status_t wifiStatus = WiFi.status();
  if (wifiStatus != lastWifiStatus) {
    Serial.printf("WiFi status changed: %d -> %d\n", (int)lastWifiStatus, (int)wifiStatus);
    if (wifiStatus == WL_CONNECTED) {
      Serial.printf("WiFi connected. IP=%s RSSI=%d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
      rtcSyncedFromNtp = syncRtcFromNtp(true);
    } else {
      rtcSyncedFromNtp = false;
    }
    lastWifiStatus = wifiStatus;
    wifiConnected = (wifiStatus == WL_CONNECTED);
  }
  
  // Update weight every second
  if (scale.is_ready()) {
    currentWeight = scale.get_units(2);
  } else {
    Serial.println("Weight sensor not ready (HX711)");
  }

  if (millis() - lastWeightDebugMs >= WEIGHT_DEBUG_INTERVAL) {
    lastWeightDebugMs = millis();
    Serial.printf("Weight debug: %.2fg (sensorReady=%s)\n", currentWeight, scale.is_ready() ? "true" : "false");
  }
  
  // Check Schedules
  DateTime now = getCurrentDateTime();
  for (int i = 0; i < scheduleCount; i++) {
    uint32_t scheduledEpoch = 0;
    if (shouldTriggerSchedule(now, activeSchedules[i], scheduledEpoch)) {
      Serial.printf("Feeding time reached! target=%.1f-%.1fg\n", activeSchedules[i].minW, activeSchedules[i].maxW);
      runFeedingCycle(activeSchedules[i].minW, activeSchedules[i].maxW);
      lastFedScheduleEpoch = scheduledEpoch;
      lastFedMinute = now.minute();
    }
  }

  if (millis() - lastHeartbeatMs >= 10000) {
    lastHeartbeatMs = millis();
    Serial.printf("Heartbeat: IP=%s, weight=%.2fg, schedules=%d\n",
      WiFi.localIP().toString().c_str(), currentWeight, scheduleCount);
  }

  // Update Supabase with device status every 10 seconds
  if (wifiConnected && (millis() - lastSupabaseUpdateMs >= SUPABASE_UPDATE_INTERVAL)) {
    lastSupabaseUpdateMs = millis();
    updateSupabaseStatus();
  }

  // Sync weight to Supabase every 5 seconds
  if (wifiConnected && (millis() - lastWeightSyncMs >= WEIGHT_SYNC_INTERVAL)) {
    lastWeightSyncMs = millis();
    syncWeightToSupabase();
  }

  // Check manual_feed command via Supabase bridge every 2 seconds
  if (wifiConnected && (millis() - lastManualCommandCheckMs >= MANUAL_COMMAND_CHECK_INTERVAL)) {
    lastManualCommandCheckMs = millis();
    checkManualFeedCommand();
  }

  // Periodically refresh schedules so app-added changes are picked up automatically.
  if (wifiConnected && (millis() - lastScheduleRefreshMs >= SCHEDULE_REFRESH_INTERVAL)) {
    lastScheduleRefreshMs = millis();
    bool refreshed = fetchSchedules();
    Serial.printf("Auto schedule refresh: %s (count=%d)\n", refreshed ? "ok" : "failed", scheduleCount);
  }

  // Keep RTC aligned with real world time to avoid missed schedule events.
  // Before first success: retry every minute. After success: refresh every hour.
  if (wifiConnected) {
    unsigned long targetInterval = rtcSyncedFromNtp ? NTP_SYNC_INTERVAL : NTP_RETRY_INTERVAL;
    if (millis() - lastNtpSyncMs >= targetInterval) {
      rtcSyncedFromNtp = syncRtcFromNtp(!rtcSyncedFromNtp);
    }
  }
  
  delay(500);
}

void setupWebServer() {
  server.on("/", []() {
    String html = "<html><head><title>AquaFeed</title><meta http-equiv='refresh' content='5'></head><body>";
    html += "<h1>Fish Feeder Status</h1>";
    html += "<p>WiFi: " + String(wifiConnected ? "Connected" : "AP Mode") + "</p>";
    html += "<p>Weight: " + String(currentWeight, 1) + "g</p>";
    html += "<p>Schedules Loaded: " + String(scheduleCount) + "</p>";
    html += "<hr><a href='/zero'>Zero Scale</a> | <a href='/test'>Fetch Schedules</a>";
    html += "</body></html>";
    server.send(200, "text/html", html);
  });

  server.on("/weight", []() {
    String json = "{\"weight\":" + String(currentWeight, 2) + ",\"unit\":\"g\",\"stable\":" + String(scale.is_ready() ? "true" : "false") + "}";
    
    // Add CORS headers for React Native WebView
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    
    server.send(200, "application/json", json);
  });

  server.on("/time", []() {
    DateTime rtcNow = getCurrentDateTime();

    struct tm localTm;
    localTm.tm_year = rtcNow.year() - 1900;
    localTm.tm_mon = rtcNow.month() - 1;
    localTm.tm_mday = rtcNow.day();
    localTm.tm_hour = rtcNow.hour();
    localTm.tm_min = rtcNow.minute();
    localTm.tm_sec = rtcNow.second();
    localTm.tm_isdst = -1;

    time_t epoch = mktime(&localTm);
    struct tm utcTm;
    gmtime_r(&epoch, &utcTm);

    char localBuf[32];
    char utcBuf[32];
    snprintf(localBuf, sizeof(localBuf), "%04d-%02d-%02d %02d:%02d:%02d",
      rtcNow.year(), rtcNow.month(), rtcNow.day(), rtcNow.hour(), rtcNow.minute(), rtcNow.second());
    snprintf(utcBuf, sizeof(utcBuf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
      utcTm.tm_year + 1900, utcTm.tm_mon + 1, utcTm.tm_mday,
      utcTm.tm_hour, utcTm.tm_min, utcTm.tm_sec);

    String json = "{";
    json += "\"rtc_local\":\"" + String(localBuf) + "\",";
    json += "\"utc\":\"" + String(utcBuf) + "\",";
    json += "\"tz\":\"" + String(tz_info) + "\",";
    json += "\"ntp_synced\":" + String(rtcSyncedFromNtp ? "true" : "false") + ",";
    json += "\"rtc_available\":" + String(rtcAvailable ? "true" : "false");
    json += "}";

    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", json);
  });

  server.on("/zero", []() {
    scale.tare();
    server.send(200, "text/plain", "Scale Zeroed. Return to home.");
  });

  server.on("/test", []() {
    Serial.println("Manual /test endpoint called: fetching schedules...");
    bool success = fetchSchedules();
    Serial.printf("Manual /test result: %s\n", success ? "success" : "failed");
    server.send(200, "text/plain", success ? "Schedules updated!" : "Failed to fetch.");
  });

  server.on("/servo1", []() {
    Serial.println("Manual /servo1 endpoint called");
    testServoMotion(1);
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "text/plain", "Servo1 test executed");
  });

  server.on("/servo2", []() {
    Serial.println("Manual /servo2 endpoint called");
    testServoMotion(2);
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "text/plain", "Servo2 test executed");
  });

  // Add local schedule via URL:
  // /add?time=08:30&range=100-120&date=2026-03-26
  server.on("/add", []() {
    if (!server.hasArg("time") || !server.hasArg("range")) {
      server.send(400, "text/plain", "Missing args. Required: time=HH:MM and range=min-max. Optional: date=YYYY-MM-DD");
      return;
    }

    if (scheduleCount >= MAX_SCHEDULES) {
      server.send(400, "text/plain", "Schedule storage full (max 30)");
      return;
    }

    int hour = 0;
    int minute = 0;
    float minW = 0;
    float maxW = 0;

    if (!parseTimeString(server.arg("time"), hour, minute)) {
      server.send(400, "text/plain", "Invalid time. Use HH:MM");
      return;
    }

    if (!parseRangeString(server.arg("range"), minW, maxW)) {
      server.send(400, "text/plain", "Invalid range. Use min-max (example 100-120)");
      return;
    }

    FeedSchedule s;
    s.enabled = true;
    s.hour = hour;
    s.minute = minute;
    s.minW = minW;
    s.maxW = maxW;
    s.hasDate = false;
    s.year = 0;
    s.month = 0;
    s.day = 0;

    if (server.hasArg("date") && server.arg("date").length() > 0) {
      int y = 0;
      int m = 0;
      int d = 0;
      if (!parseDateString(server.arg("date"), y, m, d)) {
        server.send(400, "text/plain", "Invalid date. Use YYYY-MM-DD");
        return;
      }
      s.hasDate = true;
      s.year = y;
      s.month = m;
      s.day = d;
    }

    activeSchedules[scheduleCount++] = s;

    String msg = "Added schedule: ";
    if (s.hasDate) {
      msg += String(s.year) + "-" + String(s.month) + "-" + String(s.day) + " ";
    } else {
      msg += "(daily) ";
    }
    msg += String(s.hour) + ":" + String(s.minute);
    msg += " range=" + String(s.minW, 1) + "-" + String(s.maxW, 1) + "g";

    Serial.println(msg);
    server.send(200, "text/plain", msg);
  });

  server.on("/schedules", []() {
    String json = "[";
    for (int i = 0; i < scheduleCount; i++) {
      if (i > 0) json += ",";
      json += "{";
      json += "\"enabled\":" + String(activeSchedules[i].enabled ? "true" : "false") + ",";
      json += "\"time\":\"" + String(activeSchedules[i].hour) + ":" + String(activeSchedules[i].minute) + "\",";
      json += "\"min_weight\":" + String(activeSchedules[i].minW, 1) + ",";
      json += "\"max_weight\":" + String(activeSchedules[i].maxW, 1) + ",";
      json += "\"has_date\":" + String(activeSchedules[i].hasDate ? "true" : "false");
      if (activeSchedules[i].hasDate) {
        json += ",\"date\":\"" + String(activeSchedules[i].year) + "-" + String(activeSchedules[i].month) + "-" + String(activeSchedules[i].day) + "\"";
      }
      json += "}";
    }
    json += "]";

    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", json);
  });
}

bool fetchSchedules() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("fetchSchedules: WiFi not connected.");
    return false;
  }
  
  HTTPClient http;
  http.setTimeout(8000);
  Serial.println("fetchSchedules: starting HTTPS GET...");
  http.begin(supabase_url);
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", "Bearer " + String(supabase_key));

  int httpCode = http.GET();
  Serial.printf("fetchSchedules: HTTP code=%d\n", httpCode);
  if (httpCode == 200) {
    String payload = http.getString();
    DynamicJsonDocument doc(2048);
    DeserializationError parseError = deserializeJson(doc, payload);
    if (parseError) {
      Serial.printf("fetchSchedules: JSON parse failed: %s\n", parseError.c_str());
      http.end();
      return false;
    }
    JsonArray arr = doc.as<JsonArray>();

    scheduleCount = 0;
    for (JsonObject v : arr) {
      if (scheduleCount < MAX_SCHEDULES) {
        String timeStr = "";
        if (!v["feed_time"].isNull()) {
          timeStr = String((const char*)v["feed_time"]);
        }

        int hour = 0;
        int minute = 0;
        if (!parseTimeString(timeStr, hour, minute)) {
          continue;
        }

        float minW = 0;
        float maxW = 0;
        bool hasRange = false;

        if (!v["min_weight"].isNull() && !v["max_weight"].isNull()) {
          minW = (float)v["min_weight"];
          maxW = (float)v["max_weight"];
          hasRange = true;
        }

        if (!hasRange && !v["amount_range"].isNull()) {
          hasRange = parseRangeString(String((const char*)v["amount_range"]), minW, maxW);
        }

        if (!hasRange && !v["feed_range"].isNull()) {
          hasRange = parseRangeString(String((const char*)v["feed_range"]), minW, maxW);
        }

        if (!hasRange && !v["amount"].isNull()) {
          float amount = (float)v["amount"];
          if (amount > 0) {
            minW = amount * 0.9;
            maxW = amount * 1.1;
            hasRange = true;
          }
        }

        if (!hasRange || minW <= 0 || maxW <= 0) {
          continue;
        }

        if (minW > maxW) {
          float tmp = minW;
          minW = maxW;
          maxW = tmp;
        }

        FeedSchedule s;
        s.enabled = v["enabled"].isNull() ? true : (bool)v["enabled"];
        s.hour = hour;
        s.minute = minute;
        s.minW = minW;
        s.maxW = maxW;
        s.hasDate = false;
        s.year = 0;
        s.month = 0;
        s.day = 0;

        String dateStr = "";
        if (!v["feed_date"].isNull()) {
          dateStr = String((const char*)v["feed_date"]);
        } else if (!v["schedule_date"].isNull()) {
          dateStr = String((const char*)v["schedule_date"]);
        }

        if (dateStr.length() > 0) {
          int y = 0;
          int m = 0;
          int d = 0;
          if (parseDateString(dateStr, y, m, d)) {
            s.hasDate = true;
            s.year = y;
            s.month = m;
            s.day = d;
          }
        }

        activeSchedules[scheduleCount++] = s;
      }
    }
    Serial.printf("fetchSchedules: loaded %d schedules.\n", scheduleCount);
    http.end();
    return true;
  }

  String body = http.getString();
  if (body.length() > 0) {
    Serial.printf("fetchSchedules: response body: %s\n", body.c_str());
  }
  http.end();
  return false;
}

void runFeedingCycle(float targetMin, float targetMax) {
  Serial.printf("runFeedingCycle: start target range %.2f-%.2fg\n", targetMin, targetMax);

  if (targetMin <= 0 || targetMax <= 0) {
    Serial.println("runFeedingCycle: invalid target range");
    return;
  }

  if (targetMin > targetMax) {
    float temp = targetMin;
    targetMin = targetMax;
    targetMax = temp;
  }

  // Wait briefly for HX711 readiness to avoid false fallback when sensor is just slow.
  unsigned long readyWaitStart = millis();
  while (!scale.is_ready() && (millis() - readyWaitStart < HX711_READY_WAIT_MS)) {
    delay(50);
  }

  // Fail-safe path: if HX711 is still unavailable, do not trigger throw servo
  // because target weight cannot be verified.
  if (!scale.is_ready()) {
    Serial.println("runFeedingCycle: HX711 still not ready, running dispenser-only fallback and skipping throw servo");
    for (int i = 0; i < FALLBACK_DISPENSE_CYCLES; i++) {
      cycleDispenserDoor();
      delay(1200);
    }

    Serial.println("runFeedingCycle: fallback finished without Servo2 and without inventory update (weight unverified)");
    return;
  }

  scale.tare();
  float dispensed = 0;
  bool targetMet = false;
  unsigned long dispenseStartMs = millis();
  unsigned long lastInCycleSyncMs = 0;
  int cycle = 0;

  // Dispense phase: keep running Servo1 until min target is reached, with a runtime safety cap.
  while (dispensed < targetMin && (millis() - dispenseStartMs) < MAX_DISPENSE_RUNTIME_MS) {
    cycle++;
    Serial.printf("runFeedingCycle: dispenser cycle %d\n", cycle);
    cycleDispenserDoor();
    delay(DISPENSE_STABILIZE_DELAY_MS);

    if (scale.is_ready()) {
      dispensed = scale.get_units(5);
      currentWeight = dispensed;
    } else {
      Serial.println("runFeedingCycle: HX711 not ready while checking dispensed weight");
    }
    Serial.printf("Dispense cycle %d: %.2fg (target %.2f-%.2fg)\n", cycle, dispensed, targetMin, targetMax);

    // Keep dashboard telemetry fresh while feed cycle is running.
    if (wifiConnected && (millis() - lastInCycleSyncMs >= FEEDING_WEIGHT_SYNC_INTERVAL_MS)) {
      syncWeightToSupabase();
      lastInCycleSyncMs = millis();
    }

    if (dispensed >= targetMin) {
      targetMet = true;
      if (dispensed > targetMax) {
        Serial.printf("runFeedingCycle: overshoot %.2fg > %.2fg (continuing to throw phase)\n", dispensed, targetMax);
      }
      break;
    }
  }

  if (!targetMet && dispensed < targetMin && (millis() - dispenseStartMs) >= MAX_DISPENSE_RUNTIME_MS) {
    Serial.printf("runFeedingCycle: timeout before reaching min target (%.2fg < %.2fg)\n", dispensed, targetMin);
  }

  // Throw phase only when target range is met.
  if (targetMet) {
    Serial.println("runFeedingCycle: target met, activating throw servo");
    delay(300);
    pulseServo(servoThrower, SERVO2_PIN, 0, 175, 900, 900);
    updateSupabaseInventory(dispensed);
    Serial.printf("runFeedingCycle: dropped %.2fg and updated container inventory\n", dispensed);
  } else {
    Serial.println("runFeedingCycle: target range not met, skipping throw servo and inventory update");
  }

  if (dispensed < targetMin) {
    Serial.printf("runFeedingCycle: warning, dispensed %.2fg below min %.2fg\n", dispensed, targetMin);
  }
}

void updateSupabaseInventory(float amountRemoved) {
  HTTPClient http;
  String url = "https://hhqrukpscpohrtmrvvvq.supabase.co/rest/v1/inventory?id=eq.1";
  http.begin(url);
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", "Bearer " + String(supabase_key));
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.GET();
  if (httpCode == 200) {
    String current = http.getString();
    DynamicJsonDocument doc(512);
    deserializeJson(doc, current);
    float currentAmount = doc[0]["amount_remaining"];
    float newAmount = (currentAmount - amountRemoved < 0) ? 0 : currentAmount - amountRemoved;
    
    String payload = "{\"amount_remaining\": " + String(newAmount, 1) + "}";
    http.PATCH(payload);
  }
  http.end();
}

void updateSupabaseStatus() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  String url = "https://hhqrukpscpohrtmrvvvq.supabase.co/rest/v1/device_status?on_conflict=device_id";
  http.begin(url);
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", "Bearer " + String(supabase_key));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "resolution=merge-duplicates,return=representation");
  http.setTimeout(5000);

  // Build JSON: online=true, last_seen=now, wifi_rssi, uptime
  int32_t rssi = WiFi.RSSI();
  unsigned long uptime = millis() / 1000;
  DateTime now = getCurrentDateTime();
  String timestamp = formatIsoTimestamp(now);

  String payload = "{";
  payload += "\"device_id\":\"esp32-device-001\",";
  payload += "\"online\":true,";
  payload += "\"last_seen\":\"" + timestamp + "\",";
  payload += "\"wifi_rssi\":" + String(rssi) + ",";
  payload += "\"uptime\":" + String(uptime) + ",";
  payload += "\"current_weight\":" + String(currentWeight, 2);
  payload += "}";

  // Upsert status row by device_id.
  int httpCode = http.POST(payload);
  if (httpCode == 201 || httpCode == 200 || httpCode == 204) {
    Serial.printf("updateSupabaseStatus: synced at %s (UTC %s)\n",
      formatLocal12Hour(now).c_str(),
      timestamp.c_str());
  } else {
    Serial.printf("updateSupabaseStatus: POST failed with code %d\n", httpCode);
    String body = http.getString();
    if (body.length() > 0) {
      Serial.printf("updateSupabaseStatus: response body: %s\n", body.c_str());
    }
  }
  http.end();
}

void syncWeightToSupabase() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  String url = "https://hhqrukpscpohrtmrvvvq.supabase.co/rest/v1/device_status?device_id=eq.esp32-device-001";
  http.begin(url);
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", "Bearer " + String(supabase_key));
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // Build ISO 8601 timestamp
  DateTime now = getCurrentDateTime();
  String timestamp = formatIsoTimestamp(now);

  // Build JSON payload with current weight in device_status telemetry
  String payload = "{\"current_weight\":" + String(currentWeight, 2) + ",\"last_seen\":\"" + timestamp + "\"}";

  // Use PATCH to update existing device_status row
  int httpCode = http.PATCH(payload);
  if (httpCode == 200 || httpCode == 204) {
    Serial.printf("syncWeightToSupabase: current_weight %.2fg synced at %s (UTC %s)\n",
      currentWeight,
      formatLocal12Hour(now).c_str(),
      timestamp.c_str());
  } else {
    Serial.printf("syncWeightToSupabase: PATCH device_status failed with code %d\n", httpCode);
    String body = http.getString();
    if (body.length() > 0) {
      Serial.printf("syncWeightToSupabase: response body: %s\n", body.c_str());
    }
    // Ensure row exists/upsert status when PATCH fails.
    updateSupabaseStatus();
  }
  http.end();
}

bool parseTimeString(const String& timeStr, int& hour, int& minute) {
  if (timeStr.length() < 5) return false;

  int firstColon = timeStr.indexOf(':');
  if (firstColon < 0) return false;

  hour = timeStr.substring(0, firstColon).toInt();
  minute = timeStr.substring(firstColon + 1, firstColon + 3).toInt();

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

bool parseDateString(const String& dateStr, int& year, int& month, int& day) {
  if (dateStr.length() < 10) return false;

  year = dateStr.substring(0, 4).toInt();
  month = dateStr.substring(5, 7).toInt();
  day = dateStr.substring(8, 10).toInt();

  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  return true;
}

bool parseRangeString(const String& rangeStr, float& minW, float& maxW) {
  int dash = rangeStr.indexOf('-');
  if (dash <= 0 || dash >= (rangeStr.length() - 1)) {
    return false;
  }

  minW = rangeStr.substring(0, dash).toFloat();
  maxW = rangeStr.substring(dash + 1).toFloat();

  if (minW <= 0 || maxW <= 0) return false;

  if (minW > maxW) {
    float temp = minW;
    minW = maxW;
    maxW = temp;
  }

  return true;
}

bool isScheduleDue(const DateTime& now, const FeedSchedule& schedule) {
  if (!schedule.enabled) {
    return false;
  }

  if (schedule.hasDate) {
    if (now.year() != schedule.year || now.month() != schedule.month || now.day() != schedule.day) {
      return false;
    }
  }

  return now.hour() == schedule.hour && now.minute() == schedule.minute;
}

bool shouldTriggerSchedule(const DateTime& now, const FeedSchedule& schedule, uint32_t& scheduledEpoch) {
  if (!isScheduleDue(now, schedule)) {
    // Allow a grace window if loop/network timing misses the exact second boundary.
    if (!schedule.enabled) return false;

    if (schedule.hasDate) {
      if (now.year() != schedule.year || now.month() != schedule.month || now.day() != schedule.day) {
        return false;
      }
    }
  }

  DateTime scheduled(
    now.year(),
    now.month(),
    now.day(),
    schedule.hour,
    schedule.minute,
    0
  );

  if (schedule.hasDate) {
    scheduled = DateTime(schedule.year, schedule.month, schedule.day, schedule.hour, schedule.minute, 0);
  }

  uint32_t nowEpoch = now.unixtime();
  scheduledEpoch = scheduled.unixtime();
  const uint32_t TRIGGER_WINDOW_SEC = 90;

  if (nowEpoch < scheduledEpoch) {
    return false;
  }

  if (nowEpoch > (scheduledEpoch + TRIGGER_WINDOW_SEC)) {
    return false;
  }

  if (lastFedScheduleEpoch == scheduledEpoch) {
    return false;
  }

  return true;
}

String formatIsoTimestamp(const DateTime& now) {
  if (!isDateTimeReasonable(now)) {
    Serial.println("formatIsoTimestamp: RTC datetime invalid, using last known good timestamp");
    return lastGoodTimestamp;
  }

  // RTC stores local wall-clock time for schedule matching.
  // Convert local RTC time to UTC for ISO8601 `Z` timestamps sent to Supabase.
  struct tm localTm;
  localTm.tm_year = now.year() - 1900;
  localTm.tm_mon = now.month() - 1;
  localTm.tm_mday = now.day();
  localTm.tm_hour = now.hour();
  localTm.tm_min = now.minute();
  localTm.tm_sec = now.second();
  localTm.tm_isdst = -1;

  time_t epoch = mktime(&localTm);
  if (epoch < 0) {
    Serial.println("formatIsoTimestamp: failed to convert local RTC time to epoch, using last known good timestamp");
    return lastGoodTimestamp;
  }

  struct tm utcTm;
  gmtime_r(&epoch, &utcTm);

  char buffer[25];
  snprintf(buffer, sizeof(buffer), "%04d-%02d-%02dT%02d:%02d:%02dZ",
    utcTm.tm_year + 1900, utcTm.tm_mon + 1, utcTm.tm_mday,
    utcTm.tm_hour, utcTm.tm_min, utcTm.tm_sec);
  lastGoodTimestamp = String(buffer);
  return lastGoodTimestamp;
}

String formatLocal12Hour(const DateTime& now) {
  int hour24 = now.hour();
  int hour12 = hour24 % 12;
  if (hour12 == 0) {
    hour12 = 12;
  }

  const char* ampm = hour24 >= 12 ? "PM" : "AM";
  char buffer[40];
  snprintf(buffer, sizeof(buffer), "%04d-%02d-%02d %02d:%02d:%02d %s",
    now.year(), now.month(), now.day(),
    hour12, now.minute(), now.second(), ampm);

  return String(buffer);
}

bool isDateTimeReasonable(const DateTime& dt) {
  if (dt.year() < 2020 || dt.year() > 2100) return false;
  if (dt.month() < 1 || dt.month() > 12) return false;
  if (dt.day() < 1 || dt.day() > 31) return false;
  if (dt.hour() < 0 || dt.hour() > 23) return false;
  if (dt.minute() < 0 || dt.minute() > 59) return false;
  if (dt.second() < 0 || dt.second() > 59) return false;
  return true;
}

DateTime getCurrentDateTime() {
  if (rtcAvailable) {
    DateTime rtcNow = rtc.now();
    if (isDateTimeReasonable(rtcNow)) {
      return rtcNow;
    }
    Serial.println("getCurrentDateTime: RTC invalid, trying system time fallback");
  }

  time_t epoch = time(nullptr);
  if (epoch > 1609459200) {
    struct tm localTm;
    localtime_r(&epoch, &localTm);
    DateTime sysNow(
      localTm.tm_year + 1900,
      localTm.tm_mon + 1,
      localTm.tm_mday,
      localTm.tm_hour,
      localTm.tm_min,
      localTm.tm_sec
    );
    if (isDateTimeReasonable(sysNow)) {
      return sysNow;
    }
  }

  return DateTime(F(__DATE__), F(__TIME__));
}

void pulseServo(Servo& servo, int pin, int fromAngle, int toAngle, int holdMs, int returnMs) {
  Serial.printf("pulseServo(pin=%d): %d -> %d\n", pin, fromAngle, toAngle);
  servo.attach(pin, 500, 2400);
  servo.write(fromAngle);
  delay(120);
  servo.write(toAngle);
  delay(holdMs);
  servo.write(fromAngle);
  delay(returnMs);
  servo.detach();
  Serial.printf("pulseServo(pin=%d): done\n", pin);
}

void cycleDispenserDoor() {
  Serial.println("cycleDispenserDoor: start");
  servoDispenser.attach(SERVO1_PIN);

  // Incrementally open door
  for (int a = 0; a <= 95; a += 15) {
    servoDispenser.write(a);
    delay(70);
  }

  // Keep open briefly for pellet flow
  delay(350);

  // Incrementally close door
  for (int a = 95; a >= 0; a -= 15) {
    servoDispenser.write(a);
    delay(70);
  }

  servoDispenser.detach();
  Serial.println("cycleDispenserDoor: done");
}

void testServoMotion(int servoNumber) {
  if (servoNumber == 1) {
    cycleDispenserDoor();
    return;
  }

  if (servoNumber == 2) {
    pulseServo(servoThrower, SERVO2_PIN, 0, 175, 900, 900);
    return;
  }

  Serial.printf("testServoMotion: unknown servo number %d\n", servoNumber);
}

void checkManualFeedCommand() {
  HTTPClient http;
  String url = "https://hhqrukpscpohrtmrvvvq.supabase.co/rest/v1/manual_feed?device_id=eq.esp32-device-001&select=trigger,amount&limit=1";
  http.begin(url);
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", "Bearer " + String(supabase_key));
  http.setTimeout(5000);

  int httpCode = http.GET();
  if (httpCode != 200) {
    http.end();
    return;
  }

  String payload = http.getString();
  http.end();

  DynamicJsonDocument doc(512);
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.printf("checkManualFeedCommand: JSON parse failed: %s\n", err.c_str());
    return;
  }

  JsonArray arr = doc.as<JsonArray>();
  if (arr.size() == 0) {
    return;
  }

  JsonObject cmd = arr[0];
  bool trigger = cmd["trigger"] | false;
  float amount = cmd["amount"] | 0.0;

  if (!trigger) {
    return;
  }

  Serial.printf("checkManualFeedCommand: received command amount=%.2f\n", amount);

  if (amount == -1) {
    Serial.println("checkManualFeedCommand: running Servo 1 test via bridge");
    testServoMotion(1);
  } else if (amount == -2) {
    Serial.println("checkManualFeedCommand: running Servo 2 test via bridge");
    testServoMotion(2);
  } else if (amount > 0) {
    Serial.printf("checkManualFeedCommand: manual feed %.2fg requested\n", amount);
    runFeedingCycle(amount * 0.9, amount * 1.1);
  } else {
    Serial.printf("checkManualFeedCommand: unknown command amount=%.2f\n", amount);
  }

  clearManualFeedTrigger();
}

void clearManualFeedTrigger() {
  HTTPClient http;
  String url = "https://hhqrukpscpohrtmrvvvq.supabase.co/rest/v1/manual_feed?device_id=eq.esp32-device-001";
  http.begin(url);
  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", "Bearer " + String(supabase_key));
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  int httpCode = http.PATCH("{\"trigger\":false}");
  if (httpCode == 200 || httpCode == 204) {
    Serial.println("clearManualFeedTrigger: trigger reset");
  } else {
    Serial.printf("clearManualFeedTrigger: PATCH failed with code %d\n", httpCode);
  }
  http.end();
}

bool syncRtcFromNtp(bool forceLog) {
  if (WiFi.status() != WL_CONNECTED) {
    if (forceLog) {
      Serial.println("syncRtcFromNtp: skipped (WiFi not connected)");
    }
    return false;
  }

  configTzTime(tz_info, ntp_server_1, ntp_server_2);

  struct tm timeinfo;
  unsigned long start = millis();
  while (!getLocalTime(&timeinfo) && (millis() - start < NTP_SYNC_TIMEOUT_MS)) {
    delay(200);
  }

  if (!getLocalTime(&timeinfo)) {
    lastNtpSyncMs = millis();
    if (forceLog) {
      Serial.println("syncRtcFromNtp: failed to get NTP time");
    }
    return false;
  }

  DateTime ntpNow(
    timeinfo.tm_year + 1900,
    timeinfo.tm_mon + 1,
    timeinfo.tm_mday,
    timeinfo.tm_hour,
    timeinfo.tm_min,
    timeinfo.tm_sec
  );

  if (!isDateTimeReasonable(ntpNow)) {
    lastNtpSyncMs = millis();
    if (forceLog) {
      Serial.println("syncRtcFromNtp: received unreasonable time from NTP");
    }
    return false;
  }

  if (rtcAvailable) {
    rtc.adjust(ntpNow);
  }
  lastNtpSyncMs = millis();

  Serial.printf("syncRtcFromNtp: RTC synced to %04d-%02d-%02d %02d:%02d:%02d\n",
    ntpNow.year(), ntpNow.month(), ntpNow.day(), ntpNow.hour(), ntpNow.minute(), ntpNow.second());

  // Refresh last known good ISO timestamp immediately after successful sync.
  formatIsoTimestamp(ntpNow);
  return true;
}