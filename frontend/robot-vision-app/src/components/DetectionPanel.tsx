// src/components/DetectionPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import { IonCard, IonBadge } from '@ionic/react';
import './DetectionPanel.css';

interface Detection {
  object: string;
  confidence: number;
  bbox?: number[];
  timestamp: number;
}

interface DetectionPanelProps {
  backendUrl: string;
  active: boolean;
}

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

// Colores por confianza
const getConfidenceColor = (conf: number): string => {
  if (conf >= 0.8) return 'success';
  if (conf >= 0.6) return 'warning';
  return 'medium';
};

export const DetectionPanel: React.FC<DetectionPanelProps> = ({ backendUrl, active }) => {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [objectCounts, setObjectCounts] = useState<Record<string, number>>({});
  const [totalDetected, setTotalDetected] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!active) {
      // Cerrar SSE si no está activo
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    // Conectar al SSE
    const es = new EventSource(`${backendUrl}/api/stream/yolo/events`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setDetections(data.detections || []);
        setTotalDetected(data.count || 0);

        // Contar objetos únicos
        const counts: Record<string, number> = {};
        (data.detections || []).forEach((d: Detection) => {
          counts[d.object] = (counts[d.object] || 0) + 1;
        });
        setObjectCounts(counts);
      } catch (err) {
        console.error('Error parsing SSE:', err);
      }
    };

    es.onerror = () => {
      console.log('SSE reconectando...');
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [backendUrl, active]);

  if (!active) return null;

  return (
    <IonCard className="detection-panel">
      <div className="panel-header">
        <span className="panel-title">📊 Detecciones</span>
        <IonBadge color={totalDetected > 0 ? 'success' : 'medium'} className="count-badge">
          {totalDetected} objeto{totalDetected !== 1 ? 's' : ''}
        </IonBadge>
      </div>

      <div className="panel-content">
        {totalDetected === 0 ? (
          <div className="no-detections">
            <span className="no-det-icon">👀</span>
            <p>Esperando detecciones...</p>
            <small>Apunta la cámara a un objeto</small>
          </div>
        ) : (
          <>
            {/* Resumen de objetos */}
            <div className="object-summary">
              {Object.entries(objectCounts).map(([name, count]) => (
                <div key={name} className="object-chip">
                  <span className="chip-icon">{getIcon(name)}</span>
                  <span className="chip-name">{name}</span>
                  {count > 1 && <span className="chip-count">×{count}</span>}
                </div>
              ))}
            </div>

            {/* Lista detallada */}
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
