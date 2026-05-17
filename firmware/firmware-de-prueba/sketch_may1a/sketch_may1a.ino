/*
  Project: camera robot car
  Author: Keyestudio
  Function: We can control the car to move forward/backward and turn left/right, turn on/off LED and speed up/down speed through wifi
  Speed level: we divide the maximum value of 255 into three parts, so each is 85. low speed 85, mid speed 170, high speed 255

  WiFi configuration: Credentials are stored in NVS (non-volatile storage).
  - On first boot, uses DEFAULT_SSID/DEFAULT_PASS below.
  - Can be changed at runtime via GET /wifi?ssid=...&pass=...
  - If WiFi fails after 15s, creates AP "RobotCar-Setup" for reconfiguration.
  - mDNS: accessible as http://robot-car.local
*/
#include "esp_camera.h"        //ESP32-CAM camera driver
#include <WiFi.h>              //WiFi library, used to connect to network
// ESPAsyncWebServer NO necesaria — usamos esp_http_server.h nativo (línea 24)
#include <Preferences.h>       //NVS storage for persistent WiFi credentials
#include <ESPmDNS.h>           //mDNS for network discovery (robot-car.local)
#include "esp_timer.h"         //timer library
#include "img_converters.h"    //image converter library, used to convert JPEG
#include "Arduino.h"           //Arduino library
#include "fb_gfx.h"            //Graphics library, used to display image buffers
#include "soc/soc.h"           // Used to disable brownout detection for ESP32
#include "soc/rtc_cntl_reg.h"  // Used to disable brownout detection for ESP32
#include "esp_http_server.h"   // ESP32 HTTP server library, used to handle Web requests

// ─── WiFi defaults (fallback if nothing saved in NVS) ───
const char *DEFAULT_SSID = "Sergio_router";
const char *DEFAULT_PASS = "ss9dksdwsxn4";

// ─── Dynamic WiFi credentials (loaded from NVS at boot) ─
Preferences preferences;
char wifi_ssid[64];
char wifi_pass[64];
bool isAPMode = false;  // true if running in AP fallback mode

const char *AP_SSID = "RobotCar-Setup";    // AP name when WiFi fails
const char *AP_PASS = "robot1234";          // AP password (min 8 chars)
const char *MDNS_NAME = "robot-car";       // mDNS hostname → robot-car.local

//Set camera pins
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27

#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

//Set motor pins
#define MOTOR_R_PIN_1 14
#define MOTOR_R_PIN_2 15
#define MOTOR_L_PIN_1 13
#define MOTOR_L_PIN_2 12
//Set LED pins
#define LED_GPIO_NUM 4
//The variable of speed value is initially 170
int MOTOR_R_Speed = 170;
int MOTOR_L_Speed = 170;

// WebSocket motor watchdog: auto-stop si no llegan comandos
unsigned long lastWsCommandTime = 0;
const unsigned long WS_COMMAND_TIMEOUT = 500; // 500ms → STOP

// Video Vertical Flip Setting
// Controls whether the video image is flipped vertically (upside down)
// When set to true, the image will be flipped vertically; when false, displays normally
bool Video_Flip = true;  // true = vertical flip enabled, false = vertical flip disabled

#define PART_BOUNDARY "123456789000000000000987654321"  // A boundary used to split MIME streams
static const char *_STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char *_STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char *_STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t camera_httpd = NULL;
httpd_handle_t stream_httpd = NULL;



////// AÑADIR ESTO POR SI SE CAE EL WIFI ////////////
// Variables globales
// unsigned long lastCommandTime = 0;
// const unsigned long COMMAND_TIMEOUT = 500; // 500ms sin comando → STOP

// // En action_handler(), al recibir cualquier comando:
// lastCommandTime = millis(); // Resetea el timer

// // En loop():
// void loop() {
//   server.handleClient();
  
//   // Timeout de seguridad
//   if (millis() - lastCommandTime > COMMAND_TIMEOUT) {
//     stopMotors(); // Tu función que pone todos los pines en LOW
//     lastCommandTime = millis(); // Evita spam de stop
//   }
// }



void startCameraServer();
void loadWiFiCredentials();
bool connectToWiFi(int timeoutMs = 15000);
void startAPMode();

// Configuración PWM ultrasónica para eliminar el pitido de los motores
const int PWM_FREQ = 30000;   // 30 kHz (fuera del rango audible)
const int PWM_RES = 8;        // 8 bits de resolución (0-255)
const int PWM_CH_R1 = 4;
const int PWM_CH_R2 = 5;
const int PWM_CH_L1 = 6;
const int PWM_CH_L2 = 7;

// ─── Load WiFi credentials from NVS ─────────────────────
void loadWiFiCredentials() {
  preferences.begin("wifi", true);  // read-only
  String savedSSID = preferences.getString("ssid", DEFAULT_SSID);
  String savedPass = preferences.getString("pass", DEFAULT_PASS);
  preferences.end();

  strncpy(wifi_ssid, savedSSID.c_str(), sizeof(wifi_ssid) - 1);
  wifi_ssid[sizeof(wifi_ssid) - 1] = '\0';
  strncpy(wifi_pass, savedPass.c_str(), sizeof(wifi_pass) - 1);
  wifi_pass[sizeof(wifi_pass) - 1] = '\0';

  Serial.printf("WiFi credentials loaded: SSID='%s'\n", wifi_ssid);
}

// ─── Try connecting to WiFi with timeout ─────────────────
bool connectToWiFi(int timeoutMs) {
  Serial.printf("Connecting to WiFi '%s'...\n", wifi_ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifi_ssid, wifi_pass);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > (unsigned long)timeoutMs) {
      Serial.println("\nWiFi connection TIMEOUT!");
      WiFi.disconnect();
      return false;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("WiFi connected!");
  Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());
  return true;
}

// ─── Start AP fallback mode ──────────────────────────────
void startAPMode() {
  Serial.println("Starting AP fallback mode...");
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  isAPMode = true;
  Serial.printf("AP Mode active! Connect to WiFi '%s' (pass: '%s')\n", AP_SSID, AP_PASS);
  Serial.printf("Configure at: http://%s\n", WiFi.softAPIP().toString().c_str());
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);  //disable brownout detector

  ledcSetup(PWM_CH_R1, PWM_FREQ, PWM_RES);
  ledcSetup(PWM_CH_R2, PWM_FREQ, PWM_RES);
  ledcSetup(PWM_CH_L1, PWM_FREQ, PWM_RES);
  ledcSetup(PWM_CH_L2, PWM_FREQ, PWM_RES);
  ledcAttachPin(MOTOR_R_PIN_1, PWM_CH_R1);
  ledcAttachPin(MOTOR_R_PIN_2, PWM_CH_R2);
  ledcAttachPin(MOTOR_L_PIN_1, PWM_CH_L1);
  ledcAttachPin(MOTOR_L_PIN_2, PWM_CH_L2);
  pinMode(LED_GPIO_NUM, OUTPUT);  // LED is initially in output mode
  Serial.begin(115200);
  Serial.setDebugOutput(false);

  //Configure camera
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_HVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  // Camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  // Video Orientation Configuration Code
  if (Video_Flip) {
    sensor_t *s = esp_camera_sensor_get();
    s->set_framesize(s, FRAMESIZE_VGA);
    s->set_vflip(s, 1);
    s->set_hmirror(s, 0);
  }

  // ─── WiFi: load saved credentials and connect ──────────
  loadWiFiCredentials();

  if (!connectToWiFi(15000)) {
    // WiFi failed → start Access Point for reconfiguration
    startAPMode();
  }

  // ─── mDNS: register as robot-car.local ─────────────────
  if (MDNS.begin(MDNS_NAME)) {
    MDNS.addService("http", "tcp", 80);
    MDNS.addService("http", "tcp", 81);
    Serial.printf("mDNS: http://%s.local\n", MDNS_NAME);
  } else {
    Serial.println("mDNS failed to start");
  }

  Serial.print("Camera Stream Ready! Go to: http://");
  Serial.println(isAPMode ? WiFi.softAPIP() : WiFi.localIP());

  // Start streaming web server
  startCameraServer();
}

// ─── Differential drive: aplica PWM directo a cada motor ─────────
// Valores positivos = adelante, negativos = atrás, rango [-255, 255]
void applyMotorPWM(int leftPWM, int rightPWM) {
  leftPWM = constrain(leftPWM, -255, 255);
  rightPWM = constrain(rightPWM, -255, 255);

  // Motor derecho
  if (rightPWM >= 0) {
    ledcWrite(PWM_CH_R1, 0);
    ledcWrite(PWM_CH_R2, rightPWM);
  } else {
    ledcWrite(PWM_CH_R1, -rightPWM);
    ledcWrite(PWM_CH_R2, 0);
  }

  // Motor izquierdo
  if (leftPWM >= 0) {
    ledcWrite(PWM_CH_L1, leftPWM);
    ledcWrite(PWM_CH_L2, 0);
  } else {
    ledcWrite(PWM_CH_L1, 0);
    ledcWrite(PWM_CH_L2, -leftPWM);
  }
}

void loop() {
  // Watchdog de seguridad: si el WebSocket deja de enviar, paramos los motores
  if (lastWsCommandTime > 0 && (millis() - lastWsCommandTime > WS_COMMAND_TIMEOUT)) {
    applyMotorPWM(0, 0);
    lastWsCommandTime = 0;
    Serial.println("WS watchdog: motors stopped");
  }
}

//Design control web page
static const char PROGMEM INDEX_HTML[] = R"rawliteral(
<html>
  <head>
    <title>ESP32-CAM Robot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta charset="UTF-8"/>

    <style>
      body {
        font-family: Arial;
        text-align: center;
        margin: 0 auto;
        padding-top: 20px;
      }

      .button-container {
        display: grid;
        grid-template-areas:
          "keyes forward led"
          "left stop right"
          "plus backward minus";  /* Adjust position */
        grid-gap: 10px;
        justify-content: center;
        align-content: center;
        margin-top: 20px;
      }

      .button {
        background-color: #2f4468;
        color: white;
        border: none;
        padding: 20px 0;
        text-align: center;
        font-size: 18px;
        cursor: pointer;
        width: 90px; /* Uniform width */
        height: 60px; /* Uniform heigth */
        border-radius: 15px; /* Fillet corner */
      }

      .led-button {
        background-color: #777; /* Initial gray, LED off */
        color: white;
        border: none;
        padding: 20px 0;
        text-align: center;
        font-size: 18px;
        cursor: pointer;
        width: 90px;
        height: 60px;
        border-radius: 15px;
      }

      .led-on {
        background-color: #f0c40f; /* Yellow, LED on */
        color: black;
      }

      .forward { grid-area: forward; }
      .led { grid-area: led; }
      .left { grid-area: left; }
      .stop { grid-area: stop; }
      .right { grid-area: right; }
      .backward { grid-area: backward; }
      .backwa { grid-area: backwa; }
      .plus { grid-area: plus; }
      .minus { grid-area: minus; }
      .keyes { grid-area: keyes; }

      img {
        width: auto;
        max-width: 100%;
        height: auto;
        border: 2px solid #2f4468; /* Give the video a border */
        border-radius: 10px;
        margin-top: 20px;
      }
    </style>
  </head>
  <body>
    <h1>ESP32-CAM Robot</h1>
    
    <!-- Video stream display -->
    <img src="" id="photo">

    <!-- Button container -->
    <div class="button-container">
      <!-- Forward -->
      <button class="button forward" onmousedown="toggleCheckbox('forward');" ontouchstart="toggleCheckbox('forward');" onmouseup="toggleCheckbox('stop');" ontouchend="toggleCheckbox('stop');">↑</button>
      
      <!-- LED on/off -->
      <button id="ledButton" class="led-button led" onclick="toggleLED()">OFF</button>
      
      <!-- other buttons -->
      <button class="button left" onmousedown="toggleCheckbox('left');" ontouchstart="toggleCheckbox('left');" onmouseup="toggleCheckbox('stop');" ontouchend="toggleCheckbox('stop');">←</button>
      <button class="button stop" onmousedown="toggleCheckbox('stop');">●</button>
      <button class="button right" onmousedown="toggleCheckbox('right');" ontouchstart="toggleCheckbox('right');" onmouseup="toggleCheckbox('stop');" ontouchend="toggleCheckbox('stop');">→</button>
      <button class="button backward" onmousedown="toggleCheckbox('backward');" ontouchstart="toggleCheckbox('backward');" onmouseup="toggleCheckbox('stop');" ontouchend="toggleCheckbox('stop');">↓</button>
      <button class="button plus"  onmouseup="toggleCheckbox('plus');">+</button>
      <button class="button minus" onmouseup="toggleCheckbox('minus');">-</button>
      <button class="button keyes" >Keyes</button>
    </div>

    <script>
      // Video stream loading
      window.onload = function () {
        document.getElementById("photo").src = window.location.href.slice(0, -1) + ":81/stream";
      };

      // Control button request
      function toggleCheckbox(action) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/action?go=" + action, true);
        xhr.send();
      }

      // Logic of LED on/off
      let ledState = false; // LED state
      const ledButton = document.getElementById("ledButton");

      function toggleLED() {
        ledState = !ledState; // switch state
        if (ledState) {
          ledButton.classList.add("led-on");
          ledButton.textContent = "ON";
        } else {
          ledButton.classList.remove("led-on");
          ledButton.textContent = "OFF";
        }

        // Send LED state to server
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/action?led=" + (ledState ? "on" : "off"), true);
        xhr.send();
      }
    </script>
  </body>
</html>
)rawliteral";

static esp_err_t index_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, (const char *)INDEX_HTML, strlen(INDEX_HTML));
}

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t *fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t *_jpg_buf = NULL;
  char *part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) {
    return res;
  }

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed");
      res = ESP_FAIL;
    } else {
      if (fb->width > 400) {
        if (fb->format != PIXFORMAT_JPEG) {
          bool jpeg_converted = frame2jpg(fb, 80, &_jpg_buf, &_jpg_buf_len);
          esp_camera_fb_return(fb);
          fb = NULL;
          if (!jpeg_converted) {
            Serial.println("JPEG compression failed");
            res = ESP_FAIL;
          }
        } else {
          _jpg_buf_len = fb->len;
          _jpg_buf = fb->buf;
        }
      }
    }
    if (res == ESP_OK) {
      size_t hlen = snprintf((char *)part_buf, 64, _STREAM_PART, _jpg_buf_len);
      res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    }
    if (fb) {
      esp_camera_fb_return(fb);
      fb = NULL;
      _jpg_buf = NULL;
    } else if (_jpg_buf) {
      free(_jpg_buf);
      _jpg_buf = NULL;
    }
    if (res != ESP_OK) {
      break;
    }
    //Serial.printf("MJPG: %uB\n",(uint32_t)(_jpg_buf_len));
  }
  return res;
}

// Control action processing
static esp_err_t action_handler(httpd_req_t *req) {
  char query[150];
  int len = httpd_req_get_url_query_len(req) + 1;
  if (len > sizeof(query)) {
    httpd_resp_send_404(req);
    return ESP_OK;
  }

  // Permitir CORS para que el backend pueda hacer requests
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  if (httpd_req_get_url_query_str(req, query, len) == ESP_OK) {

    // Parsear speed=NNN si viene en la URL (velocidad gradual del joystick)
    int speed = -1;  // -1 = usar velocidad global por defecto
    char *speed_ptr = strstr(query, "speed=");
    if (speed_ptr != NULL) {
      speed = atoi(speed_ptr + 6);
      if (speed < 0) speed = 0;
      if (speed > 255) speed = 255;
    }

    // Velocidad a usar: la del parametro o la global
    int rSpeed = (speed >= 0) ? speed : MOTOR_R_Speed;
    int lSpeed = (speed >= 0) ? speed : MOTOR_L_Speed;

    if (strstr(query, "go=forward")) {
      Serial.printf("Forward (speed=%d)\n", rSpeed);
      ledcWrite(PWM_CH_R1, 0);
      ledcWrite(PWM_CH_R2, rSpeed);
      ledcWrite(PWM_CH_L1, lSpeed);
      ledcWrite(PWM_CH_L2, 0);
    } else if (strstr(query, "go=backward")) {
      Serial.printf("Backward (speed=%d)\n", rSpeed);
      ledcWrite(PWM_CH_R1, rSpeed);
      ledcWrite(PWM_CH_R2, 0);
      ledcWrite(PWM_CH_L1, 0);
      ledcWrite(PWM_CH_L2, lSpeed);
    } else if (strstr(query, "go=left")) {
      Serial.printf("Left (speed=%d)\n", rSpeed);
      ledcWrite(PWM_CH_R1, 0);
      ledcWrite(PWM_CH_R2, rSpeed);
      ledcWrite(PWM_CH_L1, 0);
      ledcWrite(PWM_CH_L2, lSpeed);
    } else if (strstr(query, "go=right")) {
      Serial.printf("Right (speed=%d)\n", rSpeed);
      ledcWrite(PWM_CH_R1, rSpeed);
      ledcWrite(PWM_CH_R2, 0);
      ledcWrite(PWM_CH_L1, lSpeed);
      ledcWrite(PWM_CH_L2, 0);
    } else if (strstr(query, "go=stop")) {
      Serial.println("Stop");
      ledcWrite(PWM_CH_R1, 0);
      ledcWrite(PWM_CH_R2, 0);
      ledcWrite(PWM_CH_L1, 0);
      ledcWrite(PWM_CH_L2, 0);
    } else if (strstr(query, "led=on")) {
      Serial.println("LED ON");
      digitalWrite(LED_GPIO_NUM, HIGH);
    } else if (strstr(query, "led=off")) {
      Serial.println("LED OFF");
      digitalWrite(LED_GPIO_NUM, LOW);
    } else if (strstr(query, "go=plus")) {
      MOTOR_R_Speed = MOTOR_R_Speed + 85;
      MOTOR_L_Speed = MOTOR_L_Speed + 85;
      if (MOTOR_L_Speed >= 255) MOTOR_L_Speed = 255;
      if (MOTOR_R_Speed >= 255) MOTOR_R_Speed = 255;
    } else if (strstr(query, "go=minus")) {
      MOTOR_R_Speed = MOTOR_R_Speed - 85;
      MOTOR_L_Speed = MOTOR_L_Speed - 85;
      if (MOTOR_L_Speed <= 85) MOTOR_L_Speed = 85;
      if (MOTOR_R_Speed <= 85) MOTOR_R_Speed = 85;
    }
  }

  httpd_resp_send(req, "{\"ok\":true}", HTTPD_RESP_USE_STRLEN);
  return ESP_OK;
}

// Health check handler - para que el backend pueda verificar que el ESP32 está vivo
static esp_err_t health_handler(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_type(req, "application/json");
  char resp[128];
  snprintf(resp, sizeof(resp),
    "{\"status\":\"ok\",\"camera\":true,\"ap_mode\":%s}",
    isAPMode ? "true" : "false");
  return httpd_resp_send(req, resp, strlen(resp));
}

// ─── WiFi status: devuelve SSID actual, IP, RSSI ────────
static esp_err_t wifi_status_handler(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_type(req, "application/json");

  char resp[256];
  if (isAPMode) {
    snprintf(resp, sizeof(resp),
      "{\"mode\":\"ap\",\"ap_ssid\":\"%s\",\"ip\":\"%s\",\"saved_ssid\":\"%s\"}",
      AP_SSID, WiFi.softAPIP().toString().c_str(), wifi_ssid);
  } else {
    snprintf(resp, sizeof(resp),
      "{\"mode\":\"sta\",\"ssid\":\"%s\",\"ip\":\"%s\",\"rssi\":%d,\"mac\":\"%s\"}",
      wifi_ssid, WiFi.localIP().toString().c_str(), WiFi.RSSI(),
      WiFi.macAddress().c_str());
  }
  return httpd_resp_send(req, resp, strlen(resp));
}

// ─── WiFi set: guarda nuevas credenciales y reinicia ────
static esp_err_t wifi_set_handler(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_type(req, "application/json");

  char query[200];
  int qlen = httpd_req_get_url_query_len(req) + 1;
  if (qlen <= 1 || qlen > (int)sizeof(query)) {
    char err[] = "{\"error\":\"Missing ssid and pass parameters\"}";
    httpd_resp_set_status(req, "400 Bad Request");
    return httpd_resp_send(req, err, strlen(err));
  }
  httpd_req_get_url_query_str(req, query, qlen);

  // Parse SSID
  char new_ssid[64] = {0};
  char new_pass[64] = {0};
  if (httpd_query_key_value(query, "ssid", new_ssid, sizeof(new_ssid)) != ESP_OK) {
    char err[] = "{\"error\":\"Missing ssid parameter\"}";
    httpd_resp_set_status(req, "400 Bad Request");
    return httpd_resp_send(req, err, strlen(err));
  }
  // Password is optional (open networks)
  httpd_query_key_value(query, "pass", new_pass, sizeof(new_pass));

  // URL-decode (basic: replace + with space, %XX with chars)
  // For simplicity, just handle + → space which covers most SSIDs
  for (int i = 0; new_ssid[i]; i++) if (new_ssid[i] == '+') new_ssid[i] = ' ';
  for (int i = 0; new_pass[i]; i++) if (new_pass[i] == '+') new_pass[i] = ' ';

  Serial.printf("WiFi change requested: SSID='%s'\n", new_ssid);

  // Save to NVS (persistent flash storage)
  preferences.begin("wifi", false);  // read-write
  preferences.putString("ssid", new_ssid);
  preferences.putString("pass", new_pass);
  preferences.end();

  Serial.println("WiFi credentials saved to NVS. Restarting in 2 seconds...");

  char resp[128];
  snprintf(resp, sizeof(resp),
    "{\"status\":\"ok\",\"ssid\":\"%s\",\"will_restart\":true,\"restart_in_ms\":2000}",
    new_ssid);
  httpd_resp_send(req, resp, strlen(resp));

  // Restart after 2s to allow the response to be sent
  delay(2000);
  ESP.restart();
  return ESP_OK;
}

// ─── WiFi reset: vuelve a las credenciales hardcodeadas ─
static esp_err_t wifi_reset_handler(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_type(req, "application/json");

  // Clear NVS → next boot will use DEFAULT_SSID/DEFAULT_PASS
  preferences.begin("wifi", false);
  preferences.clear();
  preferences.end();

  Serial.printf("WiFi reset to defaults: SSID='%s'. Restarting in 2s...\n", DEFAULT_SSID);

  char resp[128];
  snprintf(resp, sizeof(resp),
    "{\"status\":\"ok\",\"ssid\":\"%s\",\"will_restart\":true,\"restart_in_ms\":2000}",
    DEFAULT_SSID);
  httpd_resp_send(req, resp, strlen(resp));

  delay(2000);
  ESP.restart();
  return ESP_OK;
}

// ─── WebSocket handler para control de motores en tiempo real ───
// Protocolo: texto plano "L:xxx,R:xxx" (valores PWM -255..255)
static esp_err_t ws_handler(httpd_req_t *req) {
  // Primera llamada = handshake HTTP GET → aceptar y salir
  if (req->method == HTTP_GET) {
    Serial.println("WS: motor client connected");
    return ESP_OK;
  }

  // Leer frame WebSocket
  httpd_ws_frame_t ws_pkt;
  memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));
  ws_pkt.type = HTTPD_WS_TYPE_TEXT;

  // Paso 1: obtener longitud del frame (payload = NULL, len = 0)
  esp_err_t ret = httpd_ws_recv_frame(req, &ws_pkt, 0);
  if (ret != ESP_OK) return ret;
  if (ws_pkt.len == 0 || ws_pkt.len > 32) return ESP_OK;

  // Paso 2: leer el payload real
  uint8_t buf[33];
  ws_pkt.payload = buf;
  ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len);
  if (ret != ESP_OK) return ret;
  buf[ws_pkt.len] = '\0';

  // Parsear "L:xxx,R:xxx"
  int leftPWM = 0, rightPWM = 0;
  if (sscanf((char*)buf, "L:%d,R:%d", &leftPWM, &rightPWM) == 2) {
    applyMotorPWM(leftPWM, rightPWM);
    lastWsCommandTime = millis();
  }

  return ESP_OK;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.max_uri_handlers = 14;  // +2 para WebSocket
  
  httpd_uri_t index_uri = {
    .uri = "/",
    .method = HTTP_GET,
    .handler = index_handler,
    .user_ctx = NULL
  };

  httpd_uri_t cmd_uri = {
    .uri = "/action",
    .method = HTTP_GET,
    .handler = action_handler,
    .user_ctx = NULL
  };

  httpd_uri_t health_uri = {
    .uri = "/health",
    .method = HTTP_GET,
    .handler = health_handler,
    .user_ctx = NULL
  };

  httpd_uri_t wifi_status_uri = {
    .uri = "/wifi-status",
    .method = HTTP_GET,
    .handler = wifi_status_handler,
    .user_ctx = NULL
  };

  httpd_uri_t wifi_set_uri = {
    .uri = "/wifi",
    .method = HTTP_GET,
    .handler = wifi_set_handler,
    .user_ctx = NULL
  };

  httpd_uri_t wifi_reset_uri = {
    .uri = "/wifi-reset",
    .method = HTTP_GET,
    .handler = wifi_reset_handler,
    .user_ctx = NULL
  };

  httpd_uri_t stream_uri = {
    .uri = "/stream",
    .method = HTTP_GET,
    .handler = stream_handler,
    .user_ctx = NULL
  };

  // Alias /video -> mismo handler que /stream (compatibilidad)
  httpd_uri_t video_uri = {
    .uri = "/video",
    .method = HTTP_GET,
    .handler = stream_handler,
    .user_ctx = NULL
  };

  if (httpd_start(&camera_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(camera_httpd, &index_uri);
    httpd_register_uri_handler(camera_httpd, &cmd_uri);
    httpd_register_uri_handler(camera_httpd, &health_uri);
    httpd_register_uri_handler(camera_httpd, &wifi_status_uri);
    httpd_register_uri_handler(camera_httpd, &wifi_set_uri);
    httpd_register_uri_handler(camera_httpd, &wifi_reset_uri);

    // ─── WebSocket para motores en tiempo real ───
    httpd_uri_t ws_uri = {
      .uri = "/ws",
      .method = HTTP_GET,
      .handler = ws_handler,
      .user_ctx = NULL,
      .is_websocket = true
    };
    httpd_register_uri_handler(camera_httpd, &ws_uri);
    Serial.println("HTTP + WS server started on port 80 (/, /action, /health, /wifi-*, /ws)");
  }
  config.server_port += 1;
  config.ctrl_port += 1;
  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    httpd_register_uri_handler(stream_httpd, &video_uri);
    Serial.println("Stream server started on port 81 (/stream, /video)");
  }
}