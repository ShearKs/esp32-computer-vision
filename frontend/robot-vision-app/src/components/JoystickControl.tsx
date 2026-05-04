// src/components/JoystickControl.tsx
import React, { useState } from 'react';
import { Joystick } from 'react-joystick-component';
import { IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent } from '@ionic/react';
import './JoystickControl.css';

interface JoystickControlProps {
    onMove: (direction: string, speed: number, x: number, y: number) => void;
    onStop: () => void;
}

export const JoystickControl: React.FC<JoystickControlProps> = ({ onMove, onStop }) => {

    const [speed, setSpeed] = useState(0);
    const [direction, setDirection] = useState('stop');

    const handleMove = (event: any) => {
        // x e y vienen normalizados entre -1 y 1
        const x = event.x ?? 0;
        const y = event.y ?? 0;

        // Velocidad = magnitud del vector (cuanto más alejado del centro, más rápido)
        const magnitude = Math.min(Math.sqrt(x * x + y * y), 1);
        const computedSpeed = Math.round(magnitude * 100);

        // Determinar dirección principal
        let dir = 'stop';
        if (magnitude > 0.15) { // zona muerta del 15% en el centro
            if (Math.abs(x) > Math.abs(y)) {
                dir = x > 0 ? 'right' : 'left';
            } else {
                // En react-joystick-component, y positivo = arriba (forward)
                dir = y > 0 ? 'forward' : 'backward';
            }
        }

        setSpeed(computedSpeed);
        setDirection(dir);

        if (dir !== 'stop') {
            onMove(dir, computedSpeed, x, y);
        } else {
            onStop();
        }
    };

    const handleEnd = () => {
        setSpeed(0);
        setDirection('stop');
        onStop();
    };

    // Icono visual según dirección
    const directionIcon: Record<string, string> = {
        forward: '⬆️',
        backward: '⬇️',
        left: '⬅️',
        right: '➡️',
        stop: '⏹️',
    };

    // Color de velocidad: verde → amarillo → rojo
    const speedColor =
        speed < 30 ? '#4ade80' :
            speed < 60 ? '#facc15' :
                '#f87171';

    return (
        <IonCard className="joystick-card">
            <IonCardHeader>
                <IonCardTitle>Control del Robot</IonCardTitle>
                <IonCardSubtitle>Mueve el joystick para dirigir</IonCardSubtitle>
            </IonCardHeader>

            <IonCardContent>
                {/* Indicador de estado */}
                <div className="joystick-status">
                    <div className="status-direction">
                        <span className="direction-icon">{directionIcon[direction]}</span>
                        <span className="direction-label">{direction.toUpperCase()}</span>
                    </div>
                    <div className="status-speed">
                        <span className="speed-value" style={{ color: speedColor }}>
                            {speed}%
                        </span>
                        <span className="speed-label">velocidad</span>
                    </div>
                </div>

                {/* Barra de velocidad */}
                <div className="speed-bar-container">
                    <div
                        className="speed-bar-fill"
                        style={{
                            width: `${speed}%`,
                            backgroundColor: speedColor,
                            transition: 'width 0.1s ease, background-color 0.2s ease'
                        }}
                    />
                </div>

                {/* Joystick */}
                <div className="joystick-container">
                    <Joystick
                        size={125}
                        baseColor="rgba(255,255,255,0.1)"
                        stickColor={speedColor}
                        move={handleMove}
                        stop={handleEnd}
                    />
                </div>

                <p className="joystick-hint">
                    Cuanto más alejado del centro, mayor velocidad
                </p>
            </IonCardContent>
        </IonCard>
    );
};