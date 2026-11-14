import './map-loading.css'

export default function MapLoading() {
  return (
    <div className="map-loading">
      <div className="map-loading-content" role="status">
        <span className="map-loading-brand">AuraHex</span>
        <span>Cargando mapa…</span>
      </div>
    </div>
  )
}
