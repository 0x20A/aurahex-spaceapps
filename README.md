# 🔥 AuraHex — Calendario Armonizado de Actividad de Quema y Monitoreo Satelital H3

**Proyecto desarrollado para el 2026 NASA Space Apps Challenge.**

Plataforma web de inteligencia geoespacial que armoniza los registros térmicos de múltiples constelaciones satelitales (MODIS y VIIRS) en una malla hexagonal discreta (Uber H3), permitiendo a brigadistas, científicos y gestores territoriales analizar patrones históricos de incendios, anomalías térmicas y periodos críticos en un entorno 3D interactivo.

# 🌍 El Problema Científico y Nuestra Solución

Los satélites de observación terrestre llevan más de dos décadas rastreando focos de calor, pero sus registros están divididos entre sensores cuyas mediciones no pueden compararse directamente (Schema Drift y discrepancia espacial):

- **MODIS (Terra & Aqua):** Más de 20 años de historial, pero con píxeles de menor resolución ($1\text{ km} \times 1\text{ km}$) y confianza reportada en porcentaje ($0\text{–}100\%$).

- **VIIRS (NOAA-20 & NOAA-21):** Mayor sensibilidad y continuidad moderna con píxeles de alta resolución ($375\text{ m} \times 375\text{ m}$) y confianza categórica (`low`, `nominal`, `high`).

**AuraHex resuelve esta incompatibilidad mediante una arquitectura ETL de Armonización Geoespacial:**

1. **Ingesta Multi-Constelación (30+ Días):** Descarga y consolida datos de **MODIS, VIIRS NOAA-20** y **VIIRS NOAA-21** conectándose a la API de Área de NASA FIRMS (con soporte de acumulación histórica local y actualización programada cada $24\text{ h}$).

2. **Normalización Física:** Homologa las escalas de confianza, convierte lecturas infrarrojas de Kelvin a ${}^\circ\text{C}$ y unifica la Potencia Radiativa del Fuego (**FRP en $\text{MW}$**).

3. **Indexación Hexagonal Universal (Uber H3):** Sustituye los puntos dispares por celdas hexagonales matemáticas uniformes. Una vez indexados, el sensor de origen deja de ser una barrera y los patrones, tendencias y anomalías térmicas se convierten en el enfoque principal.

# ✨ Características Implementadas (Estado Actual)

- **🌐 Experiencia Inmersiva 3D (`Landing.jsx` + `Three.js` + `GSAP`):** Portada interactiva con globo terráqueo orbital, narrativa del reto y transición fluida hacia el visor analítico (`/map`).

- **🔍 Zoom Semántico H3 en Tiempo Real (Niveles 4 a 8):** El mapa recalcula dinámicamente la resolución de los hexágonos al acercar o alejar la cámara, desde escala continental ($\approx 1,770\text{ km}^2$) hasta escala local ($\approx 0.74\text{ km}^2$), respaldado por un motor de caché en memoria que responde en milisegundos.

- **🛰️ Fusión de 3 Constelaciones Satelitales:** Controles independientes para aislar o cruzar detecciones de **MODIS (Terra/Aqua), VIIRS NOAA-20** y **VIIRS NOAA-21**.

- **🗺️ Mapas Base Nativos en WebGL (Esri):** Selector en vivo entre modo **Oscuro Táctico** y fotografía **Satélite Real** renderizados directamente en el motor de `Deck.gl`.

- **🕰️ Reproductor Time-Lapse de 30 Días:** Línea de tiempo interactiva con controles Play/Pause para observar la evolución diaria de los frentes de fuego.

- **📊 Dashboard de Severidad y Tooltips Científicos:** Gráfica dinámica de severidad (**Extremo $>150\text{ MW}$, Alto $50\text{–}150\text{ MW}$, Moderado $<50\text{ MW}$**) e inspección de temperatura estimada en ${}^\circ\text{C}$, confianza promedio y conteo de focos fusionados por celda.

# 🎯 Sprints Finales del Equipo (Alineación con el Reto NASA)

Para cumplir al $100\%$ con todos los objetivos específicos del reto (Harmonized Burning Activity Calendar), dividimos el cierre del proyecto en **3 Sprints funcionales y 1 Sprint de Despliegue**:

## 🟢 Sprint 1: Exportación de Datos Armonizados a CSV (Quick Win)

- **Requisito del Reto:** "A downloadable CSV file of hotspots detected during a search would be another useful output."

- **Objetivo:** Agregar un botón "⬇️ **Exportar CSV Filtrado**" en el panel lateral de `App.jsx` que descargue instantáneamente las celdas H3 activas según los filtros de fecha, satélite, resolución y amenaza seleccionados.

- **Archivos involucrados:** `client/src/App.jsx`.

## 🔥 Sprint 2: Calendario de Actividad de Quema y Comparativa Histórica (Core del Reto)

- **Requisito del Reto:** "Develop a harmonized burning activity calendar... allowing rapid visual identification of seasonal patterns, anomalies, and trends... and compare the current month against the historical median."

- **Objetivo Backend (`server/`):** Crear un endpoint `/api/fires/calendar` en `core_etl.py` y `main.py` que agrupe la serie temporal armonizada por día/mes, calcule el promedio/mediana histórica de actividad y detecte días con anomalías críticas.

- **Objetivo Frontend (`client/`):** Incorporar un panel/modal de "**Calendario de Actividad de Quema**" (heatmap tipo calendario y gráfica comparativa de actividad actual vs. media histórica con rampas de color accesibles).

- **Archivos involucrados:** `server/core_etl.py`, `server/main.py`, `client/src/App.jsx`.

## 🟡 Sprint 3: Selección de Área de Interés (AOI) y Búsqueda por Coordenadas

- **Requisito del Reto:** "Through this visual tool, a user could select a region and a specific date range, then download analytics and visualizations of fire activity."

- **Objetivo:** Permitir filtrar el mapa y el calendario por **Región / Área de Interés** (selector rápido de regiones críticas, filtro por caja de coordenadas `Lat/Lon` o clic directo sobre un hexágono/región para inspeccionar su historial exclusivo) y selector de rango de fechas (`Inicio - Fin`).

- **Archivos involucrados:** `client/src/App.jsx`.

## 🚀 Sprint 4: Despliegue en la Nube y Pitch Final

- **Objetivo:** Publicar el backend (`FastAPI`) en **Render/Railway**, el frontend (`Vite/React`) en **Vercel**, y preparar la demostración en vivo para el jurado.

# 🏗️ Estructura del Repositorio

```
aurahex-spaceapps/
├── server/                     # Backend API y Motor ETL Geoespacial
│   ├── download_data.py        # Conector NASA FIRMS (API 30 días + Fallback 7 días + Acumulación)
│   ├── core_etl.py             # Limpieza Pandas, caché en memoria y agrupación espacial Uber H3
│   ├── main.py                 # API REST con FastAPI, Pre-Caché y Cron Job cada 24h
│   ├── .env                    # Clave privada FIRMS_MAP_KEY (ignorado en Git)
│   └── requirements.txt        # Dependencias de Python
├── client/                     # Frontend Interactivo 3D (React + Vite)
│   ├── public/                 # Texturas espaciales (Blue Marble, México) y logotipos
│   ├── src/
│   │   ├── Landing.jsx         # Portada interactiva con narrativa espacial y GSAP
│   │   ├── OrbitCanvas.jsx     # Contenedor WebGL del globo terráqueo 3D
│   │   ├── orbitScene.js       # Escena Three.js con demostración de celdas H3 en globo
│   │   ├── spaceEffects.js     # Shaders de atmósfera, estrellas y órbitas satelitales
│   │   ├── App.jsx             # Visor 3D Deck.gl, Mapa Esri, Zoom H3, Filtros y Time-Lapse
│   │   ├── MapLoading.jsx      # Pantalla de carga sincronizada
│   │   └── main.jsx            # Enrutamiento entre Landing (/) y Mapa (/map)
│   └── package.json            # Dependencias de Node (Deck.gl, Three.js, GSAP, Recharts)
├── docs/                       # Documentación técnica, análisis del reto y guías del equipo
│   ├── analisis_reto_nasa.md   # Diagnóstico de cumplimiento frente al reto oficial
│   ├── ampliar_rango_historico.md
│   ├── satelites_monitoreo_incendios.md
│   ├── escalas_hexagonales_h3.md
│   └── instalacion_desde_cero.md
└── .gitignore
```

# 🚀 Guía de Inicio Rápido (Para el Equipo)

**Requisitos Previos**

- **Python $3.10+$** (py o python)

- **Node.js $18+$** (npm)

- **Git**

1. Clonar o actualizar el repositorio

```
git clone https://github.com/Rogeliogamer/aurahex-spaceapps.git
cd aurahex-spaceapps
```

2. Configurar y encender el Backend (`server/`)

Abre una terminal en la carpeta `server`:

```
cd server

# Crear y activar entorno virtual (Windows PowerShell)
py -m venv venv
.\venv\Scripts\activate

# Instalar dependencias
python -m pip install -r requirements.txt
```

(Opcional Recomendado) Activar descarga de 30 días con NASA FIRMS API:
Crea un archivo `server/.env` con tu clave gratuita de [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/):

```
FIRMS_MAP_KEY=tu_clave_de_32_caracteres
FIRMS_DAYS=30
```

(Si no creas el archivo `.env`, el sistema funcionará automáticamente en modo público descargando los últimos 7 días).

Ejecuta la descarga inicial y levanta el servidor:

```
python download_data.py
python -m uvicorn main:app --reload
```

La API quedará activa en `http://localhost:8000` (Documentación Swagger en `http://localhost:8000/docs`).

3. Encender el Frontend (`client/`)
   Abre una **segunda terminal** en la carpeta `client`:

```
cd client

# Instalar librerías (incluyendo Three.js, GSAP y Deck.gl)
npm install

# Iniciar servidor de desarrollo
npm run dev
```

Abre `http://localhost:5173` para ver la Landing Page 3D o entra directo a `http://localhost:5173/map` para abrir el visor geoespacial.

# 🤝 Flujo de Trabajo en Git para los Sprints

1. **Antes de iniciar tu Sprint, actualiza tu rama `main`:**

```
git checkout main
git pull origin main
```

2. **Crea una rama para tu funcionalidad:**

- Sprint 1: `git checkout -b feat/csv-export`

- Sprint 2: `git checkout -b feat/burning-calendar`

- Sprint 3: `git checkout -b feat/aoi-filter`

3. **Sube tus cambios y abre un Pull Request (PR) en GitHub** para revisarlo en equipo antes de fusionar a `main`.
