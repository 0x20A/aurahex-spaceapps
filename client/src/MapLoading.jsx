import './map-loading.css'

export default function MapLoading() {
  return (
    <div className="map-loading">
      <div className="map-loading-content" role="status">
        <img className="map-loading-brand" src="/aurahex-logo.svg" alt="AuraHex" width="1242" height="311" />
        <span>Cargando mapa…</span>
      </div>
    </div>
  )
}
