// src/components/DetectionStream.tsx
import React, { useState, useEffect } from 'react';
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

  const streamUrl = ApiService.getYoloStreamUrl(confidence);
  const [currentUrl, setCurrentUrl] = useState(streamUrl);

  useEffect(() => {
    setCurrentUrl(streamUrl);
    setStatus('loading');
    setRetryCount(0);
  }, [streamUrl]);

  const handleLoad = () => setStatus('connected');

  const handleError = () => {
    if (retryCount < 3) {
      setRetryCount(prev => prev + 1);
      const separator = streamUrl.includes('?') ? '&' : '?';
      setCurrentUrl(`${streamUrl}${separator}_retry=${Date.now()}`);
    } else {
      setStatus('error');
    }
  };

  const handleRetry = () => {
    setRetryCount(0);
    const separator = streamUrl.includes('?') ? '&' : '?';
    setCurrentUrl(`${streamUrl}${separator}_retry=${Date.now()}`);
    setStatus('loading');
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
            <p>{retryCount > 0 ? `Reintentando... (${retryCount}/3)` : 'Cargando modelo YOLO...'}</p>
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

        <img
          src={currentUrl}
          alt="YOLO Detection Stream"
          className="detection-stream-img"
          onLoad={handleLoad}
          onError={handleError}
          style={{ display: status === 'connected' ? 'block' : 'none' }}
        />
      </div>
    </IonCard>
  );
};
