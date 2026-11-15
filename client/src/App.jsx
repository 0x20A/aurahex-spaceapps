import MapLoading from "./MapLoading.jsx";
import { downloadFireCsv } from "./fireCsv.js";
import React, { useState, useEffect, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer, TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ComposedChart,
  Line,
} from "recharts";

// Servidores de mapas de Esri (Raster Tiles directos, inmunes a fallos de WebGL secundario)
const BASEMAPS = {
  DARK: {
    name: "Oscuro Táctico",
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
  SATELLITE: {
    name: "Satélite Real",
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    labels:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  },
};

// Rampas de color (Estándar Térmico vs Accesible para Daltonismo - requisito NASA)
const COLOR_RAMPS = {
  THERMAL: {
    name: "Térmica",
    extremo: { hex: "#ef4444", rgb: [239, 68, 68, 235] },
    alto: { hex: "#f97316", rgb: [249, 115, 22, 225] },
    moderado: { hex: "#eab308", rgb: [234, 179, 8, 200] },
    heatScale: ["#1e293b", "#854d0e", "#ea580c", "#dc2626", "#f87171"],
  },
  ACCESSIBLE: {
    name: "Accesible (Viridis)",
    extremo: { hex: "#fde047", rgb: [253, 224, 71, 240] },
    alto: { hex: "#2dd4bf", rgb: [45, 212, 191, 225] },
    moderado: { hex: "#6366f1", rgb: [99, 102, 241, 210] },
    heatScale: ["#1e1b4b", "#4338ca", "#0d9488", "#84cc16", "#fde047"],
  },
};

// Escalas reales aproximadas por nivel H3
const H3_SCALE_INFO = {
  4: "~1,770 km² (Macro)",
  5: "~252 km² (Regional)",
  6: "~36.1 km² (Estatal)",
  7: "~5.16 km² (Municipal)",
  8: "~0.74 km² (Local)",
};

const INITIAL_VIEW_STATE = {
  longitude: -101.0,
  latitude: 25.5,
  zoom: 4.5,
  pitch: 45,
  bearing: 0,
};

export default function App() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const [{ cells: fireData, resolution: loadedResolution }, setFireData] =
    useState({ cells: [], resolution: null });
  const [uniqueDates, setUniqueDates] = useState([]);
  const [currentDateIndex, setCurrentDateIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverInfo, setHoverInfo] = useState(null);

  // Estado del Mapa Base, Rampa de Color y Zoom Semántico
  const [mapTheme, setMapTheme] = useState("DARK");
  const [colorRamp, setColorRamp] = useState("THERMAL");
  const [h3Resolution, setH3Resolution] = useState(5);
  const [targetResolution, setTargetResolution] = useState(5);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(4.5);

  // Estado del Sprint 2: Calendario Armonizado de Actividad de Quema
  const [calendarData, setCalendarData] = useState(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarTab, setCalendarTab] = useState("HEATMAP"); // 'HEATMAP' | 'ANOMALIES' | 'MULTIYEAR'

  // Filtros interactivos
  const [activeSats, setActiveSats] = useState({
    MODIS: true,
    NOAA20: true,
    NOAA21: true,
  });
  const [activeThreats, setActiveThreats] = useState({
    EXTREMO: true,
    ALTO: true,
    MODERADO: true,
  });

  const activePalette = COLOR_RAMPS[colorRamp];

  // 1. Escucha del zoom de la cámara
  const onViewStateChange = ({ viewState }) => {
    const roundedZoom = Math.round(viewState.zoom * 10) / 10;
    if (roundedZoom !== cameraZoom) {
      setCameraZoom(roundedZoom);
    }

    let newRes = 5;
    if (viewState.zoom < 4) newRes = 4;
    else if (viewState.zoom >= 4 && viewState.zoom < 5.8) newRes = 5;
    else if (viewState.zoom >= 5.8 && viewState.zoom < 7.5) newRes = 6;
    else if (viewState.zoom >= 7.5 && viewState.zoom < 9.2) newRes = 7;
    else if (viewState.zoom >= 9.2) newRes = 8;

    if (newRes !== targetResolution) {
      setTargetResolution(newRes);
    }
  };

  // 2. Debounce de 250ms para pedir la nueva malla H3 solo al estabilizar el zoom
  useEffect(() => {
    const timer = setTimeout(() => {
      if (targetResolution !== h3Resolution) {
        setH3Resolution(targetResolution);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [targetResolution, h3Resolution]);

  // 3. Descarga dinámica desde FastAPI (Malla H3 + Calendario Armonizado)
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let active = true;
    setIsRecalculating(true);
    setDataError(false);

    Promise.all([
      fetch(
        `http://localhost:8000/api/fires/harmonized?resolution=${h3Resolution}`,
        {
          signal: controller.signal,
        },
      ).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
      fetch(
        `http://localhost:8000/api/fires/calendar?resolution=${h3Resolution}`,
        {
          signal: controller.signal,
        },
      ).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([data, calData]) => {
        if (!active) return;
        if (!Array.isArray(data))
          throw new Error("Respuesta inválida de la API");

        setFireData({ cells: data, resolution: h3Resolution });
        if (calData) setCalendarData(calData);

        const dates = [...new Set(data.map((d) => d.acq_date))].sort();
        setUniqueDates(dates);
        setCurrentDateIndex((prev) =>
          dates.length > 0 && prev >= dates.length ? dates.length - 1 : prev,
        );
        if (uniqueDates.length === 0 && dates.length > 0) {
          setCurrentDateIndex(dates.length - 1);
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error("Error al conectar con la API:", error);
        setDataError(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!active) return;
        setIsRecalculating(false);
        setInitialLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [h3Resolution]);

  // 4. Reloj del Reproductor Time-Lapse
  useEffect(() => {
    let interval;
    if (isPlaying && uniqueDates.length > 0) {
      interval = setInterval(() => {
        setCurrentDateIndex((prev) => (prev + 1) % uniqueDates.length);
      }, 1800);
    }
    return () => clearInterval(interval);
  }, [isPlaying, uniqueDates.length]);

  // 5. Filtrado espacial y temporal
  const currentDate = uniqueDates[currentDateIndex];
  const filteredData = useMemo(() => {
    return fireData.filter((d) => {
      const instrumentsStr = String(d.instruments).toUpperCase();
      const hasModis =
        instrumentsStr.includes("MODIS") ||
        instrumentsStr === "T" ||
        instrumentsStr === "A" ||
        instrumentsStr.includes("TERRA") ||
        instrumentsStr.includes("AQUA");
      const hasNoaa20 =
        instrumentsStr.includes("NOAA-20") ||
        instrumentsStr.includes("N20") ||
        instrumentsStr
          .split(",")
          .map((s) => s.trim())
          .includes("1");
      const hasNoaa21 =
        instrumentsStr.includes("NOAA-21") ||
        instrumentsStr.includes("N21") ||
        instrumentsStr
          .split(",")
          .map((s) => s.trim())
          .includes("2");

      const satMatch =
        (activeSats.MODIS && hasModis) ||
        (activeSats.NOAA20 && hasNoaa20) ||
        (activeSats.NOAA21 && hasNoaa21);

      const isExtremo = d.total_frp > 150;
      const isAlto = d.total_frp > 50 && d.total_frp <= 150;
      const isModerado = d.total_frp <= 50;

      let threatMatch = false;
      if (activeThreats.EXTREMO && isExtremo) threatMatch = true;
      if (activeThreats.ALTO && isAlto) threatMatch = true;
      if (activeThreats.MODERADO && isModerado) threatMatch = true;

      const dateMatch = currentDate ? d.acq_date === currentDate : true;

      return satMatch && threatMatch && dateMatch;
    });
  }, [fireData, activeSats, activeThreats, currentDate]);

  const exportPending =
    isRecalculating ||
    loadedResolution !== h3Resolution ||
    targetResolution !== h3Resolution;
  const canExportCsv =
    !dataError &&
    !exportPending &&
    Boolean(currentDate) &&
    filteredData.length > 0;

  // Estadísticas del día seleccionado en el Calendario
  const currentDayStats = useMemo(() => {
    if (!calendarData?.daily?.length) return null;
    return (
      calendarData.daily.find((d) => d.date === currentDate) ||
      calendarData.daily[calendarData.daily.length - 1]
    );
  }, [calendarData, currentDate]);

  // 6. Estadísticas para la gráfica de anillo
  const chartData = useMemo(() => {
    let extremo = 0,
      alto = 0,
      moderado = 0;
    filteredData.forEach((d) => {
      if (d.total_frp > 150) extremo++;
      else if (d.total_frp > 50) alto++;
      else moderado++;
    });
    return [
      { name: "Extremo", value: extremo, color: activePalette.extremo.hex },
      { name: "Alto", value: alto, color: activePalette.alto.hex },
      { name: "Moderado", value: moderado, color: activePalette.moderado.hex },
    ];
  }, [filteredData, activePalette]);

  // Función auxiliar para colorear celdas del calendario según intensidad
  const getHeatColor = (ratio) => {
    const scale = activePalette.heatScale;
    if (ratio >= 0.8) return scale[4];
    if (ratio >= 0.6) return scale[3];
    if (ratio >= 0.4) return scale[2];
    if (ratio >= 0.2) return scale[1];
    return scale[0];
  };

  // 7. Capas WebGL (Mapa Base Esri + Etiquetas + Hexágonos H3 en el mismo lienzo)
  const layers = [
    new TileLayer({
      id: `esri-base-${mapTheme}`,
      data: BASEMAPS[mapTheme].base,
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props) => {
        const {
          bbox: { west, south, east, north },
        } = props.tile;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    }),
    new TileLayer({
      id: `esri-labels-${mapTheme}`,
      data: BASEMAPS[mapTheme].labels,
      minZoom: 0,
      maxZoom: 16,
      tileSize: 256,
      renderSubLayers: (props) => {
        const {
          bbox: { west, south, east, north },
        } = props.tile;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    }),
    new H3HexagonLayer({
      id: "h3-hexagon-layer",
      data: filteredData,
      pickable: true,
      wireframe: false,
      filled: true,
      extruded: true,
      elevationScale: h3Resolution >= 7 ? 5 : 20,
      getHexagon: (d) => d.h3_index,
      getFillColor: (d) => {
        if (d.total_frp > 150) return activePalette.extremo.rgb;
        if (d.total_frp > 50) return activePalette.alto.rgb;
        return activePalette.moderado.rgb;
      },
      getElevation: (d) => d.total_frp,
      onHover: (info) => setHoverInfo(info),
      updateTriggers: {
        getFillColor: [filteredData, colorRamp],
        getElevation: [filteredData, h3Resolution],
      },
    }),
  ];

  if (initialLoading) return <MapLoading />;

  return (
    <div className="flex h-screen w-full bg-gray-950 text-white overflow-hidden font-sans">
      {/* PANEL LATERAL DE CONTROL */}
      <div className="w-96 bg-gray-900/95 p-5 flex flex-col gap-3.5 z-10 shadow-2xl overflow-y-auto border-r border-gray-800">
        {/* Encabezado */}
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-600">
              AuraHex
            </h1>
            <a
              href="/"
              className="text-[11px] text-gray-400 hover:text-white bg-gray-800 px-2.5 py-1 rounded-md border border-gray-700 transition-colors"
            >
              ← Portada
            </a>
          </div>
          <p className="text-gray-400 text-xs mt-0.5">
            Calendario Armonizado & Motor H3
          </p>

          <div className="mt-2.5 flex items-center justify-between bg-gray-800/70 px-3 py-2 rounded-lg border border-gray-700/60">
            {dataError ? (
              <span
                role="status"
                className="text-xs font-semibold text-orange-300"
              >
                Datos no disponibles
              </span>
            ) : (
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                <span className="text-green-400">API SINCRONIZADA</span>
              </div>
            )}
            <span className="text-xs font-mono text-gray-300">
              {filteredData.length} celdas
            </span>
          </div>

          {/* BOTÓN SPRINT 1: EXPORTACIÓN CSV */}
          <button
            type="button"
            disabled={!canExportCsv}
            onClick={() =>
              downloadFireCsv(filteredData, loadedResolution, currentDate)
            }
            className="mt-2 w-full rounded-lg border border-orange-500/50 bg-orange-600/20 px-3 py-2 text-xs font-bold text-orange-200 transition-colors enabled:cursor-pointer enabled:hover:bg-orange-600/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">⬇️ </span>Exportar CSV Filtrado
          </button>
          {!dataError && !canExportCsv && (
            <p className="mt-1 text-[11px] text-gray-400">
              {exportPending
                ? "Actualizando resolución H3…"
                : "No hay celdas para exportar con estos filtros."}
            </p>
          )}
        </div>

        {/* BOTÓN DESTACADO SPRINT 2: CALENDARIO DE ACTIVIDAD DE QUEMA */}
        <div className="bg-gradient-to-br from-orange-950/60 via-gray-900 to-gray-900 p-3.5 rounded-xl border border-orange-500/40 shadow-lg">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-300">
              🔥 Calendario de Actividad
            </span>
            {currentDayStats && (
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  currentDayStats.anomaly_pct >= 10
                    ? "bg-red-500/20 text-red-300 border border-red-500/40"
                    : currentDayStats.anomaly_pct <= -15
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-gray-800 text-gray-300 border border-gray-700"
                }`}
              >
                {currentDayStats.anomaly_pct > 0
                  ? `+${currentDayStats.anomaly_pct}%`
                  : `${currentDayStats.anomaly_pct}%`}{" "}
                vs Mediana
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed mb-2.5">
            Compara la serie armonizada MODIS/VIIRS contra la mediana histórica
            e identifica anomalías.
          </p>
          <button
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>
              📅{" "}
              {isCalendarOpen
                ? "Ocultar Calendario Histórico"
                : "Abrir Calendario de Quema"}
            </span>
          </button>
        </div>

        {/* Selector de Mapa Base y Rampa de Color Accesible */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <h3 className="text-[11px] text-gray-400 uppercase font-bold tracking-wider mb-1.5">
              Mapa Base
            </h3>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(BASEMAPS).map(([key]) => (
                <button
                  key={key}
                  onClick={() => setMapTheme(key)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all border ${
                    mapTheme === key
                      ? "bg-orange-600/20 border-orange-500 text-orange-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  {key === "DARK" ? "🌑 Oscuro" : "🛰️ Satélite"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] text-gray-400 uppercase font-bold tracking-wider mb-1.5">
              Paleta Color
            </h3>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(COLOR_RAMPS).map(([key]) => (
                <button
                  key={key}
                  onClick={() => setColorRamp(key)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all border ${
                    colorRamp === key
                      ? "bg-indigo-600/30 border-indigo-400 text-indigo-200"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  {key === "THERMAL" ? "🔥 Térmica" : "👁️ Viridis"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Motor de Zoom Semántico H3 */}
        <div className="bg-gray-800/90 p-3 rounded-xl border border-gray-700">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider">
              Zoom Semántico H3
            </h3>
            {isRecalculating && (
              <span className="text-[11px] text-orange-400 animate-pulse font-bold">
                🔄 Recalculando...
              </span>
            )}
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-300">Zoom / Resolución:</span>
            <span className="font-mono font-bold text-orange-400">
              {cameraZoom.toFixed(1)}x • Nivel {h3Resolution}
            </span>
          </div>
          <div className="mt-1 pt-1 border-t border-gray-700/70 flex justify-between text-[11px] text-gray-400">
            <span>Área por celda:</span>
            <span className="font-mono text-gray-200">
              {H3_SCALE_INFO[h3Resolution]}
            </span>
          </div>
        </div>

        {/* Línea de Tiempo (Time-Lapse 30 días) */}
        <div className="bg-gray-800/90 p-3 rounded-xl border border-gray-700">
          <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">
            Evolución Temporal ({uniqueDates.length || 30} Días)
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="bg-orange-600 hover:bg-orange-500 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors shrink-0 shadow-lg cursor-pointer"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <div className="flex-1">
              <div className="text-sm font-bold text-orange-300 font-mono">
                {currentDate || "Cargando..."}
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, uniqueDates.length - 1)}
                value={currentDateIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentDateIndex(Number(e.target.value));
                }}
                className="w-full accent-orange-500 mt-1 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Filtro Satelital */}
        <div>
          <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1.5">
            Constelación Satelital (3 Fuentes)
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() =>
                setActiveSats({ ...activeSats, MODIS: !activeSats.MODIS })
              }
              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                activeSats.MODIS
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-gray-800 text-gray-500 border border-gray-700"
              }`}
            >
              MODIS
              <span className="block text-[9px] font-normal opacity-80">
                Terra / Aqua
              </span>
            </button>
            <button
              onClick={() =>
                setActiveSats({ ...activeSats, NOAA20: !activeSats.NOAA20 })
              }
              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                activeSats.NOAA20
                  ? "bg-purple-600 text-white shadow-md"
                  : "bg-gray-800 text-gray-500 border border-gray-700"
              }`}
            >
              VIIRS N20
              <span className="block text-[9px] font-normal opacity-80">
                NOAA-20
              </span>
            </button>
            <button
              onClick={() =>
                setActiveSats({ ...activeSats, NOAA21: !activeSats.NOAA21 })
              }
              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                activeSats.NOAA21
                  ? "bg-fuchsia-600 text-white shadow-md"
                  : "bg-gray-800 text-gray-500 border border-gray-700"
              }`}
            >
              VIIRS N21
              <span className="block text-[9px] font-normal opacity-80">
                NOAA-21
              </span>
            </button>
          </div>
        </div>

        {/* Nivel de Amenaza */}
        <div>
          <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1.5">
            Nivel de Amenaza (FRP)
          </h3>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() =>
                setActiveThreats({
                  ...activeThreats,
                  EXTREMO: !activeThreats.EXTREMO,
                })
              }
              className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                activeThreats.EXTREMO
                  ? "border-red-500/80 bg-gray-800 text-white"
                  : "border-gray-800 bg-gray-800/40 text-gray-500"
              }`}
            >
              <span className="font-bold">Extremo ({">"}150 MW)</span>
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: activePalette.extremo.hex }}
              ></span>
            </button>
            <button
              onClick={() =>
                setActiveThreats({
                  ...activeThreats,
                  ALTO: !activeThreats.ALTO,
                })
              }
              className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                activeThreats.ALTO
                  ? "border-orange-500/80 bg-gray-800 text-white"
                  : "border-gray-800 bg-gray-800/40 text-gray-500"
              }`}
            >
              <span className="font-bold">Alto (50–150 MW)</span>
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: activePalette.alto.hex }}
              ></span>
            </button>
            <button
              onClick={() =>
                setActiveThreats({
                  ...activeThreats,
                  MODERADO: !activeThreats.MODERADO,
                })
              }
              className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                activeThreats.MODERADO
                  ? "border-yellow-500/80 bg-gray-800 text-white"
                  : "border-gray-800 bg-gray-800/40 text-gray-500"
              }`}
            >
              <span className="font-bold">Moderado ({"<"}50 MW)</span>
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: activePalette.moderado.hex }}
              ></span>
            </button>
          </div>
        </div>

        {/* Gráfica de Distribución */}
        <div className="bg-gray-800/90 p-3 rounded-xl border border-gray-700">
          <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">
            Distribución de Severidad
          </h3>
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={24}
                  outerRadius={42}
                  paddingAngle={3}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "#111827",
                    border: "1px solid #374151",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  itemStyle={{ color: "#fff" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-auto pt-1">
          <p className="text-[11px] text-gray-500 text-center">
            NASA Space Apps Challenge • AuraHex
          </p>
        </div>
      </div>

      {/* LIENZO 3D PRINCIPAL */}
      <div className="flex-1 relative bg-gray-950">
        <DeckGL
          initialViewState={INITIAL_VIEW_STATE}
          controller={true}
          layers={layers}
          onViewStateChange={onViewStateChange}
        />

        {/* Botón flotante superior derecho para acceso rápido al Calendario */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <button
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            className="bg-gray-900/90 hover:bg-gray-800 text-white px-4 py-2 rounded-xl border border-orange-500/50 shadow-2xl text-xs font-bold flex items-center gap-2 backdrop-blur-md cursor-pointer transition-all"
          >
            <span>📅 Calendario Armonizado</span>
            {calendarData?.summary && (
              <span className="bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-md font-mono">
                Mediana: {calendarData.summary.median_daily_cells} celdas/día
              </span>
            )}
          </button>
        </div>

        {/* PANEL / MODAL INTERACTIVO DEL CALENDARIO DE ACTIVIDAD DE QUEMA (SPRINT 2) */}
        {isCalendarOpen && calendarData && (
          <div className="absolute inset-x-6 bottom-8 z-30 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-2xl shadow-2xl p-5 max-h-[78vh] flex flex-col overflow-hidden">
            {/* Cabecera del Calendario */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-gray-800">
              <div>
                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <span>
                    📅 Calendario Armonizado de Actividad de Quema (MODIS +
                    VIIRS)
                  </span>
                  <span className="text-xs font-mono bg-orange-500/20 text-orange-300 px-2.5 py-0.5 rounded-full border border-orange-500/30">
                    H3 Nivel {h3Resolution}
                  </span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Fusión espacio-temporal de focos activos para identificar
                  patrones estacionales, periodos críticos y anomalías frente a
                  la mediana histórica.
                </p>
              </div>

              {/* Pestañas del Calendario */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCalendarTab("HEATMAP")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    calendarTab === "HEATMAP"
                      ? "bg-orange-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  🗓️ Mapa de Calor (30 Días)
                </button>
                <button
                  onClick={() => setCalendarTab("ANOMALIES")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    calendarTab === "ANOMALIES"
                      ? "bg-orange-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  📈 Anomalías vs. Mediana
                </button>
                <button
                  onClick={() => setCalendarTab("MULTIYEAR")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    calendarTab === "MULTIYEAR"
                      ? "bg-orange-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  🏛️ Régimen Multi-Anual (2019–2026)
                </button>
                <button
                  onClick={() => setIsCalendarOpen(false)}
                  className="ml-2 bg-gray-800 hover:bg-red-900/60 text-gray-300 hover:text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold border border-gray-700 cursor-pointer"
                  title="Cerrar calendario"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Tarjetas KPI de Armonización */}
            <div className="grid grid-cols-4 gap-3 my-3">
              <div className="bg-gray-800/70 p-3 rounded-xl border border-gray-700/70">
                <div className="text-[11px] text-gray-400 uppercase font-semibold">
                  Mediana del Periodo
                </div>
                <div className="text-xl font-extrabold text-white font-mono mt-0.5">
                  {calendarData.summary.median_daily_cells}{" "}
                  <span className="text-xs font-normal text-gray-400">
                    celdas H3/día
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Energía mediana: {calendarData.summary.median_daily_frp} MW
                </div>
              </div>

              <div className="bg-gray-800/70 p-3 rounded-xl border border-gray-700/70">
                <div className="text-[11px] text-gray-400 uppercase font-semibold">
                  Día Crítico (Pico)
                </div>
                <div className="text-xl font-extrabold text-orange-400 font-mono mt-0.5">
                  {calendarData.summary.peak_date}
                </div>
                <div className="text-[11px] text-red-300 mt-0.5">
                  {calendarData.summary.peak_cells} celdas (
                  {calendarData.summary.peak_anomaly_pct > 0
                    ? `+${calendarData.summary.peak_anomaly_pct}%`
                    : `${calendarData.summary.peak_anomaly_pct}%`}{" "}
                  sobre mediana)
                </div>
              </div>

              <div className="bg-gray-800/70 p-3 rounded-xl border border-gray-700/70">
                <div className="text-[11px] text-gray-400 uppercase font-semibold">
                  Reducción de Duplicados
                </div>
                <div className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
                  {calendarData.summary.harmonization_efficiency_pct}%
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {calendarData.summary.total_raw_detections.toLocaleString()}{" "}
                  focos →{" "}
                  {calendarData.summary.total_harmonized_cell_days.toLocaleString()}{" "}
                  celdas
                </div>
              </div>

              <div className="bg-gray-800/70 p-3 rounded-xl border border-gray-700/70">
                <div className="text-[11px] text-gray-400 uppercase font-semibold">
                  Fecha Activa en Mapa
                </div>
                <div className="text-xl font-extrabold text-blue-400 font-mono mt-0.5">
                  {currentDate || "-"}
                </div>
                <div className="text-[11px] text-gray-300 mt-0.5">
                  {currentDayStats
                    ? `${currentDayStats.harmonized_cells} celdas (${currentDayStats.anomaly_pct > 0 ? "+" : ""}${currentDayStats.anomaly_pct}% vs mediana)`
                    : "Selecciona un día"}
                </div>
              </div>
            </div>

            {/* CONTENIDO DE PESTAÑA 1: HEATMAP CALENDARIO DIARIO INTERACTIVO */}
            {calendarTab === "HEATMAP" && (
              <div className="overflow-y-auto pr-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-300 font-semibold">
                    Haz clic en cualquier día del calendario para sincronizar el
                    Mapa 3D:
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <span>Menor actividad</span>
                    {activePalette.heatScale.map((c, idx) => (
                      <span
                        key={idx}
                        className="w-4 h-3 rounded-sm inline-block border border-gray-700"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <span>Periodo crítico</span>
                  </div>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-10 gap-2">
                  {calendarData.daily.map((dayItem) => {
                    const ratio =
                      (dayItem.harmonized_cells -
                        calendarData.summary.min_daily_cells) /
                      Math.max(
                        1,
                        calendarData.summary.max_daily_cells -
                          calendarData.summary.min_daily_cells,
                      );
                    const bg = getHeatColor(ratio);
                    const isSelected = currentDate === dayItem.date;

                    return (
                      <button
                        key={dayItem.date}
                        onClick={() => {
                          const idx = uniqueDates.indexOf(dayItem.date);
                          if (idx !== -1) {
                            setIsPlaying(false);
                            setCurrentDateIndex(idx);
                          }
                        }}
                        style={{ backgroundColor: bg }}
                        className={`p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                          isSelected
                            ? "ring-2 ring-white border-white scale-[1.03]"
                            : "border-gray-700/80 hover:border-gray-400"
                        }`}
                      >
                        <div className="text-[11px] font-mono font-bold text-white drop-shadow">
                          {dayItem.date.slice(5)}
                        </div>
                        <div className="text-sm font-extrabold text-white mt-0.5 drop-shadow">
                          {dayItem.harmonized_cells}
                        </div>
                        <div className="text-[10px] font-mono text-gray-100 opacity-90">
                          {dayItem.anomaly_pct > 0
                            ? `+${dayItem.anomaly_pct}%`
                            : `${dayItem.anomaly_pct}%`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CONTENIDO DE PESTAÑA 2: GRÁFICA DE ANOMALÍAS DIARIAS Y ESTACIONALES VS MEDIANA */}
            {calendarTab === "ANOMALIES" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-64">
                <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-800 flex flex-col">
                  <h4 className="text-xs font-bold text-gray-300 uppercase mb-2">
                    Serie Diaria Armonizada vs. Mediana del Periodo
                  </h4>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={calendarData.daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => v.slice(5)}
                          stroke="#9ca3af"
                          fontSize={10}
                        />
                        <YAxis stroke="#9ca3af" fontSize={10} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#111827",
                            border: "1px solid #374151",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <ReferenceLine
                          y={calendarData.summary.median_daily_cells}
                          stroke="#38bdf8"
                          strokeDasharray="4 4"
                          label={{
                            value: "Mediana",
                            fill: "#38bdf8",
                            fontSize: 10,
                          }}
                        />
                        <Bar
                          dataKey="harmonized_cells"
                          name="Celdas H3 Activas"
                          fill={activePalette.alto.hex}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-800 flex flex-col">
                  <h4 className="text-xs font-bold text-gray-300 uppercase mb-2">
                    Comparativa Mensual: Año Actual (2026) vs. Mediana Histórica
                    MODIS+VIIRS
                  </h4>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={calendarData.monthly_climatology}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="month" stroke="#9ca3af" fontSize={10} />
                        <YAxis stroke="#9ca3af" fontSize={10} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#111827",
                            border: "1px solid #374151",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Bar
                          dataKey="current_year"
                          name="Actividad 2026 (Celdas H3)"
                          fill={activePalette.extremo.hex}
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          type="monotone"
                          dataKey="historical_median"
                          name="Mediana Histórica (2003-2025)"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="critical_threshold"
                          name="Umbral Crítico (P90)"
                          stroke="#facc15"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* CONTENIDO DE PESTAÑA 3: MATRIZ MULTI-ANUAL (AÑOS X MESES) */}
            {calendarTab === "MULTIYEAR" && (
              <div className="overflow-x-auto overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800">
                      <th className="py-2 px-2 text-left font-bold">Año</th>
                      {[
                        "Ene",
                        "Feb",
                        "Mar",
                        "Abr",
                        "May",
                        "Jun",
                        "Jul",
                        "Ago",
                        "Sep",
                        "Oct",
                        "Nov",
                        "Dic",
                      ].map((m) => (
                        <th key={m} className="py-2 px-2 text-center font-bold">
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calendarData.multiyear_matrix.map((row) => (
                      <tr
                        key={row.year}
                        className="border-b border-gray-800/60"
                      >
                        <td className="py-1.5 px-2 font-mono font-bold text-gray-200">
                          {row.year}
                        </td>
                        {row.months.map((mCell) => (
                          <td key={mCell.month} className="p-1">
                            <div
                              style={{
                                backgroundColor: getHeatColor(
                                  mCell.ratio_to_peak,
                                ),
                              }}
                              className="rounded-md py-1.5 px-1 text-center font-mono text-[11px] text-white font-semibold border border-black/20"
                              title={`${row.year} - ${mCell.month}: ${mCell.cells.toLocaleString()} celdas H3 armonizadas`}
                            >
                              {mCell.cells.toLocaleString()}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Atribución inferior derecha */}
        <div className="absolute bottom-2 right-3 z-20 bg-gray-900/80 px-2.5 py-1 rounded text-[11px] text-gray-400 border border-gray-800 pointer-events-none">
          Tiles © Esri, HERE, Garmin, USGS • Motor H3 Deck.gl
        </div>

        {/* Tooltip 3D al pasar el cursor */}
        {hoverInfo && hoverInfo.object && (
          <div
            className="absolute z-50 bg-gray-900/95 backdrop-blur-md border border-gray-700 text-white p-3.5 rounded-xl shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-full -mt-3 min-w-56"
            style={{ left: hoverInfo.x, top: hoverInfo.y }}
          >
            <div className="text-[11px] font-mono text-gray-400 mb-0.5">
              H3 (Res {h3Resolution}): {hoverInfo.object.h3_index}
            </div>
            <div className="text-xl font-extrabold text-orange-400 mb-2">
              {hoverInfo.object.total_frp.toFixed(1)} MW (FRP)
            </div>
            <div className="flex flex-col gap-1 text-xs border-t border-gray-800 pt-2">
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Temp. Brillo Est.:</span>
                <span className="font-bold text-red-300">
                  {Math.max(
                    0,
                    hoverInfo.object.avg_brightness - 273.15,
                  ).toFixed(1)}{" "}
                  °C
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Confianza Promedio:</span>
                <span className="font-bold text-green-400">
                  {hoverInfo.object.avg_confidence.toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Satélites:</span>
                <span className="font-bold text-right text-blue-300">
                  {hoverInfo.object.instruments}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Focos fusionados:</span>
                <span className="font-bold">
                  {hoverInfo.object.point_count}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
