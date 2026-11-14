import os
import json
import pandas as pd
import h3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def process_fire_data(csv_filename="real_fires.csv", resolution=6):
    csv_path = os.path.join(BASE_DIR, csv_filename)
    if not os.path.exists(csv_path):
        print(f"⚠️ No se encontró el archivo {csv_path}")
        return []

    print(f"🔥 Iniciando procesamiento de datos: {csv_filename} (Resolución H3: {resolution})")
    
    # 1. Cargar datos crudos
    df = pd.read_csv(csv_path)
    
    # --- MÓDULO DE LIMPIEZA ROBUSTO (Data Cleaning) ---
    df = df.dropna(subset=['latitude', 'longitude'])
    
    # Normalizar el identificador de satélite para distinguir MODIS, NOAA-20 y NOAA-21
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
    # --------------------------------------------------
    
    # 2. Asignar el índice Hexagonal H3 a cada coordenada GPS
    df['h3_index'] = df.apply(lambda row: h3.latlng_to_cell(row['latitude'], row['longitude'], resolution), axis=1)
    
    # 3. Agrupación espacial y temporal (Spatial Binning)
    harmonized_df = df.groupby(['h3_index', 'acq_date']).agg(
        total_frp=('frp', 'sum'),
        avg_confidence=('confidence', 'mean'),
        avg_brightness=('brightness', 'mean'),
        point_count=('latitude', 'count'),
        instruments=('instrument', lambda x: ', '.join(set(x.dropna().astype(str))))
    ).reset_index()
    
    print(f"✅ Puntos armonizados en hexágonos: {len(harmonized_df)}")
    
    return harmonized_df.to_dict(orient='records')

if __name__ == "__main__":
    data = process_fire_data("real_fires.csv", resolution=6)
    if data:
        print("\n🚀 Ejemplo del primer hexágono procesado:")
        print(json.dumps(data[0], indent=2))