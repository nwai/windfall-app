import React, { useState } from "react";
import { LOTTERY_GAME_ORDER, LOTTERY_GAMES, type LotteryGameId } from "../../lottery/games";
import { PowerballGeneratorApp } from "./PowerballGeneratorApp";

interface LotteryPlatformShellProps {
  windfallExperience: React.ReactNode;
  initialGameId?: LotteryGameId;
}

export const LotteryPlatformShell: React.FC<LotteryPlatformShellProps> = ({
  windfallExperience,
  initialGameId = "windfall",
}) => {
  const [activeGameId, setActiveGameId] = useState<LotteryGameId>(initialGameId);
  const activeGame = LOTTERY_GAMES[activeGameId];

  return (
    <div className="lottery-platform">
      <header className="lottery-platform__header">
        <div className="lottery-platform__copy">
          <p className="lottery-platform__label">Lottery workspace</p>
          <h1>{activeGame.name}</h1>
          <p>{activeGame.description}</p>
        </div>
        <div className="lottery-platform__switcher" aria-label="Lottery game">
          <span className="lottery-platform__switcher-label">Pick a game</span>
          <div className="lottery-platform__segments">
            {LOTTERY_GAME_ORDER.map((gameId) => {
              const game = LOTTERY_GAMES[gameId];
              const selected = gameId === activeGameId;

              return (
                <button
                  key={game.id}
                  type="button"
                  className="lottery-platform__segment"
                  aria-pressed={selected}
                  onClick={() => setActiveGameId(game.id)}
                >
                  <span>{game.shortName}</span>
                  <small>{game.statusLabel}</small>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="lottery-platform__game-summary" aria-live="polite">
        <span>{activeGame.drawSummary}</span>
      </div>

      <main className="lottery-platform__content">
        {activeGameId === "windfall" ? windfallExperience : <PowerballGeneratorApp />}
      </main>
    </div>
  );
};
