// src/components/VideoStream.tsx
import React, { useState, useEffect } from 'react';
import { IonCard, IonSpinner, IonBadge, IonIcon, IonText } from '@ionic/react';
import { videocam, alertCircleOutline, refresh } from 'ionicons/icons';
import './VideoStream.css';

interface VideoStreamProps {
  url: string;
}

export const VideoStream: React.FC<VideoStreamProps> = ({ url }) => {
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(url);

  // Reiniciar cuando cambia la URL prop
  useEffect(() => {
    setCurrentUrl(url);
    setStatus('loading');
    setRetryCount(0);
  }, [url]);

  const handleLoad = () => setStatus('connected');

  const handleError = () => {
    if (retryCount < 3) {
      // Reintentar con timestamp para evitar caché del navegador
      setRetryCount(prev => prev + 1);
      setCurrentUrl(`${url}?retry=${Date.now()}`);
    } else {
      setStatus('error');
    }
  };

  const handleRetry = () => {
    setRetryCount(0);
    setCurrentUrl(`${url}?retry=${Date.now()}`);
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