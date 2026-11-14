import MapLoading from './MapLoading.jsx';
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
  const [fireData, setFireData] = useState([]);
  const [uniqueDates, setUniqueDates] = useState([]);
  const [currentDateIndex, setCurrentDateIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverInfo, setHoverInfo] = useState(null);

  // Estado del Mapa Base y Zoom Semántico
  const [mapTheme, setMapTheme] = useState("DARK");
  const [h3Resolution, setH3Resolution] = useState(5);
  const [targetResolution, setTargetResolution] = useState(5);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(4.5);

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

  // 3. Descarga dinámica desde FastAPI según la resolución H3 activa
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let active = true;
    setIsRecalculating(true);
    setDataError(false);
    fetch(
      `http://localhost:8000/api/fires/harmonized?resolution=${h3Resolution}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        if (!Array.isArray(data)) throw new Error("Respuesta inválida de la API");
        setFireData(data);
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

      const currentDate = uniqueDates[currentDateIndex];
      const dateMatch = currentDate ? d.acq_date === currentDate : true;

      return satMatch && threatMatch && dateMatch;
    });
  }, [fireData, activeSats, activeThreats, uniqueDates, currentDateIndex]);

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
      { name: "Extremo", value: extremo, color: "#ef4444" },
      { name: "Alto", value: alto, color: "#f97316" },
      { name: "Moderado", value: moderado, color: "#eab308" },
    ];
  }, [filteredData]);

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
      // Ajustamos la escala vertical según el nivel de zoom para mantener proporción visual
      elevationScale: h3Resolution >= 7 ? 5 : 20,
      getHexagon: (d) => d.h3_index,
      getFillColor: (d) => {
        if (d.total_frp > 150) return [239, 68, 68, 235]; // Rojo Extremo
        if (d.total_frp > 50) return [249, 115, 22, 225]; // Naranja Alto
        return [234, 179, 8, 200]; // Amarillo Moderado
      },
      getElevation: (d) => d.total_frp,
      onHover: (info) => setHoverInfo(info),
      updateTriggers: {
        getFillColor: [filteredData],
        getElevation: [filteredData, h3Resolution],
      },
    }),
  ];

  if (initialLoading) return <MapLoading />;

  return (
    <div className="flex h-screen w-full bg-gray-950 text-white overflow-hidden font-sans">
      {/* PANEL LATERAL DE CONTROL */}
      <div className="w-96 bg-gray-900/95 p-5 flex flex-col gap-4 z-10 shadow-2xl overflow-y-auto border-r border-gray-800">
        {/* Encabezado */}
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-600">
            AuraHex
          </h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Plataforma de Armonización Satelital H3
          </p>

          <div className="mt-3 flex items-center justify-between bg-gray-800/70 px-3 py-2 rounded-lg border border-gray-700/60">
            {dataError ? (
              <span role="status" className="text-xs font-semibold text-orange-300">Datos no disponibles</span>
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
        </div>

        {/* Selector de Mapa Base */}
        <div>
          <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">
            Estilo del Mapa Base
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(BASEMAPS).map(([key, item]) => (
              <button
                key={key}
                onClick={() => setMapTheme(key)}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all border ${
                  mapTheme === key
                    ? "bg-orange-600/20 border-orange-500 text-orange-300"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                }`}
              >
                {key === "DARK" ? "🌑 " : "🛰️ "}
                {item.name}
              </button>
            ))}
          </div>
        </div>

        {/* Motor de Zoom Semántico H3 */}
        <div className="bg-gray-800/90 p-3.5 rounded-xl border border-gray-700">
          <div className="flex justify-between items-center mb-1.5">
            <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider">
              Zoom Semántico H3
            </h3>
            {isRecalculating && (
              <span className="text-[11px] text-orange-400 animate-pulse font-bold">
                🔄 Recalculando...
              </span>
            )}
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-300">Zoom de Cámara:</span>
            <span className="font-mono font-bold text-blue-400">
              {cameraZoom.toFixed(1)}x
            </span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-gray-300">Resolución Activa:</span>
            <span className="font-mono font-bold text-orange-400">
              Nivel {h3Resolution}
            </span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-gray-700/70 flex justify-between text-xs text-gray-400">
            <span>Área por hexágono:</span>
            <span className="font-mono text-gray-200">
              {H3_SCALE_INFO[h3Resolution]}
            </span>
          </div>
        </div>

        {/* Línea de Tiempo (Time-Lapse 7 días) */}
        <div className="bg-gray-800/90 p-3.5 rounded-xl border border-gray-700">
          <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2.5">
            Evolución Temporal (7 Días)
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="bg-orange-600 hover:bg-orange-500 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors shrink-0 shadow-lg"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <div className="flex-1">
              <div className="text-base font-bold text-orange-300 font-mono">
                {uniqueDates[currentDateIndex] || "Cargando..."}
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
          <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">
            Constelación Satelital (3 Fuentes)
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() =>
                setActiveSats({ ...activeSats, MODIS: !activeSats.MODIS })
              }
              className={`px-2 py-2 rounded-lg text-[11px] font-bold transition-colors ${
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
              className={`px-2 py-2 rounded-lg text-[11px] font-bold transition-colors ${
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
              className={`px-2 py-2 rounded-lg text-[11px] font-bold transition-colors ${
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
          <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">
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
              className={`flex justify-between items-center px-3 py-2 rounded-lg text-xs transition-colors border ${
                activeThreats.EXTREMO
                  ? "border-red-500 bg-red-500/20 text-red-300"
                  : "border-gray-800 bg-gray-800/40 text-gray-500"
              }`}
            >
              <span className="font-bold">Extremo ({">"}150 MW)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            </button>
            <button
              onClick={() =>
                setActiveThreats({
                  ...activeThreats,
                  ALTO: !activeThreats.ALTO,
                })
              }
              className={`flex justify-between items-center px-3 py-2 rounded-lg text-xs transition-colors border ${
                activeThreats.ALTO
                  ? "border-orange-500 bg-orange-500/20 text-orange-300"
                  : "border-gray-800 bg-gray-800/40 text-gray-500"
              }`}
            >
              <span className="font-bold">Alto (50–150 MW)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
            </button>
            <button
              onClick={() =>
                setActiveThreats({
                  ...activeThreats,
                  MODERADO: !activeThreats.MODERADO,
                })
              }
              className={`flex justify-between items-center px-3 py-2 rounded-lg text-xs transition-colors border ${
                activeThreats.MODERADO
                  ? "border-yellow-500 bg-yellow-500/20 text-yellow-300"
                  : "border-gray-800 bg-gray-800/40 text-gray-500"
              }`}
            >
              <span className="font-bold">Moderado ({"<"}50 MW)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
            </button>
          </div>
        </div>

        {/* Gráfica de Distribución */}
        <div className="bg-gray-800/90 p-3 rounded-xl border border-gray-700">
          <h3 className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">
            Distribución de Severidad
          </h3>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={48}
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

        <div className="mt-auto pt-2">
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
