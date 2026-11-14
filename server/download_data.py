import os
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def download_and_merge_firms():
    print("🌍 Conectando con los satélites de NASA FIRMS (Últimos 7 días)...")
    
    urls = {
        "MODIS (Terra y Aqua)": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_7d.csv",
        "VIIRS (NOAA-20)": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_7d.csv",
        "VIIRS (NOAA-21)": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_7d.csv"
    }
    
    dataframes = []
    
    for satellite, url in urls.items():
        print(f"⬇️ Descargando datos de {satellite}...")
        try:
            df = pd.read_csv(url)
            
            # Filtro Geográfico: Recortar región de Norteamérica y México
            df = df[(df['latitude'] >= 10) & (df['latitude'] <= 50) & 
                    (df['longitude'] >= -130) & (df['longitude'] <= -60)]
            
            print(f"✅ {satellite}: {len(df)} focos detectados en nuestra región.")
            dataframes.append(df)
        except Exception as e:
            print(f"❌ Error descargando {satellite}: {e}")
            
    if dataframes:
        combined_df = pd.concat(dataframes, ignore_index=True)
        output_file = os.path.join(BASE_DIR, "real_fires.csv")
        combined_df.to_csv(output_file, index=False)
        print(f"🚀 ¡Éxito! Archivo 'real_fires.csv' guardado con {len(combined_df)} registros totales.")
    else:
        print("⚠️ No se pudieron descargar los datos.")

if __name__ == "__main__":
    download_and_merge_firms()