/*
  ESP32-CAM – TEST DE CÁMARA v3
  
  Un solo servidor en puerto 8080 con:
  - /health, / (web), /video, /stream
  - lru_purge para liberar sockets colgados
  - max_open_sockets aumentado
  - FPS limitado para estabilidad
  - Reconexión WiFi automática
*/

#include "esp_camera.h"
#include <WiFi.h>
#include "esp_http_server.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// ═══ CONFIGURA TU RED WIFI ═══
const char *ssid     = "Sergio_router";
const char *password = "ss9dksdwsxn4";

#define SERVER_PORT 8080

// Pines cámara (AI-Thinker)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22
#define LED_GPIO_NUM       4

bool Video_Flip = true;

#define PART_BOUNDARY "frame"
static const char *_STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char *_STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char *_STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t server_httpd = NULL;
volatile bool stream_active = false;

// ═══ HEALTH ═══
static esp_err_t health_handler(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_type(req, "application/json");
  char resp[256];
  snprintf(resp, sizeof(resp),
    "{\"status\":\"ok\",\"ip\":\"%s\",\"port\":%d,\"heap\":%u,\"stream\":%s,\"uptime\":%lu}",
    WiFi.localIP().toString().c_str(), SERVER_PORT,
    ESP.getFreeHeap(), stream_active ? "true" : "false", millis()/1000);
  return httpd_resp_send(req, resp, strlen(resp));
}

// ═══ STREAM ═══
static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t *fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t *_jpg_buf = NULL;
  char part_buf[80];

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  stream_active = true;
  Serial.printf("📹 Stream ON (heap:%u)\n", ESP.getFreeHeap());

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("⚠️ Captura falló");
      delay(50);
      continue;
    }

    if (fb->format != PIXFORMAT_JPEG) {
      bool ok = frame2jpg(fb, 80, &_jpg_buf, &_jpg_buf_len);
      esp_camera_fb_return(fb);
      fb = NULL;
      if (!ok) { delay(50); continue; }
    } else {
      _jpg_buf_len = fb->len;
      _jpg_buf = fb->buf;
    }

    size_t hlen = snprintf(part_buf, 80, _STREAM_PART, _jpg_buf_len);
    res = httpd_resp_send_chunk(req, part_buf, hlen);
    if (res == ESP_OK)
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    if (res == ESP_OK)
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));

    if (fb) { esp_camera_fb_return(fb); fb = NULL; _jpg_buf = NULL; }
    else if (_jpg_buf) { free(_jpg_buf); _jpg_buf = NULL; }

    if (res != ESP_OK) break;

    delay(30); // ~30 FPS max, da respiro al servidor
  }

  stream_active = false;
  Serial.printf("📹 Stream OFF (heap:%u)\n", ESP.getFreeHeap());
  return res;
}

// ═══ WEB ═══
static esp_err_t index_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "text/html");
  String ip = WiFi.localIP().toString();
  String html = "<!DOCTYPE html><html><head><title>ESP32-CAM</title>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<style>body{background:#0d1117;color:#e6edf3;font-family:sans-serif;"
    "text-align:center;padding:20px}h1{color:#58a6ff}img{max-width:100%;"
    "border-radius:8px;margin:16px 0}.i{background:#161b22;border:1px solid #30363d;"
    "border-radius:8px;padding:12px;margin:12px auto;max-width:500px;font-family:monospace;"
    "font-size:13px;text-align:left}.u{color:#58a6ff}</style></head><body>"
    "<h1>ESP32-CAM Test v3</h1>"
    "<div class='i'>IP: <span class='u'>" + ip + "</span><br>"
    "Stream: <span class='u'>http://" + ip + ":" + String(SERVER_PORT) + "/video</span><br>"
    "Health: <span class='u'>http://" + ip + ":" + String(SERVER_PORT) + "/health</span></div>"
    "<img src='/video'>"
    "<div class='i' style='font-size:11px;color:#8b949e'>"
    "En la app: Tab Red → IP: " + ip + " / Puerto: " + String(SERVER_PORT) + "</div>"
    "</body></html>";
  return httpd_resp_send(req, html.c_str(), html.length());
}

// ═══ SERVIDOR ═══
void startServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = SERVER_PORT;
  config.max_open_sockets = 7;        // Más sockets disponibles
  config.lru_purge_enable = true;      // ← CLAVE: libera sockets viejos
  config.recv_wait_timeout = 5;        // Timeout recepción (segundos)
  config.send_wait_timeout = 5;        // Timeout envío (segundos)
  config.max_uri_handlers = 8;

  httpd_uri_t uris[] = {
    { .uri = "/",       .method = HTTP_GET, .handler = index_handler,  .user_ctx = NULL },
    { .uri = "/health", .method = HTTP_GET, .handler = health_handler, .user_ctx = NULL },
    { .uri = "/video",  .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL },
    { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL },
  };

  if (httpd_start(&server_httpd, &config) == ESP_OK) {
    for (int i = 0; i < 4; i++) httpd_register_uri_handler(server_httpd, &uris[i]);
    Serial.printf("✅ Servidor OK puerto %d (sockets:%d, lru:ON)\n",
      SERVER_PORT, config.max_open_sockets);
  } else {
    Serial.println("❌ Error al iniciar servidor");
  }
}

// ═══ SETUP ═══
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  pinMode(LED_GPIO_NUM, OUTPUT);
  digitalWrite(LED_GPIO_NUM, LOW);
  Serial.begin(115200);
  delay(500);
  Serial.println("\n═══ ESP32-CAM TEST v3 ═══");

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM; config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 12;  // Un poco menos agresivo
    config.fb_count = 2;
    Serial.println("✅ PSRAM → VGA");
  } else {
    config.frame_size = FRAMESIZE_CIF;
    config.jpeg_quality = 14;
    config.fb_count = 1;
  }

  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("❌ Cámara falló");
    while(1) { digitalWrite(LED_GPIO_NUM, !digitalRead(LED_GPIO_NUM)); delay(100); }
  }
  Serial.println("✅ Cámara OK");

  if (Video_Flip) {
    sensor_t *s = esp_camera_sensor_get();
    s->set_vflip(s, 1);
    s->set_hmirror(s, 0);
  }

  WiFi.begin(ssid, password);
  Serial.printf("🔗 WiFi \"%s\"", ssid);
  int att = 0;
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_GPIO_NUM, att % 2); delay(500);
    Serial.print("."); att++;
    if (att > 30) { Serial.println(" TIMEOUT"); ESP.restart(); }
  }
  digitalWrite(LED_GPIO_NUM, LOW);

  String ip = WiFi.localIP().toString();
  Serial.printf("\n✅ IP: %s\n", ip.c_str());
  Serial.printf("   Web:    http://%s:%d/\n", ip.c_str(), SERVER_PORT);
  Serial.printf("   Stream: http://%s:%d/video\n", ip.c_str(), SERVER_PORT);
  Serial.printf("   Health: http://%s:%d/health\n", ip.c_str(), SERVER_PORT);

  startServer();
  Serial.println("🎉 Listo!\n");
}

void loop() {
  static unsigned long last = 0;
  if (millis() - last > 10000) {
    last = millis();
    Serial.printf("📡 %s | RSSI:%d | Heap:%u | Stream:%s\n",
      WiFi.localIP().toString().c_str(), WiFi.RSSI(),
      ESP.getFreeHeap(), stream_active ? "ON" : "off");
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("⚠️ WiFi lost, restarting...");
      ESP.restart();
    }
  }
}
