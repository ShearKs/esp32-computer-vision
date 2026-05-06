// src/components/VideoStream.tsx
import React, { useState, useEffect } from 'react';
import { IonCard, IonSpinner, IonBadge, IonIcon } from '@ionic/react';
import { alertCircleOutline, refresh } from 'ionicons/icons';
import { ApiService } from '../services/api';
import './VideoStream.css';

export const VideoStream: React.FC = () => {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setRetryCount(0);

    ApiService.getEsp32StreamUrl()
      .then((url) => {
        if (!cancelled) {
          setStreamUrl(url);
          setCurrentUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (streamUrl) {
      setCurrentUrl(streamUrl);
      setStatus('loading');
      setRetryCount(0);
    }
  }, [streamUrl]);

  const handleLoad = () => setStatus('connected');

  const handleError = () => {
    if (retryCount < 3 && currentUrl) {
      setRetryCount(prev => prev + 1);
      setCurrentUrl(`${currentUrl}?retry=${Date.now()}`);
    } else {
      setStatus('error');
    }
  };

  const handleRetry = () => {
    if (!streamUrl) return;
    setRetryCount(0);
    setCurrentUrl(`${streamUrl}?retry=${Date.now()}`);
    setStatus('loading');
  };

  if (!currentUrl) {
    return (
      <IonCard className="video-card">
        <div className="video-header">
          <span className="video-title">📹 Stream en Vivo</span>
        </div>
        <div className="video-container">
          <div className="overlay loading-overlay">
            <IonSpinner name="crescent" />
            <p>Obteniendo configuración...</p>
          </div>
        </div>
      </IonCard>
    );
  }

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
            <p>{retryCount > 0 ? `Reintentando... (${retryCount}/3)` : 'Conectando...'}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="overlay error-overlay">
            <IonIcon icon={alertCircleOutline} className="error-icon" />
            <p>Error de conexión</p>
            <small>Verifica la IP y que el ESP32 esté encendido</small>
            <IonIcon 
              icon={refresh} 
              onClick={handleRetry}
              style={{ cursor: 'pointer', marginTop: 8, fontSize: 20 }}
            />
          </div>
        )}

        <img
          src={currentUrl}
          alt="ESP32 Stream"
          className="stream-img"
          onLoad={handleLoad}
          onError={handleError}
          style={{ display: status === 'connected' ? 'block' : 'none' }}
        />
      </div>
    </IonCard>
  );
};
