// src/components/DetectionStream.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IonCard, IonSpinner, IonBadge, IonIcon } from '@ionic/react';
import { alertCircleOutline, refresh } from 'ionicons/icons';
import { ApiService } from '../services/api';
import './DetectionStream.css';

interface DetectionStreamProps {
  confidence?: number;
}

export const DetectionStream: React.FC<DetectionStreamProps> = ({ confidence }) => {
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);

  const streamUrl = ApiService.getYoloStreamUrl(confidence);

  // Un solo URL estable — NO añadir cache busters que crean múltiples conexiones backend
  const [currentUrl, setCurrentUrl] = useState('');

  // Cuando la URL base cambia (nuevo backend, nueva confianza), resetear
  useEffect(() => {
    setCurrentUrl(streamUrl);
    setStatus('loading');
    setRetryCount(0);
  }, [streamUrl]);

  // Cleanup al desmontar
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, []);

  // Polling: detectar cuando la imagen tiene contenido (onLoad no siempre dispara en MJPEG)
  useEffect(() => {
    if (status !== 'loading') return;

    // Polling cada 1.5s — si la imagen ya tiene pixeles, marcar como conectado
    const pollInterval = setInterval(() => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        console.log('DetectionStream: imagen detectada → connected');
        if (mountedRef.current) setStatus('connected');
        clearInterval(pollInterval);
      }
    }, 1500);

    // Timeout: si tras 12s no hay imagen, marcar error
    loadTimeoutRef.current = setTimeout(() => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        if (mountedRef.current) setStatus('connected');
      } else if (mountedRef.current && status === 'loading') {
        // Solo marcar error si seguimos en loading y no hubo retries
        if (retryCount >= 2) {
          setStatus('error');
        }
      }
    }, 12000);

    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      clearInterval(pollInterval);
    };
  }, [status, currentUrl]);

  const handleLoad = useCallback(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    if (mountedRef.current) setStatus('connected');
  }, []);

  const handleError = useCallback(() => {
    if (!mountedRef.current) return;
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);

    if (retryCount < 5) {
      // Reintento silencioso: recargar la misma URL SIN cache-buster
      // Esto reutiliza el endpoint del backend en vez de crear conexiones nuevas
      const delay = Math.min(2000 + retryCount * 1000, 5000);
      setTimeout(() => {
        if (!mountedRef.current) return;
        setRetryCount(prev => prev + 1);
        setStatus('loading');
        // Forzar re-render de la img quitando y poniendo la URL
        setCurrentUrl('');
        requestAnimationFrame(() => {
          if (mountedRef.current) setCurrentUrl(streamUrl);
        });
      }, delay);
    } else {
      setStatus('error');
    }
  }, [retryCount, streamUrl]);

  const handleRetry = () => {
    setRetryCount(0);
    setStatus('loading');
    // Forzar reconexión backend antes de reintentar
    ApiService.reconnect().then(() => {
      setTimeout(() => {
        if (mountedRef.current) {
          setCurrentUrl('');
          requestAnimationFrame(() => {
            if (mountedRef.current) setCurrentUrl(streamUrl);
          });
        }
      }, 800);
    });
  };

  return (
    <IonCard className="detection-card">
      <div className="detection-header">
        <span className="detection-title">📹 Stream en Vivo</span>
        <div className="header-badges">
          {status === 'connected' && (
            <IonBadge color="danger" className="yolo-badge">
              <span className="pulse-dot"></span>
              AI LIVE
            </IonBadge>
          )}
        </div>
      </div>

      <div className="detection-video-container">
        {status === 'loading' && (
          <div className="detection-overlay loading-overlay">
            <IonSpinner name="crescent" />
            <p>{retryCount > 0 ? `Reintentando... (${retryCount}/5)` : 'Cargando modelo YOLO...'}</p>
            <small>Esto puede tardar unos segundos</small>
          </div>
        )}

        {status === 'error' && (
          <div className="detection-overlay error-overlay">
            <IonIcon icon={alertCircleOutline} className="error-icon" />
            <p>No se pudo cargar el stream YOLO</p>
            <small>Verifica que el backend y la cámara estén funcionando</small>
            <IonIcon 
              icon={refresh} 
              onClick={handleRetry}
              className="retry-icon"
            />
          </div>
        )}

        {currentUrl && (
          <img
            ref={imgRef}
            src={currentUrl}
            alt="YOLO Detection Stream"
            className="detection-stream-img"
            crossOrigin="anonymous"
            onLoad={handleLoad}
            onError={handleError}
            style={{ display: status === 'connected' ? 'block' : 'none' }}
          />
        )}
      </div>
    </IonCard>
  );
};
