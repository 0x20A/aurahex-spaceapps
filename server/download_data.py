import os
from datetime import datetime, timedelta, timezone
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Bounding box de Norteamérica y México: [Oeste, Sur, Este, Norte]
BBOX = "-130,10,-60,50"


def load_env_file():
    """Lee variables de server/.env si existe, sin requerir librerías extra."""
    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))
        return True
    return False


def download_via_area_api(map_key: str, total_days: int = 30):
    """Descarga hasta N días en bloques de 5 días usando la API oficial de área de FIRMS."""
    sources = {
        "MODIS (Terra y Aqua)": "MODIS_NRT",
        "VIIRS (NOAA-20)": "VIIRS_NOAA20_NRT",
        "VIIRS (NOAA-21)": "VIIRS_NOAA21_NRT",
    }

    dataframes = []
    now_utc = datetime.now(timezone.utc)

    for label, source_code in sources.items():
        print(f"⬇️ Descargando {total_days} días de {label} vía API FIRMS...")
        sat_dfs = []

        # La API de área permite máximo 5 días por petición, avanzando desde la fecha inicial
        for offset in range(total_days, 0, -5):
            chunk_days = min(5, offset)
            start_date = (now_utc - timedelta(days=offset - 1)).strftime("%Y-%m-%d")
            url = (
                f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
                f"{map_key}/{source_code}/{BBOX}/{chunk_days}/{start_date}"
            )
            try:
                df_chunk = pd.read_csv(url)
                if not df_chunk.empty and "latitude" in df_chunk.columns:
                    sat_dfs.append(df_chunk)
            except Exception as e:
                print(f"   ⚠️ Error en bloque {start_date} ({chunk_days}d): {e}")

        if sat_dfs:
            merged_sat = pd.concat(sat_dfs, ignore_index=True)
            print(f"✅ {label}: {len(merged_sat)} focos obtenidos.")
            dataframes.append(merged_sat)

    return dataframes


def download_via_public_7d():
    """Fallback gratuito sin MAP_KEY (últimos 7 días globales recortados a Norteamérica)."""
    urls = {
        "MODIS (Terra y Aqua)": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_7d.csv",
        "VIIRS (NOAA-20)": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_7d.csv",
        "VIIRS (NOAA-21)": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_7d.csv",
    }

    dataframes = []
    for satellite, url in urls.items():
        print(f"⬇️ Descargando últimos 7 días públicos de {satellite}...")
        try:
            df = pd.read_csv(url)
            df = df[
                (df["latitude"] >= 10)
                & (df["latitude"] <= 50)
                & (df["longitude"] >= -130)
                & (df["longitude"] <= -60)
            ]
            print(f"✅ {satellite}: {len(df)} focos detectados en nuestra región.")
            dataframes.append(df)
        except Exception as e:
            print(f"❌ Error descargando {satellite}: {e}")

    return dataframes


def download_and_merge_firms():
    env_found = load_env_file()
    
    # 🧹 LIMPIEZA BLINDADA: Quitamos cualquier espacio en blanco o comilla accidental
    raw_key = os.getenv("FIRMS_MAP_KEY", "")
    map_key = raw_key.replace(" ", "").replace('"', "").replace("'", "").strip()
    
    total_days = int(os.getenv("FIRMS_DAYS", "30"))

    if not env_found:
        print("ℹ️ No se encontró el archivo 'server/.env'.")
    elif not map_key or "PEGA_TU_CLAVE" in map_key:
        print("⚠️ Se encontró 'server/.env', pero falta pegar tu FIRMS_MAP_KEY real.")

    if map_key and "PEGA_TU_CLAVE" not in map_key:
        print(f"🔑 MAP_KEY detectada. Conectando con NASA FIRMS Area API ({total_days} días)...")
        dataframes = download_via_area_api(map_key, total_days=total_days)
    else:
        print("🌍 Usando descarga pública de 7 días + acumulación local...")
        dataframes = download_via_public_7d()

    if not dataframes:
        print("⚠️ No se pudieron descargar nuevos datos.")
        return

    new_df = pd.concat(dataframes, ignore_index=True)
    output_file = os.path.join(BASE_DIR, "real_fires.csv")

    # Conservar histórico previo en disco para nunca perder días ya descargados
    if os.path.exists(output_file):
        try:
            old_df = pd.read_csv(output_file)
            combined_df = pd.concat([old_df, new_df], ignore_index=True)
            dedup_cols = [c for c in ["latitude", "longitude", "acq_date", "acq_time", "satellite"] if c in combined_df.columns]
            if dedup_cols:
                combined_df = combined_df.drop_duplicates(subset=dedup_cols, keep="last")
        except Exception:
            combined_df = new_df
    else:
        combined_df = new_df

    combined_df.to_csv(output_file, index=False)
    unique_days = combined_df["acq_date"].nunique() if "acq_date" in combined_df.columns else "?"
    print(f"🚀 ¡Éxito! 'real_fires.csv' actualizado con {len(combined_df)} registros ({unique_days} días únicos).")


if __name__ == "__main__":
    download_and_merge_firms()