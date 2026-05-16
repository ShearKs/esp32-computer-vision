// src/components/JoystickControl.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { IonCard, IonCardContent } from '@ionic/react';
import './JoystickControl.css';
import { Direction, JoystickControlProps } from '../types/interfaces';


const JOYSTICK_RADIUS = 75;
const STICK_RADIUS = 34;
const DEAD_ZONE = 0.15;
const SEND_INTERVAL_MS = 80; // Intervalo único de envío (12.5 cmd/s)

export const JoystickControl: React.FC<JoystickControlProps> = ({ onMove, onStop }) => {

    // ─── Estado visual (React state) ───
    const [speed, setSpeed] = useState(0);
    const [direction, setDirection] = useState<Direction>('stop');
    const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [activeButton, setActiveButton] = useState<Direction | null>(null);

    // ─── Refs para lógica de envío (sin re-renders) ───
    const joystickRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const currentCmdRef = useRef<{ dir: Direction; speed: number; sx: number; sy: number }>({ dir: 'stop', speed: 0, sx: 0, sy: 0 });
    const lastSentRef = useRef('stop:0'); // Último comando realmente enviado
    const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Refs para D-pad
    const dpadUpRef = useRef<HTMLButtonElement>(null);
    const dpadDownRef = useRef<HTMLButtonElement>(null);
    const dpadLeftRef = useRef<HTMLButtonElement>(null);
    const dpadRightRef = useRef<HTMLButtonElement>(null);

    // ─── Cálculo de posición ───
    const getRelativePosition = useCallback((clientX: number, clientY: number) => {
        if (!joystickRef.current) return { x: 0, y: 0 };
        const rect = joystickRef.current.getBoundingClientRect();
        const rawX = (clientX - (rect.left + rect.width / 2)) / JOYSTICK_RADIUS;
        const rawY = -(clientY - (rect.top + rect.height / 2)) / JOYSTICK_RADIUS;
        return { x: rawX, y: rawY };
    }, []);

    const snapToCardinal = useCallback((x: number, y: number) => {
        const magnitude = Math.sqrt(x * x + y * y);
        if (magnitude < DEAD_ZONE) return { sx: 0, sy: 0, dir: 'stop' as Direction, mag: 0 };

        let dir: Direction, sx = 0, sy = 0;
        if (Math.abs(x) > Math.abs(y)) {
            dir = x > 0 ? 'right' : 'left';
            sx = Math.max(-1, Math.min(1, x));
        } else {
            dir = y > 0 ? 'forward' : 'backward';
            sy = Math.max(-1, Math.min(1, y));
        }
        return { sx, sy, dir, mag: Math.min(magnitude, 1) };
    }, []);

    // ─── Actualizar estado actual (NO envía nada, solo actualiza refs) ───
    const updateJoystickState = useCallback((clientX: number, clientY: number) => {
        const { x, y } = getRelativePosition(clientX, clientY);
        const { sx, sy, dir, mag } = snapToCardinal(x, y);

        // Curva: mag^1.5 → 0-255 (PWM), mínimo 40 al salir de dead zone
        const rawSpeed = Math.round(Math.pow(mag, 1.5) * 255);
        const computedSpeed = mag > 0 ? Math.max(40, rawSpeed) : 0;

        // Actualizar refs (para el intervalo de envío)
        currentCmdRef.current = { dir, speed: computedSpeed, sx, sy };

        // Actualizar state (para la UI)
        setStickPos({ x: sx, y: sy });
        setSpeed(computedSpeed);
        setDirection(dir);
    }, [getRelativePosition, snapToCardinal]);

    // ─── Intervalo de envío: lee refs y manda al backend ───
    const startSendLoop = useCallback(() => {
        if (sendIntervalRef.current) return; // Ya corriendo
        // Enviar inmediatamente el primer comando
        const cmd = currentCmdRef.current;
        const key = `${cmd.dir}:${cmd.speed}`;
        if (cmd.dir !== 'stop') {
            onMove(cmd.dir, cmd.speed, cmd.sx, cmd.sy);
            lastSentRef.current = key;
        }
        // Luego cada SEND_INTERVAL_MS
        sendIntervalRef.current = setInterval(() => {
            const c = currentCmdRef.current;
            const k = `${c.dir}:${c.speed}`;
            if (c.dir === 'stop') {
                if (lastSentRef.current !== 'stop:0') {
                    onStop();
                    lastSentRef.current = 'stop:0';
                }
            } else if (k !== lastSentRef.current) {
                // Solo enviar si cambió dirección o velocidad
                onMove(c.dir, c.speed, c.sx, c.sy);
                lastSentRef.current = k;
            } else {
                // Keepalive: mismo comando → reenviar para que watchdog no pare motores
                onMove(c.dir, c.speed, c.sx, c.sy);
            }
        }, SEND_INTERVAL_MS);
    }, [onMove, onStop]);

    const stopSendLoop = useCallback(() => {
        if (sendIntervalRef.current) {
            clearInterval(sendIntervalRef.current);
            sendIntervalRef.current = null;
        }
    }, []);

    // ─── Handlers ───
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
        // Stop inmediato
        onStop();
        lastSentRef.current = 'stop:0';
    }, [onStop, stopSendLoop]);

    // ─── Touch nativo en joystick (passive: false) ───
    useEffect(() => {
        const el = joystickRef.current;
        if (!el) return;
        const onTS = (e: TouchEvent) => { e.preventDefault(); handleStart(e.touches[0].clientX, e.touches[0].clientY); };
        el.addEventListener('touchstart', onTS, { passive: false });
        return () => el.removeEventListener('touchstart', onTS);
    }, [handleStart]);

    // ─── Global move/end ───
    // IMPORTANTE: solo llamar handleEnd si el joystick está activo (isDraggingRef.current)
    // para evitar enviar comandos 'stop' al tocar cualquier parte de la interfaz.
    useEffect(() => {
        const onMM = (e: MouseEvent) => {
            if (isDraggingRef.current) handleMoveEvent(e.clientX, e.clientY);
        };
        const onMU = () => {
            if (isDraggingRef.current) handleEnd();
        };
        const onTM = (e: TouchEvent) => {
            if (isDraggingRef.current) { e.preventDefault(); handleMoveEvent(e.touches[0].clientX, e.touches[0].clientY); }
        };
        const onTE = () => {
            if (isDraggingRef.current) handleEnd();
        };

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

    // Cleanup al desmontar
    useEffect(() => () => stopSendLoop(), [stopSendLoop]);

    // ─── D-Pad ───
    const handleDpadDown = useCallback((dir: Direction) => {
        setActiveButton(dir);
        setDirection(dir);
        setSpeed(40);
        currentCmdRef.current = { dir, speed: 125, sx: dir === 'left' ? -1 : dir === 'right' ? 1 : 0, sy: dir === 'forward' ? 1 : dir === 'backward' ? -1 : 0 };
        startSendLoop();
    }, [startSendLoop]);

    const handleDpadUp = useCallback(() => {
        setActiveButton(null);
        setDirection('stop');
        setSpeed(0);
        currentCmdRef.current = { dir: 'stop', speed: 0, sx: 0, sy: 0 };
        stopSendLoop();
        onStop();
        lastSentRef.current = 'stop:0';
    }, [onStop, stopSendLoop]);

    // D-pad touch nativo
    useEffect(() => {
        const refs: { ref: React.RefObject<HTMLButtonElement | null>; dir: Direction }[] = [
            { ref: dpadUpRef, dir: 'forward' }, { ref: dpadDownRef, dir: 'backward' },
            { ref: dpadLeftRef, dir: 'left' }, { ref: dpadRightRef, dir: 'right' },
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

    // ─── Visual ───
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
