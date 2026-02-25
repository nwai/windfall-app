import React from "react";
import { OperatorSlider } from "./OperatorSlider";
import { OperatorsPanelProps } from "../types";

export function OperatorsPanel(props: OperatorsPanelProps) {
  const {
    entropy, setEntropy, entropyEnabled, setEntropyEnabled,
    hamming, setHamming, hammingEnabled, setHammingEnabled,
    jaccard, setJaccard, jaccardEnabled, setJaccardEnabled,
    lambdaEnabled, setLambdaEnabled,
    lambda, setLambda,
    minRecentMatches, setMinRecentMatches,
    recentMatchBias, setRecentMatchBias,
    previewStats,
    gpwfEnabled, setGPWFEnabled,
    gpwf_window_size, setGPWFWindowSize, maxGPWFWindow,
    gpwf_bias_factor, setGPWFBiasFactor,
    gpwf_floor, setGPWFFloor,
    gpwf_scale_multiplier, setGPWFScaleMultiplier,
    octagonal_top, setOctagonalTop,
  } = props;

  return (
    <section
      style={{
        border: "1px solid #eee",
        borderRadius: 8,
        padding: 24,
        margin: "24px 0",
        background: "#fafcff",
    width: "100%",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(280px, 1fr))",
          gap: 30,
          paddingLeft: 8,
          paddingRight: 8,
        }}
      >
        {/* Column 1 */}
        <div>
          <div style={{ padding: 8, boxSizing: "border-box" }}>
            <label>
              <input
                type="checkbox"
                checked={entropyEnabled}
                onChange={(e) => setEntropyEnabled(e.target.checked)}
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
            tooltip="Normalized Shannon entropy (0..1). Higher = more even spread."
            marks={[
              { value: 0, label: "Clustered" },
              { value: 0.5, label: "Balanced" },
              { value: 1, label: "Spread" },
            ]}
            preview={`${previewStats.entropy}/100 candidates pass`}
            disabled={!entropyEnabled}
          />

          <div style={{ padding: 8, boxSizing: "border-box" }}>
            <label>
              <input
                type="checkbox"
                checked={hammingEnabled}
                onChange={(e) => setHammingEnabled(e.target.checked)}
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
            tooltip="6 − overlap with any past main draw (enforces novelty)."
            marks={[
              { value: 0, label: "Allow repeats" },
              { value: 3, label: "Balanced" },
              { value: 6, label: "Very Novel" },
            ]}
            preview={`${previewStats.hamming}/100 candidates pass`}
            disabled={!hammingEnabled}
          />

          <div style={{ padding: 8, boxSizing: "border-box" }}>
            <label>
              <input
                type="checkbox"
                checked={jaccardEnabled}
                onChange={(e) => setJaccardEnabled(e.target.checked)}
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
            tooltip="Max similarity (main-only) with any past draw."
            marks={[
              { value: 0, label: "Unique" },
              { value: 0.5, label: "Balanced" },
              { value: 1, label: "Copycats" },
            ]}
            preview={`${previewStats.jaccard}/100 candidates pass`}
            disabled={!jaccardEnabled}
          />
        </div>

        {/* Column 2 */}
        <div>
          <div style={{ padding: 8, boxSizing: "border-box" }}>
            <label>
              <input
                type="checkbox"
                checked={lambdaEnabled}
                onChange={(e) => setLambdaEnabled(e.target.checked)}
                style={{ marginRight: 7 }}
              />
              <b>Lambda (Recency Weight)</b>
            </label>
          </div>
           <OperatorSlider
             label="Lambda (Recency Weight)"
             min={0.2}
             max={0.99}
             step={0.01}
             value={lambda}
             onChange={setLambda}
             tooltip="Shift influence toward recent draws."
             marks={[
               { value: 0.2, label: "Oldest matter" },
               { value: 0.6, label: "Balanced" },
               { value: 0.99, label: "Recent only" },
             ]}
             preview={null}
             disabled={!lambdaEnabled}
           />
          <OperatorSlider
            label="Min Recent Matches"
            min={0}
            max={8}
            step={1}
            value={minRecentMatches}
            onChange={setMinRecentMatches}
            tooltip="Require at least N matches with the most recent draw."
            marks={[
              { value: 0, label: "None" },
              { value: 4, label: "4+" },
              { value: 8, label: "All" },
            ]}
            preview={
              minRecentMatches === 0
                ? "No filter"
                : `≥${minRecentMatches} match recent`
            }
          />
          <OperatorSlider
            label="Recent Match Bias"
            min={0}
            max={1}
            step={0.05}
            value={recentMatchBias}
            onChange={setRecentMatchBias}
            tooltip="Bias acceptance probability toward recent-draw matches."
            marks={[
              { value: 0, label: "Off" },
              { value: 0.5, label: "Mid" },
              { value: 1, label: "Strong" },
            ]}
            preview={
              recentMatchBias === 0 ? "No bias" : `Bias: ${recentMatchBias}`
            }
          />
        </div>

        {/* Column 3 */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <label>
              <input
                type="checkbox"
                checked={gpwfEnabled}
                onChange={(e) => setGPWFEnabled(e.target.checked)}
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
            tooltip={`Recent draws considered (≤ ${maxGPWFWindow}).`}
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
            tooltip="Strength of recent frequency weighting."
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
            tooltip="Minimum baseline weight."
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
            tooltip="Scales the effect of raw recent frequency."
            preview={`Scale: ${gpwf_scale_multiplier}`}
            disabled={!gpwfEnabled}
          />
          {/* NEW: OGA Top control */}
          <OperatorSlider
            label="OGA Top (Octagonal)"
            min={1}
            max={45}
            step={1}
            value={octagonal_top}
            onChange={setOctagonalTop}
            tooltip="Post-process: keep top-N by OGA (applied when OGA is enabled)."
            preview={`Top: ${octagonal_top}`}
          />
        </div>
      </div>
    </section>
  );
}
