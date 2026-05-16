// src/components/JoystickControl.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { IonCard, IonCardContent } from '@ionic/react';
import './JoystickControl.css';
import { Direction, JoystickControlProps } from '../types/interfaces';

const JOYSTICK_RADIUS = 75;
const STICK_RADIUS = 34;
const DEAD_ZONE = 0.15;

export const JoystickControl: React.FC<JoystickControlProps> = ({ onMove, onStop, drivingMode }) => {

    // ─── Estado visual (React state) ───
    const [speed, setSpeed] = useState(0);
    const [direction, setDirection] = useState<Direction>('stop');
    const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [activeButton, setActiveButton] = useState<Direction | null>(null);

    // ─── Refs para lógica de envío (sin re-renders constantes) ───
    const joystickRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const currentCmdRef = useRef<{ dir: Direction; speed: number; sx: number; sy: number }>({ dir: 'stop', speed: 0, sx: 0, sy: 0 });
    const lastSentRef = useRef('stop:0:0:0'); // Cache extendido para registrar coordenadas
    const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Refs para D-pad
    const dpadUpRef = useRef<HTMLButtonElement>(null);
    const dpadDownRef = useRef<HTMLButtonElement>(null);
    const dpadLeftRef = useRef<HTMLButtonElement>(null);
    const dpadRightRef = useRef<HTMLButtonElement>(null);

    // ─── Cálculo de posición relativa del dedo ───
    const getRelativePosition = useCallback((clientX: number, clientY: number) => {
        if (!joystickRef.current) return { x: 0, y: 0 };
        const rect = joystickRef.current.getBoundingClientRect();
        const rawX = (clientX - (rect.left + rect.width / 2)) / JOYSTICK_RADIUS;
        const rawY = -(clientY - (rect.top + rect.height / 2)) / JOYSTICK_RADIUS;
        return { x: rawX, y: rawY };
    }, []);

    // ─── Procesador Analógico Puro (360° sin restricciones de dirección) ───
    const processCoordinates = useCallback((x: number, y: number) => {
        const magnitude = Math.sqrt(x * x + y * y);
        if (magnitude < DEAD_ZONE) return { sx: 0, sy: 0, dir: 'stop' as Direction, mag: 0 };

        const magClamped = Math.min(magnitude, 1);


        // En el modo HTTP todo está limitado a 4 direcciones
        if (drivingMode === 'http') {
            let dir: Direction;

            let sx = 0;
            let sy = 0;

            if (Math.abs(x) > Math.abs(y)) {
                dir = x > 0 ? 'right' : 'left';
                // El stick visual se clava por completo en la línea horizontal del eje X
                sx = (x > 0 ? 1 : -1) * magClamped;
            } else {
                dir = y > 0 ? 'forward' : 'backward';
                // El stick visual se clava por completo en la línea vertical del eje Y
                sy = (y > 0 ? 1 : -1) * magClamped;
            }

            return { sx, sy, dir, mag: magClamped };


        }
        // MODO REAL-TIME con websockets: dirección libre en 360°
        else {
            const sx = x / (magnitude > 1 ? magnitude : 1);
            const sy = y / (magnitude > 1 ? magnitude : 1);

            // Mapeo angular de 8 cuadrantes únicamente para pintar las etiquetas de texto en la UI
            const angle = Math.atan2(y, x) * (180 / Math.PI);
            let dir: Direction = 'stop';

            if (angle >= -22.5 && angle < 22.5) dir = 'right';
            else if (angle >= 22.5 && angle < 67.5) dir = 'forward-right';
            else if (angle >= 67.5 && angle < 112.5) dir = 'forward';
            else if (angle >= 112.5 && angle < 157.5) dir = 'forward-left';
            else if (angle >= 157.5 || angle < -157.5) dir = 'left';
            else if (angle >= -157.5 && angle < -112.5) dir = 'backward-left';
            else if (angle >= -112.5 && angle < -67.5) dir = 'backward';
            else if (angle >= -67.5 && angle < -22.5) dir = 'backward-right';

            return { sx, sy, dir, mag: magClamped };
        }
    }, [drivingMode]);

    // ─── Actualizar estado actual de la palanca ───
    const updateJoystickState = useCallback((clientX: number, clientY: number) => {
        const { x, y } = getRelativePosition(clientX, clientY);
        const { sx, sy, dir, mag } = processCoordinates(x, y);

        // Curva de respuesta PWM: mag^1.5 → Mínimo 40 para vencer la inercia estática de los motores
        const rawSpeed = Math.round(Math.pow(mag, 1.5) * 255);
        const computedSpeed = mag > 0 ? Math.max(40, rawSpeed) : 0;

        currentCmdRef.current = { dir, speed: computedSpeed, sx, sy };

        setStickPos({ x: sx, y: sy });
        setSpeed(computedSpeed);
        setDirection(dir);
    }, [getRelativePosition, processCoordinates]);

    // ─── Bucle inteligente adaptable (HTTP vs WebSocket) ───
    const startSendLoop = useCallback(() => {
        if (sendIntervalRef.current) return;

        const cmd = currentCmdRef.current;
        const initialKey = `${cmd.dir}:${cmd.speed}:${cmd.sx.toFixed(2)}:${cmd.sy.toFixed(2)}`;
        if (cmd.dir !== 'stop') {
            onMove(cmd.dir, cmd.speed, cmd.sx, cmd.sy);
            lastSentRef.current = initialKey;
        }

        const intervalMs = drivingMode === 'http' ? 150 : 80;

        sendIntervalRef.current = setInterval(() => {
            const c = currentCmdRef.current;
            const k = `${c.dir}:${c.speed}:${c.sx.toFixed(2)}:${c.sy.toFixed(2)}`;

            if (c.dir === 'stop') {
                if (!lastSentRef.current.startsWith('stop:')) {
                    onStop();
                    lastSentRef.current = 'stop:0:0:0';
                }
            }
            else if (k !== lastSentRef.current) {
                onMove(c.dir, c.speed, c.sx, c.sy);
                lastSentRef.current = k;
            }
            else {
                if (drivingMode !== 'http') {
                    onMove(c.dir, c.speed, c.sx, c.sy);
                }
            }
        }, intervalMs);
    }, [onMove, onStop, drivingMode]);

    const stopSendLoop = useCallback(() => {
        if (sendIntervalRef.current) {
            clearInterval(sendIntervalRef.current);
            sendIntervalRef.current = null;
        }
    }, []);

    // Reiniciar dinámicamente el bucle si cambias el modo desde el menú en pleno arrastre
    useEffect(() => {
        if (isDraggingRef.current) {
            stopSendLoop();
            startSendLoop();
        }
    }, [drivingMode, startSendLoop, stopSendLoop]);

    // ─── Handlers Eventos Mouse / Touch ───
    const handleStart = useCallback((clientX: number, clientY: number) => {
        isDraggingRef.current = true;
        setIsDragging(true);
        updateJoystickState(clientX, clientY);
        startSendLoop();
    }, [updateJoystickState, startSendLoop]);

    const handleMoveEvent = useCallback((clientX: number, clientY: number) => {
        if (!isDraggingRef.current) return;
        updateJoystickState(clientX, clientY);
    }, [updateJoystickState]);

    const handleEnd = useCallback(() => {
        isDraggingRef.current = false;
        setIsDragging(false);
        setStickPos({ x: 0, y: 0 });
        setSpeed(0);
        setDirection('stop');
        currentCmdRef.current = { dir: 'stop', speed: 0, sx: 0, sy: 0 };
        stopSendLoop();
        onStop();
        lastSentRef.current = 'stop:0:0:0';
    }, [onStop, stopSendLoop]);

    // Touch nativo en contenedor del joystick
    useEffect(() => {
        const el = joystickRef.current;
        if (!el) return;
        const onTS = (e: TouchEvent) => { e.preventDefault(); handleStart(e.touches[0].clientX, e.touches[0].clientY); };
        el.addEventListener('touchstart', onTS, { passive: false });
        return () => el.removeEventListener('touchstart', onTS);
    }, [handleStart]);

    // Captura global de movimientos fuera de la zona del joystick
    useEffect(() => {
        const onMM = (e: MouseEvent) => { if (isDraggingRef.current) handleMoveEvent(e.clientX, e.clientY); };
        const onMU = () => { if (isDraggingRef.current) handleEnd(); };
        const onTM = (e: TouchEvent) => { if (isDraggingRef.current) { e.preventDefault(); handleMoveEvent(e.touches[0].clientX, e.touches[0].clientY); } };
        const onTE = () => { if (isDraggingRef.current) handleEnd(); };

        window.addEventListener('mousemove', onMM);
        window.addEventListener('mouseup', onMU);
        window.addEventListener('touchmove', onTM, { passive: false });
        window.addEventListener('touchend', onTE);
        return () => {
            window.removeEventListener('mousemove', onMM);
            window.removeEventListener('mouseup', onMU);
            window.removeEventListener('touchmove', onTM);
            window.removeEventListener('touchend', onTE);
        };
    }, [handleMoveEvent, handleEnd]);

    useEffect(() => () => stopSendLoop(), [stopSendLoop]);

    // ─── Lógica D-Pad (Mantiene rumbos fijos de seguridad) ───
    const handleDpadDown = useCallback((dir: Direction) => {
        setActiveButton(dir);
        setDirection(dir);
        setSpeed(90);
        currentCmdRef.current = {
            dir,
            speed: 90,
            sx: dir === 'left' ? -1 : dir === 'right' ? 1 : 0,
            sy: dir === 'forward' ? 1 : dir === 'backward' ? -1 : 0
        };
        startSendLoop();
    }, [startSendLoop]);

    const handleDpadUp = useCallback(() => {
        setActiveButton(null);
        setDirection('stop');
        setSpeed(0);
        currentCmdRef.current = { dir: 'stop', speed: 0, sx: 0, sy: 0 };
        stopSendLoop();
        onStop();
        lastSentRef.current = 'stop:0:0:0';
    }, [onStop, stopSendLoop]);

    useEffect(() => {
        const refs = [
            { ref: dpadUpRef, dir: 'forward' as Direction }, { ref: dpadDownRef, dir: 'backward' as Direction },
            { ref: dpadLeftRef, dir: 'left' as Direction }, { ref: dpadRightRef, dir: 'right' as Direction },
        ];
        const cleanups: (() => void)[] = [];
        for (const { ref, dir } of refs) {
            const el = ref.current;
            if (!el) continue;
            const onTS = (e: TouchEvent) => { e.preventDefault(); handleDpadDown(dir); };
            const onTE = (e: TouchEvent) => { e.preventDefault(); handleDpadUp(); };
            el.addEventListener('touchstart', onTS, { passive: false });
            el.addEventListener('touchend', onTE, { passive: false });
            cleanups.push(() => { el.removeEventListener('touchstart', onTS); el.removeEventListener('touchend', onTE); });
        }
        return () => cleanups.forEach(fn => fn());
    }, [handleDpadDown, handleDpadUp]);

    // ─── Estilos y Renderizado Dinámico ───
    const speedColor = speed < 80 ? '#4ade80' : speed < 160 ? '#facc15' : '#f87171';
    const stickPixelX = stickPos.x * JOYSTICK_RADIUS;
    const stickPixelY = -stickPos.y * JOYSTICK_RADIUS;

    return (
        <IonCard className="joystick-card">
            <IonCardContent>
                <div className="control-zone">
                    <button ref={dpadUpRef} className={`dpad-btn dpad-up ${activeButton === 'forward' ? 'dpad-active' : ''}`}
                        onMouseDown={() => handleDpadDown('forward')} onMouseUp={handleDpadUp} onMouseLeave={handleDpadUp}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" /></svg>
                    </button>

                    <button ref={dpadLeftRef} className={`dpad-btn dpad-left ${activeButton === 'left' ? 'dpad-active' : ''}`}
                        onMouseDown={() => handleDpadDown('left')} onMouseUp={handleDpadUp} onMouseLeave={handleDpadUp}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z" /></svg>
                    </button>

                    <div className={`joystick-base ${isDragging ? 'joystick-active' : ''}`} ref={joystickRef} onMouseDown={(e) => { e.preventDefault(); handleStart(e.clientX, e.clientY); }}
                        style={{ width: JOYSTICK_RADIUS * 2, height: JOYSTICK_RADIUS * 2 }}>
                        <div className="axis-guide axis-horizontal" />
                        <div className="axis-guide axis-vertical" />
                        <div className={`joystick-stick ${isDragging ? 'stick-dragging' : ''}`}
                            style={{
                                width: STICK_RADIUS * 2, height: STICK_RADIUS * 2,
                                transform: `translate(${stickPixelX}px, ${stickPixelY}px)`,
                                backgroundColor: isDragging ? speedColor : 'rgba(255,255,255,0.85)',
                                transition: isDragging ? 'background-color 0.15s' : 'transform 0.2s ease-out, background-color 0.15s',
                            }} />
                    </div>

                    <button ref={dpadRightRef} className={`dpad-btn dpad-right ${activeButton === 'right' ? 'dpad-active' : ''}`}
                        onMouseDown={() => handleDpadDown('right')} onMouseUp={handleDpadUp} onMouseLeave={handleDpadUp}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" /></svg>
                    </button>

                    <button ref={dpadDownRef} className={`dpad-btn dpad-down ${activeButton === 'backward' ? 'dpad-active' : ''}`}
                        onMouseDown={() => handleDpadDown('backward')} onMouseUp={handleDpadUp} onMouseLeave={handleDpadUp}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></svg>
                    </button>
                </div>
            </IonCardContent>
        </IonCard>
    );
};

export type { Direction };