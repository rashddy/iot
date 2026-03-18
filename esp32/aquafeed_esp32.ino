/*
 * ============================================================
 *  AquaFeed Pro – ESP32 Firmware
 *  Smart Fish Feeder with Firebase Realtime Database + NTP
 * ============================================================
 *
 *  Hardware:
 *    - ESP32 DevKit v1 (or similar)
 *    - Servo motor (SG90 / MG996R) on GPIO 13
 *    - HX711 Load Cell for food weight on GPIO 4 (DT) & GPIO 5 (SCK)
 *    - (Optional) LED on GPIO 2 for status indication
 *
 *  Libraries (install via Arduino Library Manager):
 *    - Firebase ESP Client  (mobizt/Firebase-ESP-Client)
 *    - HX711               (bogde/HX711)
 *    - ESP32Servo           (madhephaestus/ESP32Servo)
 *    - ArduinoJson          (bblanchon/ArduinoJson) — optional
 *
 *  Board: ESP32 Dev Module (Arduino IDE → Board Manager → esp32)
 *
 *  Firebase RTDB Structure expected:
 *    /foodContainer    { remainingGrams, maxCapacityGrams, lastUpdated }
 *    /schedules/<id>   { id, time, amount, enabled }
 *    /history/<id>     { id, timestamp, amount, status, triggeredBy }
 *    /deviceStatus     { online, lastSeen, wifiRSSI, uptime }
 *    /manualFeed       { trigger, amount, timestamp }
 */

#include <WiFi.h>
#include <time.h>
#include <Firebase_ESP_Client.h>
#include <addons/RTDBHelper.h>
#include <addons/TokenHelper.h>
#include <ESP32Servo.h>

// ─── WiFi Credentials ────────────────────────────────────────
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// ─── Firebase Credentials ────────────────────────────────────
#define FIREBASE_HOST "YOUR_PROJECT_ID-default-rtdb.firebaseio.com"
#define FIREBASE_API_KEY "YOUR_API_KEY"

// If you're using anonymous auth or no auth, leave blank.
// For production use add authentication.
#define FIREBASE_USER_EMAIL ""
#define FIREBASE_USER_PASSWORD ""

// ─── NTP ─────────────────────────────────────────────────────
#define NTP_SERVER "pool.ntp.org"
#define GMT_OFFSET_SEC 25200   // UTC+7 (adjust for your timezone)
#define DAYLIGHT_OFFSET_SEC 0

// ─── Hardware Pins ───────────────────────────────────────────
#define SERVO_PIN 13
#define LED_PIN   2

// ─── Feed settings ───────────────────────────────────────────
#define SERVO_OPEN_ANGLE   90   // degrees when dispensing
#define SERVO_CLOSE_ANGLE  0    // degrees when closed
#define MS_PER_GRAM        200  // milliseconds servo stays open per gram

// ─── Globals ─────────────────────────────────────────────────
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

Servo feederServo;

unsigned long lastStatusUpdate = 0;
unsigned long lastScheduleCheck = 0;
unsigned long bootTime;

float foodRemaining = 450.0;        // grams (would come from load cell)
float foodMaxCapacity = 500.0;

// Schedule cache
struct Schedule {
  String id;
  String timeStr;   // "HH:MM"
  int amount;        // grams
  bool enabled;
  bool firedToday;   // prevent double-fire within the same minute
};

#define MAX_SCHEDULES 10
Schedule schedules[MAX_SCHEDULES];
int scheduleCount = 0;

// ─── Forward declarations ────────────────────────────────────
void connectWiFi();
void initFirebase();
void syncNTP();
String getFormattedTime();      // "HH:MM"
String getISO8601();
void dispenseFeed(int grams, const char* triggeredBy);
void updateDeviceStatus();
void updateFoodContainer();
void checkSchedules();
void checkManualFeed();
void loadSchedules();

// ==============================================================
//  SETUP
// ==============================================================
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  feederServo.attach(SERVO_PIN);
  feederServo.write(SERVO_CLOSE_ANGLE);

  connectWiFi();
  syncNTP();
  initFirebase();

  bootTime = millis();

  // Write initial device status
  updateDeviceStatus();
  updateFoodContainer();
  loadSchedules();

  Serial.println("[AquaFeed] Setup complete ✓");
  digitalWrite(LED_PIN, HIGH);
}

// ==============================================================
//  LOOP
// ==============================================================
void loop() {
  // ── Reconnect WiFi if needed ──
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!Firebase.ready()) {
    delay(500);
    return;
  }

  // ── Check manual feed trigger ──
  checkManualFeed();

  // ── Check scheduled feeds every 15 seconds ──
  if (millis() - lastScheduleCheck > 15000) {
    lastScheduleCheck = millis();
    loadSchedules();
    checkSchedules();
  }

  // ── Update device status every 30 seconds ──
  if (millis() - lastStatusUpdate > 30000) {
    lastStatusUpdate = millis();
    updateDeviceStatus();
    updateFoodContainer();
  }

  delay(1000);
}

// ==============================================================
//  WiFi
// ==============================================================
void connectWiFi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] FAILED – will retry in loop");
  }
}

// ==============================================================
//  NTP
// ==============================================================
void syncNTP() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  Serial.print("[NTP] Synchronising");
  struct tm timeinfo;
  int retries = 0;
  while (!getLocalTime(&timeinfo) && retries < 20) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  Serial.println(" ✓");
  Serial.println(&timeinfo, " [NTP] Current time: %Y-%m-%d %H:%M:%S");
}

String getFormattedTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "00:00";
  char buf[6];
  strftime(buf, sizeof(buf), "%H:%M", &timeinfo);
  return String(buf);
}

String getFormattedDate() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "1970-01-01";
  char buf[11];
  strftime(buf, sizeof(buf), "%Y-%m-%d", &timeinfo);
  return String(buf);
}

String getISO8601() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "1970-01-01T00:00:00";
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%d at %H:%M", &timeinfo);
  return String(buf);
}

// ==============================================================
//  Firebase Init
// ==============================================================
void initFirebase() {
  config.api_key = FIREBASE_API_KEY;
  config.database_url = FIREBASE_HOST;

  if (strlen(FIREBASE_USER_EMAIL) > 0) {
    auth.user.email = FIREBASE_USER_EMAIL;
    auth.user.password = FIREBASE_USER_PASSWORD;
  }

  config.token_status_callback = tokenStatusCallback; // from TokenHelper

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  Serial.println("[Firebase] Initialised");
}

// ==============================================================
//  Dispense Feed
// ==============================================================
void dispenseFeed(int grams, const char* triggeredBy) {
  Serial.printf("[Feed] Dispensing %d g (triggered by %s)\n", grams, triggeredBy);

  // Open servo
  feederServo.write(SERVO_OPEN_ANGLE);
  delay((unsigned long)grams * MS_PER_GRAM);
  feederServo.write(SERVO_CLOSE_ANGLE);

  // Update remaining food
  foodRemaining -= grams;
  if (foodRemaining < 0) foodRemaining = 0;
  updateFoodContainer();

  // Write history entry
  FirebaseJson json;
  String historyPath = "history/" + String(millis());  // unique-ish key
  json.set("id", String(millis()));
  json.set("timestamp", getISO8601());
  json.set("amount", grams);
  json.set("status", "completed");
  json.set("triggeredBy", triggeredBy);

  if (Firebase.RTDB.pushJSON(&fbdo, "history", &json)) {
    Serial.println("[Feed] History entry written ✓");
  } else {
    Serial.println("[Feed] History write FAILED: " + fbdo.errorReason());
  }
}

// ==============================================================
//  Manual Feed Check
// ==============================================================
void checkManualFeed() {
  if (!Firebase.RTDB.getBool(&fbdo, "manualFeed/trigger")) return;

  if (fbdo.boolData() == true) {
    // Read amount
    Firebase.RTDB.getInt(&fbdo, "manualFeed/amount");
    int amount = fbdo.intData();
    if (amount <= 0) amount = 5;

    dispenseFeed(amount, "manual");

    // Clear trigger
    Firebase.RTDB.setBool(&fbdo, "manualFeed/trigger", false);
    Serial.println("[Feed] Manual feed trigger cleared ✓");
  }
}

// ==============================================================
//  Schedule Management
// ==============================================================
void loadSchedules() {
  if (!Firebase.RTDB.getJSON(&fbdo, "schedules")) {
    Serial.println("[Schedule] No schedules found or read error");
    scheduleCount = 0;
    return;
  }

  FirebaseJson &json = fbdo.jsonObject();
  size_t count = json.iteratorBegin();
  scheduleCount = 0;

  for (size_t i = 0; i < count && scheduleCount < MAX_SCHEDULES; i++) {
    FirebaseJson::IteratorValue value = json.valueAt(i);
    if (value.type == FirebaseJson::JSON_OBJECT) {
      FirebaseJson child;
      child.setJsonData(value.value);

      FirebaseJsonData result;
      Schedule &s = schedules[scheduleCount];

      if (child.get(result, "id"))      s.id = result.stringValue;
      if (child.get(result, "time"))    s.timeStr = result.stringValue;
      if (child.get(result, "amount"))  s.amount = result.intValue;
      if (child.get(result, "enabled")) s.enabled = result.boolValue;
      s.firedToday = false;

      scheduleCount++;
    }
  }
  json.iteratorEnd();

  Serial.printf("[Schedule] Loaded %d schedules\n", scheduleCount);
}

void checkSchedules() {
  String currentTime = getFormattedTime();

  for (int i = 0; i < scheduleCount; i++) {
    Schedule &s = schedules[i];
    if (!s.enabled) continue;
    if (s.firedToday) continue;

    if (s.timeStr == currentTime) {
      Serial.printf("[Schedule] Triggered: %s → %d g\n",
                    s.timeStr.c_str(), s.amount);
      dispenseFeed(s.amount, "schedule");
      s.firedToday = true;
    }
  }

  // Reset firedToday flags at midnight
  if (currentTime == "00:00") {
    for (int i = 0; i < scheduleCount; i++) {
      schedules[i].firedToday = false;
    }
  }
}

// ==============================================================
//  Device Status
// ==============================================================
void updateDeviceStatus() {
  FirebaseJson json;
  json.set("online", true);
  json.set("lastSeen", getISO8601());
  json.set("wifiRSSI", WiFi.RSSI());
  json.set("uptime", (int)((millis() - bootTime) / 1000));

  if (Firebase.RTDB.setJSON(&fbdo, "deviceStatus", &json)) {
    Serial.println("[Status] Updated ✓");
  } else {
    Serial.println("[Status] Update FAILED: " + fbdo.errorReason());
  }
}

void updateFoodContainer() {
  FirebaseJson json;
  json.set("remainingGrams", (int)foodRemaining);
  json.set("maxCapacityGrams", (int)foodMaxCapacity);
  json.set("lastUpdated", getISO8601());

  if (Firebase.RTDB.setJSON(&fbdo, "foodContainer", &json)) {
    Serial.println("[Food] Container updated ✓");
  } else {
    Serial.println("[Food] Update FAILED: " + fbdo.errorReason());
  }
}
