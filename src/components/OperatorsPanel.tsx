import React from "react";
import { OperatorSlider } from "./OperatorSlider";
import { OperatorsPanelProps } from "../types";

export function OperatorsPanel({
  entropy,
  setEntropy,
  entropyEnabled,
  setEntropyEnabled,
  hamming,
  setHamming,
  hammingEnabled,
  setHammingEnabled,
  jaccard,
  setJaccard,
  jaccardEnabled,
  setJaccardEnabled,
  lambda,
  setLambda,
  minRecentMatches,
  setMinRecentMatches,
  recentMatchBias,
  setRecentMatchBias,
  previewStats,
  gpwfEnabled,
  setGPWFEnabled,
  gpwf_window_size,
  setGPWFWindowSize,
  maxGPWFWindow,
  gpwf_bias_factor,
  setGPWFBiasFactor,
  gpwf_floor,
  setGPWFFloor,
  gpwf_scale_multiplier,
  setGPWFScaleMultiplier,
  mcLayout,
  setMcLayout,
  mcColumns,
  setMcColumns,
}: OperatorsPanelProps) {
  return (
    <section style={{
      border: "1px solid #eee",
      borderRadius: 8,
      padding: 24,
      margin: "24px 0",
      background: "#fafcff"
    }}>
      <div style={{ display: "flex", gap: 30 }}>
        {/* Column 1: Entropy, Hamming, Jaccard */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 10 }}>
            <label>
              <input
                type="checkbox"
                checked={entropyEnabled}
                onChange={e => setEntropyEnabled(e.target.checked)}
                style={{ marginRight: 7 }}
              />
              <b>Entropy Threshold</b>
            </label>
          </div>
          <OperatorSlider
            label=""
            min={0}
            max={1}
            step={0.01}
            value={entropy}
            onChange={setEntropy}
            tooltip="Normalized Shannon entropy (0..1) over 8 spokes; higher = more evenly spread across the board."
            marks={[
              { value: 0, label: "Clustered" },
              { value: 0.5, label: "Balanced" },
              { value: 1, label: "Spread" }
            ]}
            preview={`${previewStats.entropy}/100 candidates pass`}
            disabled={!entropyEnabled}
          />
          <div style={{ marginBottom: 10 }}>
            <label>
              <input
                type="checkbox"
                checked={hammingEnabled}
                onChange={e => setHammingEnabled(e.target.checked)}
                style={{ marginRight: 7 }}
              />
              <b>Hamming Distance</b>
            </label>
          </div>
          <OperatorSlider
            label=""
            min={0}
            max={6}
            step={1}
            value={hamming}
            onChange={setHamming}
            tooltip="Set-based distance from history: 6 − overlap with any past main draw. Higher values enforce novelty."
            marks={[
              { value: 0, label: "Allow repeats" },
              { value: 3, label: "Balanced" },
              { value: 6, label: "Very Novel" }
            ]}
            preview={`${previewStats.hamming}/100 candidates pass`}
            disabled={!hammingEnabled}
          />
          <div style={{ marginBottom: 10 }}>
            <label>
              <input
                type="checkbox"
                checked={jaccardEnabled}
                onChange={e => setJaccardEnabled(e.target.checked)}
                style={{ marginRight: 7 }}
              />
              <b>Jaccard Threshold</b>
            </label>
          </div>
          <OperatorSlider
            label=""
            min={0}
            max={1}
            step={0.01}
            value={jaccard}
            onChange={setJaccard}
            tooltip="Maximum allowed similarity (main-only) with any past draw. Lower = more unique."
            marks={[
              { value: 0, label: "Unique" },
              { value: 0.5, label: "Balanced" },
              { value: 1, label: "Copycats" }
            ]}
            preview={`${previewStats.jaccard}/100 candidates pass`}
            disabled={!jaccardEnabled}
          />
        </div>
        {/* Column 2 and 3 unchanged */}
        <div style={{ flex: 1 }}>
          <OperatorSlider
            label="Lambda (Recency Weight)"
            min={0.2}
            max={0.99}
            step={0.01}
            value={lambda}
            onChange={setLambda}
            tooltip="Controls how much recent draws influence analytics. Right = only recent draws matter, Left = full history matters."
            marks={[
              { value: 0.2, label: "Oldest matter" },
              { value: 0.6, label: "Balanced" },
              { value: 0.99, label: "Recent only" }
            ]}
            preview={null}
          />
          <OperatorSlider
            label="Min Recent Matches"
            min={0}
            max={8}
            step={1}
            value={minRecentMatches}
            onChange={setMinRecentMatches}
            tooltip="Minimum numbers in candidate that must match the most recent draw. 0 = no requirement."
            marks={[
              { value: 0, label: "No requirement" },
              { value: 4, label: "4+" },
              { value: 8, label: "All match" }
            ]}
            preview={minRecentMatches === 0 ? "No filter" : `≥${minRecentMatches} match recent`}
          />
          <OperatorSlider
            label="Recent Match Bias"
            min={0}
            max={1}
            step={0.05}
            value={recentMatchBias}
            onChange={setRecentMatchBias}
            tooltip="Bias toward candidates with more numbers matching the most recent draw. 0 = off, 1 = only candidates with all numbers matching will always pass."
            marks={[
              { value: 0, label: "Off" },
              { value: 0.5, label: "Medium" },
              { value: 1, label: "Strong" }
            ]}
            preview={recentMatchBias === 0 ? "No bias" : `Bias: ${recentMatchBias}`}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 10 }}>
            <label>
              <input
                type="checkbox"
                checked={gpwfEnabled}
                onChange={e => setGPWFEnabled(e.target.checked)}
                style={{ marginRight: 7 }}
              />
              <b>GPWF (Weighted Frequency)</b>
            </label>
          </div>
          <OperatorSlider
            label="GPWF Window Size"
            min={3}
            max={maxGPWFWindow}
            step={1}
            value={gpwf_window_size}
            onChange={setGPWFWindowSize}
            tooltip={`How many recent draws GPWF considers. Up to ${maxGPWFWindow} (matches your current history).`}
            preview={`${gpwf_window_size} draws`}
            disabled={!gpwfEnabled}
          />
          <OperatorSlider
            label="GPWF Bias Factor"
            min={0}
            max={1}
            step={0.01}
            value={gpwf_bias_factor}
            onChange={setGPWFBiasFactor}
            tooltip="Boosts the score for candidates frequent in recent draws. 0 = no bias, 1 = max bias."
            preview={`Bias: ${gpwf_bias_factor}`}
            disabled={!gpwfEnabled}
          />
          <OperatorSlider
            label="GPWF Floor"
            min={0}
            max={1}
            step={0.01}
            value={gpwf_floor}
            onChange={setGPWFFloor}
            tooltip="Minimum possible GPWF score for any candidate. Raises the baseline so no candidate is scored too low."
            preview={`Floor: ${gpwf_floor}`}
            disabled={!gpwfEnabled}
          />
          <OperatorSlider
            label="GPWF Scale Multiplier"
            min={0}
            max={1}
            step={0.01}
            value={gpwf_scale_multiplier}
            onChange={setGPWFScaleMultiplier}
            tooltip="How much frequency in recent draws influences GPWF. Higher = frequency matters more."
            preview={`Scale: ${gpwf_scale_multiplier}`}
            disabled={!gpwfEnabled}
          />
        </div>

        {/* Global MC Layout controls (unchanged) */}
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "#fafafa",
            border: "1px solid #eee",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <b>Global Monte Carlo Layout:</b>

          <div style={{ display: "inline-flex", border: "1px solid #ccc", borderRadius: 6, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setMcLayout("grid")}
              style={{
                padding: "6px 10px",
                background: mcLayout === "grid" ? "#ffd700" : "#fff",
                border: "none",
                cursor: "pointer",
                fontWeight: mcLayout === "grid" ? 700 : 500,
              }}
              aria-pressed={mcLayout === "grid"}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setMcLayout("table")}
              style={{
                padding: "6px 10px",
                background: mcLayout === "table" ? "#ffd700" : "#fff",
                borderLeft: "1px solid #ccc",
                borderRight: "none",
                borderTop: "none",
                borderBottom: "none",
                cursor: "pointer",
                fontWeight: mcLayout === "table" ? 700 : 500,
              }}
              aria-pressed={mcLayout === "table"}
            >
              Table
            </button>
          </div>

          <label>
            <b>Columns:</b>{" "}
            <input
              type="number"
              min={1}
              max={12}
              value={mcColumns}
              onChange={(e) =>
                setMcColumns(Math.max(1, Math.min(12, Number(e.target.value) || 1)))
              }
              style={{ width: 70 }}
            />
          </label>

          <span style={{ color: "#666", fontSize: 13 }}>
            Tip: 12 columns + Grid is a compact, high-density view.
          </span>
        </div>
      </div>
    </section>
  );
}