'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { Replayer } from 'rrweb';
import 'rrweb/dist/style.css';

// An rrweb event as stored; the replayer reads the rest of it.
export interface ReplayEvent {
    type: number;
    timestamp: number;
    [key: string]: unknown;
}

const MAX_HEIGHT = 480;

function formatTime(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/**
 * Replays an rrweb recording: the visitor's page rebuilt in a sandboxed iframe,
 * scaled to fit. rrweb is imported on mount so it stays out of the server bundle
 * and out of every other dashboard page.
 *
 * Idle stretches (including the gap between two pages of a visit) are skipped.
 */
export default function ScreenReplay({ events }: { events: ReplayEvent[] }) {
    const frameRef = useRef<HTMLDivElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const replayerRef = useRef<Replayer | null>(null);
    const [size, setSize] = useState({ width: 1280, height: 720 });
    const [scale, setScale] = useState(1);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [total, setTotal] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [failed, setFailed] = useState(false);

    // Build a replayer per recording.
    useEffect(() => {
        const root = frameRef.current;
        if (!root) return;
        let cancelled = false;

        // Uploads sent as the page closed can arrive out of order.
        const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

        import('rrweb').then(({ Replayer }) => {
            if (cancelled) return;
            try {
                const replayer = new Replayer(sorted as any, {
                    root,
                    skipInactive: true,
                    showWarning: false,
                    mouseTail: { strokeStyle: 'rgba(99, 102, 241, 0.6)', lineWidth: 2 },
                });
                replayer.on('resize', (dimension: any) => {
                    if (dimension?.width && dimension?.height) {
                        setSize({ width: dimension.width, height: dimension.height });
                    }
                });
                replayer.on('finish', () => setPlaying(false));
                replayerRef.current = replayer;
                setTotal(replayer.getMetaData().totalTime);
                setCurrent(0);
                setPlaying(false);
                // Show the first frame instead of an empty box.
                replayer.pause(0);
            } catch {
                setFailed(true);
            }
        }).catch(() => setFailed(true));

        return () => {
            cancelled = true;
            replayerRef.current?.destroy();
            replayerRef.current = null;
        };
    }, [events]);

    // Fit the recorded viewport into the available width.
    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        const fit = () => {
            setScale(Math.min(box.clientWidth / size.width, MAX_HEIGHT / size.height, 1));
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(box);
        return () => observer.disconnect();
    }, [size]);

    useEffect(() => {
        if (!playing) return;
        const timer = setInterval(() => {
            const replayer = replayerRef.current;
            if (replayer) setCurrent(replayer.getCurrentTime());
        }, 200);
        return () => clearInterval(timer);
    }, [playing]);

    useEffect(() => {
        replayerRef.current?.setConfig({ speed });
    }, [speed]);

    const seek = (ms: number) => {
        const replayer = replayerRef.current;
        if (!replayer) return;
        const offset = Math.max(0, Math.min(ms, total));
        setCurrent(offset);
        if (playing) replayer.play(offset);
        else replayer.pause(offset);
    };

    const toggle = () => {
        const replayer = replayerRef.current;
        if (!replayer) return;
        if (playing) {
            replayer.pause();
            setPlaying(false);
        } else {
            const offset = current >= total ? 0 : current;
            replayer.play(offset);
            setPlaying(true);
        }
    };

    if (failed) {
        return (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                This recording could not be replayed.
            </div>
        );
    }

    return (
        <div>
            <div ref={boxRef} style={{
                width: '100%',
                height: size.height * scale,
                overflow: 'hidden',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'center',
            }}>
                <div style={{ width: size.width * scale, height: size.height * scale }}>
                    <div
                        ref={frameRef}
                        className="tf-replay"
                        style={{
                            width: size.width,
                            height: size.height,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                        }}
                    />
                </div>
            </div>

            <div
                role="slider"
                aria-label="Playback position"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={current}
                tabIndex={0}
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    seek(((e.clientX - rect.left) / rect.width) * total);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') seek(current - 5000);
                    if (e.key === 'ArrowRight') seek(current + 5000);
                }}
                style={{
                    marginTop: 'var(--space-lg)',
                    height: '6px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                }}
            >
                <div style={{
                    height: '100%',
                    width: `${total ? Math.min(100, (current / total) * 100) : 0}%`,
                    background: 'var(--color-accent-primary)',
                    borderRadius: 'var(--radius-full)',
                }} />
            </div>

            <div className="flex items-center justify-between" style={{ marginTop: 'var(--space-md)' }}>
                <div className="flex items-center gap-md">
                    <button onClick={() => seek(current - 10000)} className="btn btn-ghost" style={{ padding: 'var(--space-sm)' }} aria-label="Back 10 seconds">
                        <SkipBack size={18} />
                    </button>
                    <button
                        onClick={toggle}
                        className="btn btn-primary"
                        aria-label={playing ? 'Pause' : 'Play'}
                        style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-full)', padding: 0, justifyContent: 'center' }}
                    >
                        {playing ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                    <button onClick={() => seek(current + 10000)} className="btn btn-ghost" style={{ padding: 'var(--space-sm)' }} aria-label="Forward 10 seconds">
                        <SkipForward size={18} />
                    </button>
                </div>

                <div className="flex items-center gap-md">
                    <span style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>
                        {formatTime(current)} / {formatTime(total)}
                    </span>
                    <select
                        aria-label="Playback speed"
                        value={speed}
                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        className="input"
                        style={{ width: 'auto', padding: 'var(--space-xs) var(--space-sm)' }}
                    >
                        <option value="0.5">0.5x</option>
                        <option value="1">1x</option>
                        <option value="2">2x</option>
                        <option value="4">4x</option>
                    </select>
                </div>
            </div>
        </div>
    );
}
