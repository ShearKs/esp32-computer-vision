// src/components/VideoStream.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IonCard, IonSpinner, IonBadge, IonIcon } from '@ionic/react';
import { alertCircleOutline, refresh } from 'ionicons/icons';
import { ApiService } from '../services/api';
import './VideoStream.css';

export const VideoStream: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Usar el proxy del backend en vez de conectar directamente al ESP32.
  // Esto evita problemas de CORS y funciona en Android nativo.
  const rawStreamUrl = `${ApiService.getBaseUrl()}/api/stream/raw`;
  const [currentUrl, setCurrentUrl] = useState(rawStreamUrl);

  useEffect(() => {
    setCurrentUrl(rawStreamUrl);
    setStatus('loading');
    setRetryCount(0);
  }, [rawStreamUrl]);

  // Fallback: si onLoad no dispara pero la imagen tiene contenido, forzar 'connected'
  useEffect(() => {
    if (status !== 'loading') return;

    loadTimeoutRef.current = setTimeout(() => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        console.log('VideoStream: onLoad no disparó, pero la imagen tiene contenido → connected');
        setStatus('connected');
      }
    }, 5000);

    const pollInterval = setInterval(() => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        console.log('VideoStream: imagen detectada via polling → connected');
        setStatus('connected');
        clearInterval(pollInterval);
      }
    }, 1500);

    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      clearInterval(pollInterval);
    };
  }, [status, currentUrl]);

  const handleLoad = useCallback(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    setStatus('connected');
  }, []);

  const handleError = useCallback(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    if (retryCount < 10) {
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setCurrentUrl(`${rawStreamUrl}?_retry=${Date.now()}`);
      }, 1500);
    } else {
      setStatus('error');
    }
  }, [retryCount, rawStreamUrl]);

  const handleRetry = () => {
    setRetryCount(0);
    setCurrentUrl(`${rawStreamUrl}?_retry=${Date.now()}`);
    setStatus('loading');
  };

  return (
    <IonCard className="video-card">
      <div className="video-header">
        <span className="video-title">📹 Stream en Vivo</span>
        {status === 'connected' && <IonBadge color="success" className="live-badge">LIVE</IonBadge>}
      </div>

      <div className="video-container">
        {status === 'loading' && (
          <div className="overlay loading-overlay">
            <IonSpinner name="crescent" />
            <p>{retryCount > 0 ? `Reintentando... (${retryCount}/10)` : 'Conectando...'}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="overlay error-overlay">
            <IonIcon icon={alertCircleOutline} className="error-icon" />
            <p>Error de conexión</p>
            <small>Verifica la IP y que la cámara esté encendida</small>
            <IonIcon 
              icon={refresh} 
              onClick={handleRetry}
              style={{ cursor: 'pointer', marginTop: 8, fontSize: 20 }}
            />
          </div>
        )}

        <img
          ref={imgRef}
          src={currentUrl}
          alt="Camera Stream"
          className="stream-img"
          onLoad={handleLoad}
          onError={handleError}
          style={{ display: status === 'connected' ? 'block' : 'none' }}
        />
      </div>
    </IonCard>
  );
};
