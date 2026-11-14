🔥 AuraHex — Inteligencia Geoespacial y Armonización Satelital de Incendios

Proyecto desarrollado para el NASA Space Apps Challenge.

Plataforma de armonización geoespacial que transforma el caos de miles de detecciones satelitales dispersas en una malla hexagonal 3D unificada para el monitoreo de incendios forestales y evaluación de riesgos en tiempo real.

🌍 El Problema y Nuestra Solución

Los sistemas de monitoreo satelital de la NASA (FIRMS) recopilan datos térmicos desde múltiples constelaciones con resoluciones y formatos incompatibles (Schema Drift):

MODIS (Terra & Aqua): Menor resolución espacial; reporta confianza en porcentaje (0–100%).

VIIRS (NOAA-20): Alta sensibilidad térmica; reporta confianza en categorías textuales (low, nominal, high).

Graficar puntos GPS crudos genera duplicidad visual sobre un mismo incendio y dificulta calcular la energía real acumulada. AuraHex resuelve esto mediante una arquitectura ETL Geoespacial:

Ingesta Automatizada (24/7): Descarga y filtra automáticamente los registros de los últimos 7 días desde NASA FIRMS mediante tareas programadas (APScheduler).

Normalización y Limpieza: Estandariza escalas de confianza, temperaturas de brillo (Kelvin a °C) y Potencia Radiativa del Fuego (FRP en Megawatts).

Indexación Hexagonal Discreta (Uber H3): Agrupa todas las detecciones coincidentes en celdas hexagonales uniformes (Resolución 6), consolidando la potencia térmica total y eliminando el ruido visual.

✨ Características Principales

🧊 Visualización 3D Acelerada por Hardware (Deck.gl): Los hexágonos se extruyen verticalmente y cambian de espectro cromático según la intensidad energética acumulada (FRP).

🕰️ Reproductor Time-Lapse Espacial: Línea de tiempo interactiva con controles Play/Pause para analizar la evolución, propagación o extinción de los focos día por día.

🎛️ Filtros Reactivos Multi-Satélite: Permite aislar lecturas de MODIS o VIIRS, así como segmentar zonas por nivel de amenaza (Extremo >150 MW, Alto 50–150 MW, Moderado <50 MW).

📊 Dashboard Analítico Dinámico: Gráfica de anillo en tiempo real (Recharts) y tooltips inteligentes con estimación de temperatura en °C y firmas satelitales combinadas.

🏗️ Estructura del Repositorio

aurahex-spaceapps/
├── server/ # Backend API y Motor ETL Geoespacial
│ ├── download_data.py # Conector automático con NASA FIRMS (7 días)
│ ├── core_etl.py # Limpieza con Pandas y agrupación espacial Uber H3
│ ├── main.py # API REST con FastAPI y Cron Job cada 24h
│ └── requirements.txt # Dependencias de Python
├── client/ # Frontend Interactivo 3D
│ ├── src/
│ │ ├── App.jsx # Mapa Deck.gl/MapLibre, Dashboard y Time-Lapse
│ │ └── index.css # Configuración Tailwind CSS v4
│ ├── vite.config.js # Configuración de Vite
│ └── package.json # Dependencias de Node/React
├── docs/ # Documentación técnica y guías de despliegue
│ ├── instalacion_desde_cero.md
│ ├── resumen_proyecto_aurahex.md
│ └── roadmap.md
└── .gitignore # Exclusión de entornos virtuales, node_modules y CSVs pesados

🚀 Guía de Inicio Rápido (Para el Equipo)

Requisitos Previos

Python 3.10 o superior (py o python)

Node.js 18 o superior (npm)

Git

1. Clonar el repositorio

git clone https://github.com/TU_USUARIO/aurahex-spaceapps.git
cd aurahex-spaceapps

2. Encender el Backend (server/)

Abre una terminal en la carpeta server:

cd server

# Crear y activar entorno virtual (Windows PowerShell)

py -m venv venv
.\venv\Scripts\activate

# Instalar dependencias

python -m pip install -r requirements.txt

# Iniciar servidor (descargará los datos de la NASA automáticamente al arrancar)

python -m uvicorn main:app --reload

La API quedará disponible en http://127.0.0.1:8000 (Documentación interactiva en /docs).

3. Encender el Frontend (client/)

Abre una segunda terminal en la carpeta client:

cd client

# Instalar paquetes de React, Deck.gl y Tailwind

npm install

# Iniciar servidor de desarrollo

npm run dev

Abre tu navegador en http://localhost:5173 para interactuar con el mapa 3D.

(Nota: Si encuentras algún bloqueo de permisos o rutas en Windows, consulta la guía detallada en docs/instalacion_desde_cero.md).

🗺️ Hoja de Ruta (Roadmap)

[x] Fase 1: Motor ETL con Pandas + Indexación Hexagonal Uber H3 + API FastAPI.

[x] Fase 2: Renderizado 3D con Deck.gl, Dashboard analítico, Time-Lapse de 7 días y Cron Job 24h.

[ ] Fase 3: Landing Page de presentación e integración de rutas de navegación.

[ ] Fase 4: Despliegue en la nube (Render + Vercel) para evaluación del jurado.
