// src/components/DetectionPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import { IonCard, IonBadge } from '@ionic/react';
import { ApiService } from '../services/api';
import { YoloEvent, Detection } from '../types/interfaces';
import './DetectionPanel.css';

// Iconos por categoría
const CATEGORY_ICONS: Record<string, string> = {
  person: '🧑',
  car: '🚗',
  truck: '🚛',
  bus: '🚌',
  motorcycle: '🏍️',
  bicycle: '🚲',
  dog: '🐕',
  cat: '🐱',
  bird: '🐦',
  'cell phone': '📱',
  laptop: '💻',
  tv: '📺',
  bottle: '🍾',
  cup: '☕',
  chair: '🪑',
  couch: '🛋️',
  book: '📖',
  backpack: '🎒',
  umbrella: '☂️',
  scissors: '✂️',
  clock: '🕐',
  keyboard: '⌨️',
  mouse: '🖱️',
};

const getIcon = (name: string) => CATEGORY_ICONS[name] || '📦';

const getConfidenceColor = (conf: number): string => {
  if (conf >= 0.8) return 'success';
  if (conf >= 0.6) return 'warning';
  return 'medium';
};

interface DetectionPanelProps {
  yoloEnabled: boolean;
}

export const DetectionPanel: React.FC<DetectionPanelProps> = ({ yoloEnabled }) => {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [objectCounts, setObjectCounts] = useState<Record<string, number>>({});
  const [totalDetected, setTotalDetected] = useState(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Solo suscribirse a SSE si YOLO está activo
    if (!yoloEnabled) {
      // Limpiar suscripción anterior si existía
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setDetections([]);
      setObjectCounts({});
      setTotalDetected(0);
      return;
    }

    const handleDetections = (event: YoloEvent) => {
      setDetections(event.detections || []);
      setTotalDetected(event.count || 0);

      const counts: Record<string, number> = {};
      (event.detections || []).forEach((d: Detection) => {
        counts[d.object] = (counts[d.object] || 0) + 1;
      });
      setObjectCounts(counts);
    };

    unsubscribeRef.current = ApiService.subscribeDetections(handleDetections);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [yoloEnabled]);

  return (
    <IonCard className="detection-panel">
      <div className="panel-header">
        <span className="panel-title">📊 Detecciones</span>
        <IonBadge color={totalDetected > 0 ? 'success' : 'medium'} className="count-badge">
          {totalDetected} objeto{totalDetected !== 1 ? 's' : ''}
        </IonBadge>
      </div>

      <div className="panel-content">
        {!yoloEnabled ? (
          <div className="no-detections">
            <span className="no-det-icon">🔇</span>
            <p>YOLO desactivado</p>
            <small>Actívalo en el menú para ver detecciones</small>
          </div>
        ) : totalDetected === 0 ? (
          <div className="no-detections">
            <span className="no-det-icon">👀</span>
            <p>Esperando detecciones...</p>
            <small>Apunta la cámara a un objeto</small>
          </div>
        ) : (
          <>
            <div className="object-summary">
              {Object.entries(objectCounts).map(([name, count]) => (
                <div key={name} className="object-chip">
                  <span className="chip-icon">{getIcon(name)}</span>
                  <span className="chip-name">{name}</span>
                  {count > 1 && <span className="chip-count">×{count}</span>}
                </div>
              ))}
            </div>

            <div className="detection-list">
              {detections.map((det, i) => (
                <div key={`${det.object}-${i}`} className="detection-item">
                  <span className="det-icon">{getIcon(det.object)}</span>
                  <div className="det-info">
                    <span className="det-name">{det.object}</span>
                    <div className="confidence-bar-container">
                      <div
                        className="confidence-bar"
                        style={{ width: `${det.confidence * 100}%` }}
                        data-confidence={getConfidenceColor(det.confidence)}
                      />
                    </div>
                  </div>
                  <IonBadge
                    color={getConfidenceColor(det.confidence)}
                    className="conf-badge"
                  >
                    {(det.confidence * 100).toFixed(0)}%
                  </IonBadge>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </IonCard>
  );
};
