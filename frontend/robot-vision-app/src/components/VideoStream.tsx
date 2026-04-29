// src/components/VideoStream.tsx
import React, { useState } from 'react';
import { IonCard, IonSpinner, IonBadge, IonIcon } from '@ionic/react';
import { videocam, alertCircleOutline } from 'ionicons/icons';
import './VideoStream.css';

interface VideoStreamProps {
  url: string; // La IP de tu ESP32 (ej: http://192.168.1.50:81/stream)
}

export const VideoStream: React.FC<VideoStreamProps> = ({ url }) => {
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading');

  const handleLoad = () => {
    setStatus('connected');
  };

  const handleError = () => {
    setStatus('error');
  };

  return (
    <IonCard className="video-card">
      {/* Cabecera con indicador LIVE */}
      <div className="video-header">
        <span className="video-title">📹 Stream en Vivo</span>
        {status === 'connected' && <IonBadge color="success" className="live-badge">LIVE</IonBadge>}
      </div>

      {/* Contenedor del vídeo */}
      <div className="video-container">
        {status === 'loading' && (
          <div className="overlay loading-overlay">
            <IonSpinner name="crescent" />
            <p>Conectando...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="overlay error-overlay">
            <IonIcon icon={alertCircleOutline} className="error-icon" />
            <p>Error de conexión</p>
            <small>Verifica la IP y que el ESP32 esté encendido</small>
          </div>
        )}

        <img
          src={url}
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