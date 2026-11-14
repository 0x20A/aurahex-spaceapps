import React, { useState, useEffect, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import Map from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

const INITIAL_VIEW_STATE = {
  longitude: -100.3,
  latitude: 25.5,
  zoom: 5,
  pitch: 45,
  bearing: 0,
};

// Mapa base oscuro de Esri (Sin marca de agua)
const MAP_STYLE = {
  version: 8,
  sources: {
    esri_dark: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri, HERE, Garmin, FAO, NOAA, USGS | MapLibre",
    },
  },
  layers: [
    {
      id: "esri-dark-layer",
      type: "raster",
      source: "esri_dark",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

function App() {
  const [fireData, setFireData] = useState([]);
  const [hoverInfo, setHoverInfo] = useState(null);

  // Estados para los filtros
  const [activeSats, setActiveSats] = useState({ MODIS: true, VIIRS: true });
  const [activeThreats, setActiveThreats] = useState({
    EXTREMO: true,
    ALTO: true,
    MODERADO: true,
  });

  // Estados para el motor de tiempo
  const [uniqueDates, setUniqueDates] = useState([]);
  const [currentDateIndex, setCurrentDateIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    fetch("http://localhost:8000/api/fires/harmonized")
      .then((response) => response.json())
      .then((data) => {
        setFireData(data);
        // Extraer fechas únicas y ordenarlas para la línea de tiempo
        const dates = [...new Set(data.map((d) => d.acq_date))].sort();
        setUniqueDates(dates);
        setCurrentDateIndex(dates.length - 1); // Empezar en el día más reciente
      })
      .catch((error) => console.error("Error al conectar con la API:", error));
  }, []);

  // Efecto para controlar la reproducción automática (Time-Lapse)
  useEffect(() => {
    let interval;
    if (isPlaying && uniqueDates.length > 0) {
      interval = setInterval(() => {
        setCurrentDateIndex((prev) => {
          if (prev >= uniqueDates.length - 1) return 0; // Reiniciar al inicio
          return prev + 1;
        });
      }, 1500); // 1.5 segundos por día
    }
    return () => clearInterval(interval);
  }, [isPlaying, uniqueDates]);

  // MOTOR DE FILTRADO ESPACIAL + TEMPORAL
  const filteredData = useMemo(() => {
    return fireData.filter((d) => {
      // 1. Filtro Satelital (Soporta las letras crudas de la NASA)
      const instrumentsStr = String(d.instruments).toUpperCase();
      const hasModis =
        instrumentsStr.includes("T") ||
        instrumentsStr.includes("A") ||
        instrumentsStr.includes("MODIS");
      const hasViirs =
        instrumentsStr.includes("N") ||
        instrumentsStr.includes("1") ||
        instrumentsStr.includes("VIIRS");

      let satMatch = false;
      if (activeSats.MODIS && activeSats.VIIRS) satMatch = true;
      else if (activeSats.MODIS && !activeSats.VIIRS) satMatch = hasModis;
      else if (!activeSats.MODIS && activeSats.VIIRS) satMatch = hasViirs;

      // 2. Filtro de Amenaza
      const isExtremo = d.total_frp > 150;
      const isAlto = d.total_frp > 50 && d.total_frp <= 150;
      const isModerado = d.total_frp <= 50;

      let threatMatch = false;
      if (activeThreats.EXTREMO && isExtremo) threatMatch = true;
      if (activeThreats.ALTO && isAlto) threatMatch = true;
      if (activeThreats.MODERADO && isModerado) threatMatch = true;

      // 3. Filtro de Tiempo
      const currentDate = uniqueDates[currentDateIndex];
      const dateMatch = currentDate ? d.acq_date === currentDate : true;

      return satMatch && threatMatch && dateMatch;
    });
  }, [fireData, activeSats, activeThreats, uniqueDates, currentDateIndex]);

  // MOTOR ESTADÍSTICO PARA LA GRÁFICA (Dinámico)
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
    ].filter((d) => d.value > 0);
  }, [filteredData]);

  const layers = [
    new H3HexagonLayer({
      id: "h3-fire-layer",
      data: filteredData,
      pickable: true,
      extruded: true,
      elevationScale: 50,
      getHexagon: (d) => d.h3_index,
      getFillColor: (d) => [255, Math.max(0, 255 - d.total_frp * 2), 0, 200],
      getElevation: (d) => d.total_frp,
      autoHighlight: true,
      onHover: (info) => setHoverInfo(info),
      updateTriggers: {
        getFillColor: [filteredData],
        getElevation: [filteredData],
      },
      transitions: {
        getElevation: 500,
        getFillColor: 500,
      },
    }),
  ];

  const toggleSat = (sat) =>
    setActiveSats((prev) => ({ ...prev, [sat]: !prev[sat] }));
  const toggleThreat = (threat) =>
    setActiveThreats((prev) => ({ ...prev, [threat]: !prev[threat] }));

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
    .panel-scroll::-webkit-scrollbar { width: 6px; }
    .panel-scroll::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.5); border-radius: 10px; }
    .panel-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }
    .panel-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
    
    /* Estilizar el slider de tiempo */
    input[type=range] { -webkit-appearance: none; background: transparent; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: #3b82f6; cursor: pointer; margin-top: -6px; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5); }
    input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 4px; cursor: pointer; background: #334155; border-radius: 2px; }
  `}</style>

      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
      >
        <Map mapLib={maplibregl} mapStyle={MAP_STYLE} />
      </DeckGL>

      {/* PANEL LATERAL */}
      <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md p-5 rounded-2xl border border-slate-700 shadow-2xl text-slate-200 z-10 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto panel-scroll flex flex-col">
        <div>
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-600 mb-1">
            AuraHex
          </h1>
          <p className="text-xs text-slate-400 mb-4">
            Inteligencia Espacial de Incendios
          </p>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-green-500 tracking-widest">
              API SINCRONIZADA
            </span>
          </div>
          <div className="border-t border-slate-700 pt-4 mb-4">
            <p className="text-xs text-slate-400 mb-1">
              Focos activos (Día actual):
            </p>
            <p className="text-3xl font-mono font-bold text-white">
              {filteredData.length}
            </p>
          </div>
        </div>

        {chartData.length > 0 && (
          <div className="h-48 w-full mb-4 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                  itemStyle={{ color: "#fff" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-2 pt-4 border-t border-slate-700 shrink-0">
          <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-bold">
            Filtro Satelital
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => toggleSat("MODIS")}
              className={`flex-1 py-2 px-3 rounded text-xs font-bold border transition-all ${activeSats.MODIS ? "bg-blue-900/50 border-blue-500 text-blue-300" : "bg-slate-800 border-slate-600 text-slate-500"}`}
            >
              MODIS
            </button>
            <button
              onClick={() => toggleSat("VIIRS")}
              className={`flex-1 py-2 px-3 rounded text-xs font-bold border transition-all ${activeSats.VIIRS ? "bg-purple-900/50 border-purple-500 text-purple-300" : "bg-slate-800 border-slate-600 text-slate-500"}`}
            >
              VIIRS
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-700 shrink-0 pb-2">
          <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-bold">
            Nivel de Amenaza (FRP)
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => toggleThreat("EXTREMO")}
              className={`w-full py-2 px-3 rounded text-xs font-bold border transition-all text-left flex justify-between items-center ${activeThreats.EXTREMO ? "bg-red-900/40 border-red-500 text-red-400" : "bg-slate-800 border-slate-600 text-slate-500"}`}
            >
              <span>🔴 EXTREMO</span>
              <span className="text-[10px] font-normal">(&gt; 150 MW)</span>
            </button>
            <button
              onClick={() => toggleThreat("ALTO")}
              className={`w-full py-2 px-3 rounded text-xs font-bold border transition-all text-left flex justify-between items-center ${activeThreats.ALTO ? "bg-orange-900/40 border-orange-500 text-orange-400" : "bg-slate-800 border-slate-600 text-slate-500"}`}
            >
              <span>🟠 ALTO</span>
              <span className="text-[10px] font-normal">(50 - 150 MW)</span>
            </button>
            <button
              onClick={() => toggleThreat("MODERADO")}
              className={`w-full py-2 px-3 rounded text-xs font-bold border transition-all text-left flex justify-between items-center ${activeThreats.MODERADO ? "bg-yellow-900/40 border-yellow-500 text-yellow-400" : "bg-slate-800 border-slate-600 text-slate-500"}`}
            >
              <span>🟡 MODERADO</span>
              <span className="text-[10px] font-normal">(&lt; 50 MW)</span>
            </button>
          </div>
        </div>
      </div>

      {/* REPRODUCTOR DE TIEMPO (BOTTOM BAR) */}
      {uniqueDates.length > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[600px] max-w-[90vw] bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl z-10 flex flex-col gap-3">
          <div className="flex justify-between items-center px-2">
            <span className="text-xs font-bold text-slate-400 tracking-widest uppercase">
              Time-Lapse Analítico
            </span>
            <span className="font-mono text-lg font-bold text-blue-400">
              {uniqueDates[currentDateIndex]}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg shadow-blue-500/30"
            >
              {isPlaying ? (
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 ml-1"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>

            <input
              type="range"
              min="0"
              max={uniqueDates.length - 1}
              value={currentDateIndex}
              onChange={(e) => {
                setCurrentDateIndex(parseInt(e.target.value));
                setIsPlaying(false); // Pausar si el usuario arrastra manualmente
              }}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* TOOLTIP FLOTANTE */}
      {hoverInfo && hoverInfo.object && (
        <div
          className="absolute z-50 pointer-events-none bg-slate-900/95 backdrop-blur-md p-4 rounded-xl border border-slate-600 shadow-2xl text-slate-200"
          style={{
            left: hoverInfo.x + 20,
            top: hoverInfo.y + 20,
            minWidth: "280px",
          }}
        >
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-700">
            <h3 className="text-orange-400 font-bold flex items-center gap-2">
              <span>🔥</span> Análisis H3
            </h3>
            <span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 font-mono">
              ID: {hoverInfo.object.h3_index.slice(0, 7)}...
            </span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Energía Radiativa (FRP):</span>
              <span className="font-mono font-bold text-white">
                {hoverInfo.object.total_frp.toFixed(1)} MW
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Temperatura (Est.):</span>
              <span className="font-mono text-orange-300">
                {(hoverInfo.object.avg_brightness - 273.15).toFixed(1)} °C
              </span>
            </div>
            <div className="flex justify-between mt-2 pt-2 border-t border-slate-700/50">
              <span className="text-slate-400">Firmas satelitales:</span>
              <span className="font-mono font-semibold text-blue-300">
                {String(hoverInfo.object.instruments)
                  .replace(/T|A/g, "MODIS")
                  .replace(/N|1/g, "VIIRS")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
