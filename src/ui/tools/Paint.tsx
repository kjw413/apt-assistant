import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useSyncExternalStore } from 'react';
import {
  addPaintEntry,
  getPaintSnapshot,
  subscribePaint,
  visibleStrokeCount,
  type PaintEntry,
  type PaintPoint,
  type Stroke,
} from './paintStore';
import styles from './tools.module.css';

export type PaintHandle = { clear: () => void };

export const Paint = forwardRef<PaintHandle, { sessionId: string; active?: boolean; penWidth: number }>(function Paint({ sessionId, active = true, penWidth }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<{ pointerId: number; sessionId: string; stroke: Stroke } | null>(null);
  const entries = useSyncExternalStore(
    (listener) => subscribePaint(sessionId, listener),
    () => getPaintSnapshot(sessionId),
    () => getPaintSnapshot(sessionId),
  );

  const redraw = useCallback((allEntries: readonly PaintEntry[] = entries) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const cssWidth = canvas.width / ratio;
    const cssHeight = canvas.height / ratio;
    context.clearRect(0, 0, cssWidth, cssHeight);
    let start = 0;
    for (let index = allEntries.length - 1; index >= 0; index -= 1) {
      if ('clear' in allEntries[index]) { start = index + 1; break; }
    }
    for (const entry of allEntries.slice(start)) {
      if (!('points' in entry)) continue;
      drawStroke(context, entry);
    }
    const drawing = drawingRef.current;
    if (drawing?.sessionId === sessionId) drawStroke(context, drawing.stroke);
  }, [entries, sessionId]);

  useEffect(() => { redraw(); }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (width === 0 || height === 0) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      redraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [redraw]);

  const finishStroke = useCallback((pointerId?: number) => {
    const drawing = drawingRef.current;
    if (!drawing || (pointerId !== undefined && drawing.pointerId !== pointerId)) return;
    drawingRef.current = null;
    addPaintEntry(drawing.sessionId, drawing.stroke);
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(drawing.pointerId)) canvas.releasePointerCapture(drawing.pointerId);
  }, []);

  useEffect(() => () => finishStroke(), [sessionId, finishStroke]);

  useEffect(() => {
    if (!active) finishStroke();
  }, [active, finishStroke]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): PaintPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active || event.button !== 0 || drawingRef.current) return;
    const stroke: Stroke = { width: penWidth, points: [pointFromEvent(event)] };
    drawingRef.current = { pointerId: event.pointerId, sessionId, stroke };
    event.currentTarget.setPointerCapture(event.pointerId);
    redraw();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drawing = drawingRef.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    drawing.stroke.points.push(pointFromEvent(event));
    redraw();
  };

  const clear = () => { finishStroke(); addPaintEntry(sessionId, { clear: true }); };

  useImperativeHandle(ref, () => ({ clear }), [sessionId, finishStroke]);

  return (
    <section className={styles.paintPanel} aria-label="그림판">
      <canvas
        ref={canvasRef}
        className={styles.paintCanvas}
        data-testid="paint-canvas"
        data-strokes={visibleStrokeCount(entries)}
        data-pen-width={penWidth}
        aria-label="그림판 캔버스"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          const drawing = drawingRef.current;
          if (drawing?.pointerId === event.pointerId) drawing.stroke.points.push(pointFromEvent(event));
          finishStroke(event.pointerId);
        }}
        onPointerCancel={(event) => finishStroke(event.pointerId)}
        onLostPointerCapture={(event) => finishStroke(event.pointerId)}
      />
    </section>
  );
});

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke): void {
  const { points } = stroke;
  if (points.length === 0) return;
  const width = typeof stroke.width === 'number' ? stroke.width : 2;
  context.save();
  context.strokeStyle = '#1a1a1a';
  context.fillStyle = '#1a1a1a';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = width;
  context.beginPath();
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    // 볼펜처럼 매끈하게: 점 사이 중점을 지나는 2차 곡선
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i += 1) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      context.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    const end = points[points.length - 1];
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  context.restore();
}
