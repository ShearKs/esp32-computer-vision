
# Comandos de Terminal


## Iniciar servidor uvicorn 🦄
Tiene que estar todo en la carpeta backend para podamos usar los comandos

```bash
# Para iniciar el servidor python en linux
python uvicorn main:app --port 8000

# Para iniciar el servidor Python en Windows
winpty uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Para descargar los modelos de YOLO
cd backend/models
python -c "from ultralytics import YOLO; YOLO('yolov8m.pt')"

```

## Comandos FrontEnd

```bash

## Primero de todo tenemos que estar en la raiz de la app ionic
 cd frontend/robot-vision-app

## Para iniciar la app Ionic
ionic serve

## Para levantar ionic de forma externa
ionic serve --external

```


## App Nativa - Capacitor

```bash

# 2. Instala el paquete de Android para Capacitor
npm install @capacitor/android

# 3. Añade la plataforma Android al proyecto
npx cap add android

# 1. Construir web
npm run build

ionic build

# 2. Sincronizar con Capacitor
npx cap sync

# 3. Probar en Android (con USB depuración activada)
npx cap run android

# También podemos inicar nosotros android y compilar la aplicación
npx cap open android

# 4. Probar en iOS (solo Mac + Xcode)
npx cap run ios
```


## Para permitir que se pueda con subnetting a partir 192.168.1.x

netsh advfirewall firewall add rule name=RobotVisionBackend dir=in action=allow protocol=TCP localport=8000 profile=private remoteip=192.168.1.0/24
