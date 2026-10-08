import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  addPaintEntry,
  getPaintSnapshot,
  subscribePaint,
  undoPaintEntry,
  visibleStrokeCount,
  type PaintEntry,
  type PaintPoint,
  type Stroke,
} from './paintStore';
import styles from './tools.module.css';

type PaintTool = Stroke['color'];

export function Paint({ sessionId, active = true }: { sessionId: string; active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<{ pointerId: number; sessionId: string; stroke: Stroke } | null>(null);
  const [tool, setTool] = useState<PaintTool>('black');
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
    const stroke: Stroke = { color: tool, points: [pointFromEvent(event)] };
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

  const preventFocus = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();
  const selectTool = (next: PaintTool) => () => setTool(next);
  const clear = () => { finishStroke(); addPaintEntry(sessionId, { clear: true }); };
  const undo = () => { finishStroke(); undoPaintEntry(sessionId); };

  return (
    <section className={styles.paintPanel} aria-label="그림판">
      <div className={styles.paintToolbar}>
        <button type="button" tabIndex={-1} onMouseDown={preventFocus} onClick={selectTool('black')} className={styles.paintButton} aria-pressed={tool === 'black'}>검정 펜</button>
        <button type="button" tabIndex={-1} onMouseDown={preventFocus} onClick={selectTool('red')} className={styles.paintButton} aria-pressed={tool === 'red'}>빨강 펜</button>
        <button type="button" tabIndex={-1} onMouseDown={preventFocus} onClick={selectTool('eraser')} className={styles.paintButton} aria-pressed={tool === 'eraser'}>지우개</button>
        <button type="button" tabIndex={-1} onMouseDown={preventFocus} onClick={clear} className={styles.paintButton}>전체 지우기</button>
        <button type="button" tabIndex={-1} onMouseDown={preventFocus} onClick={undo} className={styles.paintButton}>실행 취소</button>
      </div>
      <canvas
        ref={canvasRef}
        className={styles.paintCanvas}
        data-testid="paint-canvas"
        data-strokes={visibleStrokeCount(entries)}
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
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke): void {
  const { points } = stroke;
  if (points.length === 0) return;
  context.save();
  context.globalCompositeOperation = stroke.color === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color === 'red' ? '#d22' : '#111';
  context.fillStyle = context.strokeStyle;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = stroke.color === 'eraser' ? 18 : 3;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
  context.restore();
}
