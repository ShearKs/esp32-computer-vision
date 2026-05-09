## Correo electrónico

Me parece unas ideas geniales y sobre todo muy entretenidas. En comparación, la opción de la idea del supermercado si que la veo más compleja y problemática, sobre todo por lo que comentas del acceso a los datos que serían necesarios.

Sobre la del coche, la veo factible en un mes, aunque habría que acotar bien el desarrollo. Siguiendo el resto de ideas, podrías hacer que el flujo del vídeo del ESP32 lo reciba un servidor que tenga algún modelo de detección y segmentación de objetos como YOLO y que haga algo con esos datos, por ejemplo registrar qué objetos ha visto en una sesión. Esto sería lo principal, con esto ya tendrías un prototipo perfecto para presentar como proyecto, pero si ves que se queda corto y te sobra tiempo puedes incluir otras funcionalidades como la estimación de distancias con modelos como MiDaS o DepthAnything.

Mientras llega el coche, puedes probar lo siguiente:

- Hay varias apps para movil (estilo IP Webcam) que te permiten emitir el flujo de video vía HTTP o RTPS dentro de la misma red local. Es prácticamente igual a lo que hace el ESP32, por lo que podrías probar a recibir el flujo de vídeo en tu PC o donde vayas a implementar el servidor.
- Por otra parte, puedes probar a descargar y ejecutar un modelo de detección y segmentación de objetos como YOLO. Tiene muchas versiones, incluso algunas pensadas para ejecutarse en dispositivos de bajos recursos. En base a esto, puedes o bien conectarlo a tu webcam, o incluso al flujo de video del móvil. Eso sí, te recomiendo utilizar la librería de OpenCV, es el estándar ahora mismo para esto.