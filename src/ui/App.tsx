import { useEffect, useRef, useState } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../types';
import { SabotetrisGame } from '../engine/Game';

function computeScale(): number {
  if (typeof window === 'undefined') return 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return Math.min(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT, 1);
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<SabotetrisGame | null>(null);
  const [scale, setScale] = useState<number>(computeScale);

  useEffect(() => {
    const onResize = () => setScale(computeScale());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.width = `${CANVAS_WIDTH * scale}px`;
    canvas.style.height = `${CANVAS_HEIGHT * scale}px`;
  }, [scale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.style.width = `${CANVAS_WIDTH * scale}px`;
    canvas.style.height = `${CANVAS_HEIGHT * scale}px`;
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const game = new SabotetrisGame(canvas);
    gameRef.current = game;
    game.start();

    return () => {
      const g = gameRef.current;
      if (g) {
        g.stop();
        gameRef.current = null;
      }
      const c = container.querySelector('canvas');
      if (c) c.remove();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} id="game-container" />;
}

export default App;
