# Proyecto Final - IA y Big Data

## Arquitectura del Proyecto

Este proyecto se estructura en dos grandes partes interconectadas: un **Backend** responsable de la lógica de procesamiento y la IA, y un **Frontend** responsable de la interfaz de usuario y la visualización de los resultados.

### 1. Backend (Lógica y Procesamiento)

El backend se encuentra en el directorio `backend/` y contiene la lógica principal del sistema.

*   **`backend/core_pipeline.py`**: Este es el núcleo del procesamiento. Contiene la lógica principal para ejecutar el pipeline de IA, probablemente manejando la entrada de datos, el procesamiento y la generación de resultados.
*   **`backend/main.py`**: Punto de entrada principal de la aplicación backend, que probablemente orquesta la ejecución del pipeline y la interacción con otros módulos.
*   **`backend/config.py`**: Contiene la configuración necesaria para el sistema, como rutas, parámetros de modelo o configuraciones de entorno.
*   **`backend/test_yolo.py`**: Contiene scripts de prueba relacionados con el modelo YOLO, indicando la parte de validación o entrenamiento del modelo.

### 2. Frontend (Interfaz de Usuario)

El frontend se encuentra en `frontend/robot-vision-app/` y es una aplicación basada en React/TypeScript que interactúa con el backend para mostrar y controlar la información.

*   **Componentes (`src/components/`)**: Contienen la UI modularizada:
    *   `JoystickControl.tsx`/`.css`: Componente para el control de entrada (posiblemente para el robot vision).
    *   `DetectionPanel.tsx`/`.css`: Componente para mostrar los resultados de la detección.
    *   `DetectionStream.tsx`/`.css`: Componente para visualizar el flujo de datos o el video.
    *   `ExploreContainer.tsx`/`.css`: Componente para la exploración de datos.
*   **Contexto (`src/context/`)**: Gestiona el estado global de la aplicación, como `SettingsContext.tsx`.
*   **Servicios (`src/services/`)**: Contiene la lógica de comunicación con el backend, como `api.ts`, que se encarga de hacer las llamadas HTTP necesarias para obtener datos del pipeline.
*   **Páginas (`src/pages/`)**: Definen las vistas principales de la aplicación, como `HomePage.tsx`, `Tab2.tsx`, y `Tab3.tsx`.

### Comunicación entre Componentes

La comunicación se establece mediante una arquitectura de cliente-servidor:

1.  **Frontend a Backend (Solicitud de Datos):**
    *   Los componentes del Frontend (ej. `src/services/api.ts`) realizan solicitudes (probablemente llamadas HTTP) a los *endpoints* definidos en el Backend (ej. `backend/main.py` o un servidor web asociado) para solicitar datos procesados o iniciar tareas.
2.  **Backend (Procesamiento):**
    *   El `backend/core_pipeline.py` recibe las solicitudes del frontend, ejecuta la lógica de IA o procesamiento, y genera los resultados.
3.  **Backend a Frontend (Respuesta):**
    *   El Backend devuelve los resultados procesados al Frontend a través de las mismas llamadas de API.
4.  **Estado Global:**
    *   El estado de la aplicación se gestiona a través del contexto (`SettingsContext.tsx`) para asegurar que todos los componentes tengan acceso a la información necesaria.

En resumen, el Frontend actúa como la capa de presentación y control, mientras que el Backend es la capa de negocio y procesamiento de datos.