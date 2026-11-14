from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from core_etl import process_fire_data
from download_data import download_and_merge_firms

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\n⏰ Arrancando Motor de Automatización (Cron)...")
    
    # Descarga inicial al arrancar la API
    download_and_merge_firms()
    
    # Programar actualización automática cada 24 horas
    scheduler = BackgroundScheduler()
    scheduler.add_job(download_and_merge_firms, 'interval', hours=24)
    scheduler.start()
    print("✅ Cron activado: Descargas satelitales programadas cada 24 horas.\n")
    
    yield
    
    scheduler.shutdown()
    print("🛑 Motor de automatización detenido.")

app = FastAPI(
    title="AuraHex API",
    description="Motor de datos espaciales para NASA Space Apps",
    lifespan=lifespan
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"mensaje": "🔥 API de AuraHex funcionando correctamente. Lista para el hackathon."}

@app.get("/api/fires/harmonized")
def get_harmonized_fires(resolution: int = 6):
    return process_fire_data("real_fires.csv", resolution)