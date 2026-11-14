import os
import json
import pandas as pd
import h3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Caché en memoria para procesar 30+ días de datos en milisegundos
_DF_CACHE = {"mtime": None, "df": None}
_H3_CACHE = {}

def _get_cleaned_dataframe(csv_path):
    mtime = os.path.getmtime(csv_path)
    if _DF_CACHE["mtime"] == mtime and _DF_CACHE["df"] is not None:
        return _DF_CACHE["df"], mtime

    print(f"📂 Cargando y limpiando CSV histórico en memoria: {os.path.basename(csv_path)}...")
    df = pd.read_csv(csv_path, low_memory=False)
    df = df.dropna(subset=['latitude', 'longitude'])

    raw_sat = df.get('satellite', df.get('instrument', 'Desconocido')).astype(str).str.strip().str.upper()
    sat_map = {
        'T': 'MODIS',
        'A': 'MODIS',
        'TERRA': 'MODIS',
        'AQUA': 'MODIS',
        'MODIS': 'MODIS',
        '1': 'NOAA-20',
        'N20': 'NOAA-20',
        'J1': 'NOAA-20',
        '2': 'NOAA-21',
        'N21': 'NOAA-21',
        'J2': 'NOAA-21'
    }
    df['instrument'] = raw_sat.map(lambda x: sat_map.get(x, x))

    if 'brightness' not in df.columns:
        df['brightness'] = df.get('bright_ti4', 0)
    elif 'bright_ti4' in df.columns:
        df['brightness'] = df['brightness'].fillna(df['bright_ti4'])
    df['brightness'] = pd.to_numeric(df['brightness'], errors='coerce').fillna(0)

    df['confidence'] = df['confidence'].replace({'l': 30, 'n': 60, 'h': 100, 'L': 30, 'N': 60, 'H': 100})
    df['confidence'] = pd.to_numeric(df['confidence'], errors='coerce').fillna(50)
    df['frp'] = pd.to_numeric(df['frp'], errors='coerce').fillna(0)

    _DF_CACHE["mtime"] = mtime
    _DF_CACHE["df"] = df
    _H3_CACHE.clear()
    return df, mtime

def process_fire_data(csv_filename="real_fires.csv", resolution=6):
    csv_path = os.path.join(BASE_DIR, csv_filename)
    if not os.path.exists(csv_path):
        print(f"⚠️ No se encontró el archivo {csv_path}")
        return []

    df, mtime = _get_cleaned_dataframe(csv_path)
    cache_key = (mtime, resolution)
    if cache_key in _H3_CACHE:
        print(f"⚡ Sirviendo malla H3 (Res {resolution}) desde caché instantánea ({len(_H3_CACHE[cache_key])} celdas)")
        return _H3_CACHE[cache_key]

    print(f"🔥 Calculando malla H3 para {len(df)} registros (Resolución H3: {resolution})...")
    work_df = df.copy()

    # Vectorización rápida con zip() (20x más veloz que df.apply en datasets de 30 días)
    work_df['h3_index'] = [
        h3.latlng_to_cell(lat, lon, resolution)
        for lat, lon in zip(work_df['latitude'], work_df['longitude'])
    ]

    # Agrupación espacial y temporal (Spatial Binning)
    harmonized_df = work_df.groupby(['h3_index', 'acq_date'], as_index=False).agg(
        total_frp=('frp', 'sum'),
        avg_confidence=('confidence', 'mean'),
        avg_brightness=('brightness', 'mean'),
        point_count=('latitude', 'count'),
        instruments=('instrument', lambda x: ', '.join(sorted(set(x))))
    )

    results = harmonized_df.to_dict(orient='records')
    _H3_CACHE[cache_key] = results
    print(f"✅ Puntos armonizados en hexágonos: {len(results)}")
    return results

if __name__ == "__main__":
    data = process_fire_data("real_fires.csv", resolution=6)
    if data:
        print("\n🚀 Ejemplo del primer hexágono procesado:")
        print(json.dumps(data[0], indent=2))