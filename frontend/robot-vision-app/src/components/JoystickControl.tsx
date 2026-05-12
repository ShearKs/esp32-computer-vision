// src/components/JoystickControl.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ApiService } from '../services/api';
import { IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent } from '@ionic/react';
import './JoystickControl.css';

interface JoystickControlProps {
    onMove: (direction: Direction, speed: number, x: number, y: number) => void;
    onStop: () => void;
    onError?: (error : Error) => void;
}

export type Direction = 'forward' | 'backward' | 'left' | 'right' | 'stop';

const JOYSTICK_RADIUS = 55; // radio de la base en px
const STICK_RADIUS = 26;    // radio de la bola (más grande que el borde = sobresale)
const DEAD_ZONE = 0.15;
const THROTTLE_MS = 100; // ms entre envíos de comandos (para no saturar la red)

export const JoystickControl: React.FC<JoystickControlProps> = ({ onMove, onStop }) => {

    const lastCommandRef = useRef(0);

    const [speed, setSpeed] = useState(0);
    const [direction, setDirection] = useState<Direction>('stop');
    const [stickPos, setStickPos] = useState({ x: 0, y: 0 }); // -1 to 1 normalized
    const [isDragging, setIsDragging] = useState(false);
    const [activeButton, setActiveButton] = useState<Direction | null>(null);

    const joystickRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    // ─── Joystick Touch/Mouse Handling ───

    const getRelativePosition = useCallback((clientX: number, clientY: number) => {
        if (!joystickRef.current) return { x: 0, y: 0 };
        const rect = joystickRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const rawX = (clientX - centerX) / JOYSTICK_RADIUS;
        const rawY = -(clientY - centerY) / JOYSTICK_RADIUS; // invert Y so up = positive
        return { x: rawX, y: rawY };
    }, []);

    const snapToCardinal = useCallback((x: number, y: number): { sx: number; sy: number; dir: Direction; mag: number } => {
        const magnitude = Math.sqrt(x * x + y * y);

        if (magnitude < DEAD_ZONE) {
            return { sx: 0, sy: 0, dir: 'stop', mag: 0 };
        }

        // Determine dominant axis and lock to it
        let dir: Direction;
        let sx = 0, sy = 0;

        if (Math.abs(x) > Math.abs(y)) {
            // Horizontal axis dominant
            dir = x > 0 ? 'right' : 'left';
            const clampedX = Math.max(-1, Math.min(1, x));
            sx = clampedX;
            sy = 0;
        } else {
            // Vertical axis dominant
            dir = y > 0 ? 'forward' : 'backward';
            const clampedY = Math.max(-1, Math.min(1, y));
            sx = 0;
            sy = clampedY;
        }

        const clampedMag = Math.min(magnitude, 1);
        return { sx, sy, dir, mag: clampedMag };
    }, []);

    const processJoystickInput = useCallback((clientX: number, clientY: number) => {

        // Fecha Actual
        const now = Date.now();
        //
        if (now - lastCommandRef.current < THROTTLE_MS) return;
        lastCommandRef.current = now;

        const { x, y } = getRelativePosition(clientX, clientY);
        const { sx, sy, dir, mag } = snapToCardinal(x, y);
        // Curva progresiva: mag^2.5 → cuesta mucho llegar a máxima velocidad
        // 50% recorrido → ~18% vel | 70% → ~41% vel | 90% → ~77% vel | 100% → 100%
        const computedSpeed = Math.round(Math.pow(mag, 2.5) * 100);

        setStickPos({ x: sx, y: sy });
        setSpeed(computedSpeed);
        setDirection(dir);

        if (dir !== 'stop') {
            Promise.resolve(onMove(dir, computedSpeed, sx, sy)).catch(console.warn);
        } else {
            Promise.resolve(onStop()).catch(console.warn);
        }
    }, [getRelativePosition, snapToCardinal, onMove, onStop]);

    const handleStart = useCallback((clientX: number, clientY: number) => {
        isDraggingRef.current = true;
        setIsDragging(true);
        processJoystickInput(clientX, clientY);
    }, [processJoystickInput]);

    const handleMoveEvent = useCallback((clientX: number, clientY: number) => {
        if (!isDraggingRef.current) return;
        processJoystickInput(clientX, clientY);
    }, [processJoystickInput]);

    const handleEnd = useCallback(() => {
        isDraggingRef.current = false;
        setIsDragging(false);
        setStickPos({ x: 0, y: 0 });
        setSpeed(0);
        setDirection('stop');
        onStop();
    }, [onStop]);

    // Mouse events
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        handleStart(e.clientX, e.clientY);
    }, [handleStart]);

    // Touch events
    const onTouchStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY);
    }, [handleStart]);

    // Global move/end listeners (so dragging works outside the element)
    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => handleMoveEvent(e.clientX, e.clientY);
        const onMouseUp = () => handleEnd();
        const onTouchMove = (e: TouchEvent) => {
            if (isDraggingRef.current) {
                e.preventDefault();
                handleMoveEvent(e.touches[0].clientX, e.touches[0].clientY);
            }
        };
        const onTouchEnd = () => handleEnd();

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };
    }, [handleMoveEvent, handleEnd]);

    // ─── D-Pad Button Handlers ───

    const handleDpadDown = useCallback((dir: Direction) => {
        setActiveButton(dir);
        setDirection(dir);
        setSpeed(15); // velocidad suave para cambios de dirección
        onMove(dir, 15,
            dir === 'left' ? -1 : dir === 'right' ? 1 : 0,
            dir === 'forward' ? 1 : dir === 'backward' ? -1 : 0
        );
    }, [onMove]);

    const handleDpadUp = useCallback(() => {
        setActiveButton(null);
        setDirection('stop');
        setSpeed(0);
        onStop();
    }, [onStop]);

    // ─── Visual Helpers ───

    const directionIcon: Record<string, string> = {
        forward: '⬆️',
        backward: '⬇️',
        left: '⬅️',
        right: '➡️',
        stop: '⏹️',
    };

    const speedColor =
        speed < 30 ? '#4ade80' :
            speed < 60 ? '#facc15' :
                '#f87171';

    // Stick pixel position — la bola puede sobresalir del borde (JOYSTICK_RADIUS, no restamos STICK_RADIUS)
    const maxTravel = JOYSTICK_RADIUS;
    const stickPixelX = stickPos.x * maxTravel;
    const stickPixelY = -stickPos.y * maxTravel; // invert back for CSS (positive = down)

    return (
        <IonCard className="joystick-card">
            <IonCardContent>
                {/* Indicador de estado */}
                {/* <div className="joystick-status">
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
                </div> */}

                {/* Barra de velocidad */}
                {/* <div className="speed-bar-container">
                    <div
                        className="speed-bar-fill"
                        style={{
                            width: `${speed}%`,
                            backgroundColor: speedColor,
                            transition: 'width 0.1s ease, background-color 0.2s ease'
                        }}
                    />
                </div> */}

                {/* Zona de control: D-pad + Joystick */}
                <div className="control-zone">

                    {/* Botón ARRIBA */}
                    <button
                        className={`dpad-btn dpad-up ${activeButton === 'forward' ? 'dpad-active' : ''}`}
                        onMouseDown={() => handleDpadDown('forward')}
                        onMouseUp={handleDpadUp}
                        onMouseLeave={handleDpadUp}
                        onTouchStart={(e) => { e.preventDefault(); handleDpadDown('forward'); }}
                        onTouchEnd={(e) => { e.preventDefault(); handleDpadUp(); }}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
                        </svg>
                    </button>

                    {/* Botón IZQUIERDA */}
                    <button
                        className={`dpad-btn dpad-left ${activeButton === 'left' ? 'dpad-active' : ''}`}
                        onMouseDown={() => handleDpadDown('left')}
                        onMouseUp={handleDpadUp}
                        onMouseLeave={handleDpadUp}
                        onTouchStart={(e) => { e.preventDefault(); handleDpadDown('left'); }}
                        onTouchEnd={(e) => { e.preventDefault(); handleDpadUp(); }}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
                        </svg>
                    </button>

                    {/* Joystick custom */}
                    <div
                        className={`joystick-base ${isDragging ? 'joystick-active' : ''}`}
                        ref={joystickRef}
                        onMouseDown={onMouseDown}
                        onTouchStart={onTouchStart}
                        style={{
                            width: JOYSTICK_RADIUS * 2,
                            height: JOYSTICK_RADIUS * 2,
                        }}
                    >
                        {/* Guías de ejes (cruces) */}
                        <div className="axis-guide axis-horizontal" />
                        <div className="axis-guide axis-vertical" />

                        {/* Stick knob */}
                        <div
                            className={`joystick-stick ${isDragging ? 'stick-dragging' : ''}`}
                            style={{
                                width: STICK_RADIUS * 2,
                                height: STICK_RADIUS * 2,
                                transform: `translate(${stickPixelX}px, ${stickPixelY}px)`,
                                backgroundColor: isDragging ? speedColor : 'rgba(255,255,255,0.85)',
                                transition: isDragging ? 'background-color 0.15s' : 'transform 0.2s ease-out, background-color 0.15s',
                            }}
                        />
                    </div>

                    {/* Botón DERECHA */}
                    <button
                        className={`dpad-btn dpad-right ${activeButton === 'right' ? 'dpad-active' : ''}`}
                        onMouseDown={() => handleDpadDown('right')}
                        onMouseUp={handleDpadUp}
                        onMouseLeave={handleDpadUp}
                        onTouchStart={(e) => { e.preventDefault(); handleDpadDown('right'); }}
                        onTouchEnd={(e) => { e.preventDefault(); handleDpadUp(); }}>


                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                        </svg>
                    </button>

                    {/* Botón ABAJO */}
                    <button
                        className={`dpad-btn dpad-down ${activeButton === 'backward' ? 'dpad-active' : ''}`}
                        onMouseDown={() => handleDpadDown('backward')}
                        onMouseUp={handleDpadUp}
                        onMouseLeave={handleDpadUp}
                        onTouchStart={(e) => { e.preventDefault(); handleDpadDown('backward'); }}
                        onTouchEnd={(e) => { e.preventDefault(); handleDpadUp(); }}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
                        </svg>
                    </button>

                </div>
            </IonCardContent>
        </IonCard>
    );
};