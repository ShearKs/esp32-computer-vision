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
  const mountedRef = useRef(true);

  const rawStreamUrl = `${ApiService.getBaseUrl()}/api/stream/raw`;
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    setCurrentUrl(rawStreamUrl);
    setStatus('loading');
    setRetryCount(0);
  }, [rawStreamUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, []);

  // Polling: detectar cuando la imagen tiene contenido
  useEffect(() => {
    if (status !== 'loading') return;

    const pollInterval = setInterval(() => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        console.log('VideoStream: imagen detectada → connected');
        if (mountedRef.current) setStatus('connected');
        clearInterval(pollInterval);
      }
    }, 1500);

    loadTimeoutRef.current = setTimeout(() => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        if (mountedRef.current) setStatus('connected');
      } else if (mountedRef.current && status === 'loading' && retryCount >= 3) {
        setStatus('error');
      }
    }, 10000);

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
      // Reintento SIN cache-buster — reutiliza la misma URL estable
      const delay = Math.min(2000 + retryCount * 1000, 5000);
      setTimeout(() => {
        if (!mountedRef.current) return;
        setRetryCount(prev => prev + 1);
        setStatus('loading');
        // Forzar re-render limpiando y reponiendo URL
        setCurrentUrl('');
        requestAnimationFrame(() => {
          if (mountedRef.current) setCurrentUrl(rawStreamUrl);
        });
      }, delay);
    } else {
      setStatus('error');
    }
  }, [retryCount, rawStreamUrl]);

  const handleRetry = () => {
    setRetryCount(0);
    setStatus('loading');
    ApiService.reconnect().then(() => {
      setTimeout(() => {
        if (mountedRef.current) {
          setCurrentUrl('');
          requestAnimationFrame(() => {
            if (mountedRef.current) setCurrentUrl(rawStreamUrl);
          });
        }
      }, 800);
    });
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
            <p>{retryCount > 0 ? `Reintentando... (${retryCount}/5)` : 'Conectando...'}</p>
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

        {currentUrl && (
          <img
            ref={imgRef}
            src={currentUrl}
            alt="Camera Stream"
            className="stream-img"
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
