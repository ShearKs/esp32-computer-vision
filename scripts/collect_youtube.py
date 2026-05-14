# scripts/collect_youtube.py
import yt_dlp
import cv2
import os
from pathlib import Path
import hashlib
from PIL import Image

class SmartYouTubeCollector:
    def __init__(self, output_dir: str = "dataset/youtube_raw"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    def download_videos(self, queries: list[str], max_per_query: int = 10):
        """Descarga vídeos de múltiples búsquedas"""
        for query in queries:
            print(f"\n🔍 Buscando: '{query}'")
            
            ydl_opts = {
               'format': 'best[height>=480][height<=720]/best',
                'outtmpl': str(self.output_dir / f"{query.replace(' ', '_')}_%(id)s.%(ext)s"),
                'quiet': True,
                'no_warnings': True,
            }
            
            # Buscar y descargar
            search_url = f"ytsearch{max_per_query}:{query}"
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([search_url])
        
        print(f"Descargas completadas en {self.output_dir}")
    
    def extract_frames_smart(self, interval_sec: float = 2.0, min_quality: int = 480):
        """Extrae frames evitando duplicados y baja calidad"""
        videos = list(self.output_dir.glob("*.mp4")) + list(self.output_dir.glob("*.webm"))
        
        frames_dir = self.output_dir.parent / "frames"
        frames_dir.mkdir(exist_ok=True)
        
        total_frames = 0
        seen_hashes = set()  # Para evitar duplicados
        
        for video_path in videos:
            print(f"\nProcesando: {video_path.name}")
            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_interval = int(fps * interval_sec)
            
            frame_count = 0
            saved = 0
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Saltar frames
                if frame_count % frame_interval == 0:
                    # Verificar calidad
                    if frame.shape[0] < min_quality:
                        frame_count += 1
                        continue
                    
                    # Calcular hash para evitar duplicados
                    img_hash = hashlib.md5(cv2.imencode('.jpg', frame)[1]).hexdigest()
                    
                    if img_hash not in seen_hashes:
                        seen_hashes.add(img_hash)
                        
                        # Guardar
                        filepath = frames_dir / f"frame_{total_frames:05d}.jpg"
                        cv2.imwrite(str(filepath), frame)
                        saved += 1
                        total_frames += 1
                
                frame_count += 1
            
            cap.release()
            print(f"  ✓ {saved} frames extraídos")
        
        print(f"\nTotal: {total_frames} frames únicos guardados")
        return total_frames

# Uso:
queries = [
    "human legs walking",
    "person legs standing", 
    "feet walking indoor",
    "legs sitting",
    "robot navigating legs"
]

collector = SmartYouTubeCollector()
collector.download_videos(queries, max_per_query=8)
collector.extract_frames_smart(interval_sec=2.0)