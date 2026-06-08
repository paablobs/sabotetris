import { useEffect, useRef } from 'react';
import { SabotetrisGame } from '../engine/Game';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<SabotetrisGame | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
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
    };
  }, []);

  return <div ref={containerRef} id="game-container" />;
}

export default App;
