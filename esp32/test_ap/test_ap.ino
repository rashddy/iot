#include <WiFi.h>
#include <WebServer.h>

WebServer server(80);

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // Start AP mode
  WiFi.softAP("feeder");
  
  Serial.println("AP Started");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());
  
  // Setup web server
  server.on("/", []() {
    server.send(200, "text/html", "<h1>ESP32 Test Working!</h1><p>IP: " + WiFi.softAPIP().toString() + "</p>");
  });
  
  server.on("/weight", []() {
    server.send(200, "application/json", "{\"weight\":0.00,\"unit\":\"g\",\"stable\":true}");
  });
  
  server.begin();
  Serial.println("Web server started");
}

void loop() {
  server.handleClient();
  delay(10);
}
