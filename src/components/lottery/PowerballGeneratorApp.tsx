import React, { useMemo, useState } from "react";
import { HigButton, HigField, InfoHelp } from "../shared/HigControls";
import {
  AUSTRALIAN_POWERBALL_CONFIG,
  buildPowerballEntryProfile,
  clampPowerballEntryCount,
  formatPowerballEntriesCsv,
  generatePowerballEntries,
  summarizePowerballEntries,
  type PowerballEntry,
} from "../../lottery/powerball";

const generatedAtLabel = (date: Date | null): string => (
  date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not generated yet"
);

const PowerballNumber: React.FC<{ value: number; variant?: "main" | "powerball" }> = ({
  value,
  variant = "main",
}) => (
  <span className={`powerball-number powerball-number--${variant}`}>
    {value}
  </span>
);

const PowerballEntryRow: React.FC<{ entry: PowerballEntry; index: number }> = ({ entry, index }) => {
  const profile = buildPowerballEntryProfile(entry);

  return (
    <article className="powerball-entry" aria-label={`Generated Powerball entry ${index + 1}`}>
      <div className="powerball-entry__header">
        <span className="powerball-entry__index">Entry {index + 1}</span>
        <span className="powerball-entry__meta">
          Sum {profile.sum} · Odd/even {profile.odd}:{profile.even} · Low/high {profile.low}:{profile.high}
        </span>
      </div>
      <div className="powerball-entry__numbers" aria-label={`Main numbers ${entry.main.join(", ")} and Powerball ${entry.powerball}`}>
        <div className="powerball-entry__main-numbers">
          {entry.main.map((number) => (
            <PowerballNumber key={number} value={number} />
          ))}
        </div>
        <div className="powerball-entry__powerball">
          <span className="powerball-entry__powerball-label">PB</span>
          <PowerballNumber value={entry.powerball} variant="powerball" />
        </div>
      </div>
      <dl className="powerball-entry__bands" aria-label="Main number band counts">
        {profile.bandCounts.map((band) => (
          <div key={band.label} className="powerball-entry__band">
            <dt>{band.label}</dt>
            <dd>{band.count}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
};

export const PowerballGeneratorApp: React.FC = () => {
  const [entryCount, setEntryCount] = useState<number>(AUSTRALIAN_POWERBALL_CONFIG.defaultGeneratedEntries);
  const [entries, setEntries] = useState<PowerballEntry[]>(() => (
    generatePowerballEntries(AUSTRALIAN_POWERBALL_CONFIG.defaultGeneratedEntries)
  ));
  const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(() => new Date());
  const [copyStatus, setCopyStatus] = useState("");
  const summary = useMemo(() => summarizePowerballEntries(entries), [entries]);
  const csvText = useMemo(() => formatPowerballEntriesCsv(entries), [entries]);

  const handleGenerate = () => {
    setEntries(generatePowerballEntries(entryCount));
    setLastGeneratedAt(new Date());
    setCopyStatus("");
  };

  const handleEntryCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEntryCount(clampPowerballEntryCount(Number(event.currentTarget.value)));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(csvText);
      setCopyStatus("Copied generated entries as CSV.");
    } catch {
      setCopyStatus("CSV is ready below; copy is unavailable in this browser context.");
    }
  };

  return (
    <section className="powerball-app" aria-labelledby="powerball-title">
      <div className="powerball-app__hero">
        <div className="powerball-app__hero-copy">
          <h1 id="powerball-title">Australian Powerball generator</h1>
          <p>
            Generate entry lines using seven main numbers from 1-35 and one separate Powerball from 1-20.
            Output is random and diagnostic only, not a prediction or probability claim.
          </p>
        </div>
        <div className="powerball-app__rule-strip" aria-label="Powerball draw shape">
          <div>
            <span className="powerball-app__rule-value">7</span>
            <span className="powerball-app__rule-label">main numbers</span>
          </div>
          <div>
            <span className="powerball-app__rule-value">1-35</span>
            <span className="powerball-app__rule-label">main pool</span>
          </div>
          <div>
            <span className="powerball-app__rule-value">1</span>
            <span className="powerball-app__rule-label">Powerball</span>
          </div>
          <div>
            <span className="powerball-app__rule-value">1-20</span>
            <span className="powerball-app__rule-label">Powerball pool</span>
          </div>
        </div>
      </div>

      <div className="powerball-generator">
        <div className="powerball-generator__controls">
          <HigField
            label={(
              <span className="powerball-generator__field-label">
                Entries
                <InfoHelp label="Powerball entry count help">
                  Generate between 1 and {AUSTRALIAN_POWERBALL_CONFIG.maxGeneratedEntries} independent entry lines.
                </InfoHelp>
              </span>
            )}
            help={`Choose 1-${AUSTRALIAN_POWERBALL_CONFIG.maxGeneratedEntries} rows for this batch.`}
            className="powerball-generator__entry-count"
          >
            <input
              type="number"
              min={1}
              max={AUSTRALIAN_POWERBALL_CONFIG.maxGeneratedEntries}
              value={entryCount}
              onChange={handleEntryCountChange}
            />
          </HigField>
          <div className="powerball-generator__actions">
            <HigButton variant="primary" onClick={handleGenerate}>
              Generate entries
            </HigButton>
            <HigButton variant="secondary" onClick={handleCopy} disabled={entries.length === 0}>
              Copy CSV
            </HigButton>
            <HigButton
              variant="quiet"
              onClick={() => {
                setEntries([]);
                setLastGeneratedAt(null);
                setCopyStatus("");
              }}
              disabled={entries.length === 0}
            >
              Clear
            </HigButton>
          </div>
        </div>

        <div className="powerball-generator__status-row">
          <span>Last generated: {generatedAtLabel(lastGeneratedAt)}</span>
          {copyStatus ? <span role="status">{copyStatus}</span> : null}
        </div>

        <div className="powerball-summary" aria-label="Generated batch summary">
          <div>
            <span className="powerball-summary__value">{summary.entryCount}</span>
            <span className="powerball-summary__label">entries</span>
          </div>
          <div>
            <span className="powerball-summary__value">{summary.distinctMainNumbers}</span>
            <span className="powerball-summary__label">main numbers used</span>
          </div>
          <div>
            <span className="powerball-summary__value">{summary.mainCoveragePercent}%</span>
            <span className="powerball-summary__label">main pool coverage</span>
          </div>
          <div>
            <span className="powerball-summary__value">{summary.distinctPowerballs}</span>
            <span className="powerball-summary__label">Powerballs used</span>
          </div>
          <div>
            <span className="powerball-summary__value">{summary.averageMainSum}</span>
            <span className="powerball-summary__label">average main sum</span>
          </div>
          <div>
            <span className="powerball-summary__value">{summary.oddEvenLabel}</span>
            <span className="powerball-summary__label">batch odd/even</span>
          </div>
        </div>

        {entries.length > 0 ? (
          <div className="powerball-entry-list" aria-live="polite">
            {entries.map((entry, index) => (
              <PowerballEntryRow key={entry.id} entry={entry} index={index} />
            ))}
          </div>
        ) : (
          <div className="powerball-empty-state" role="status">
            Generate a batch to show Powerball entry lines.
          </div>
        )}

        <div className="powerball-generator__csv" aria-label="Generated entries CSV preview">
          <label htmlFor="powerball-csv-output">CSV preview</label>
          <textarea id="powerball-csv-output" value={csvText} readOnly rows={Math.min(10, Math.max(4, entries.length + 1))} />
        </div>

        <div className="powerball-resources" aria-label="Powerball reference resources">
          <span>References for future expansion</span>
          <a href={AUSTRALIAN_POWERBALL_CONFIG.sourceUrls.theLott} target="_blank" rel="noreferrer">
            The Lott how to play
          </a>
          <a href={AUSTRALIAN_POWERBALL_CONFIG.sourceUrls.lottolyzer} target="_blank" rel="noreferrer">
            Lottolyzer summary
          </a>
        </div>
      </div>
    </section>
  );
};
