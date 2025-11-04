import React, { useEffect, useMemo, useState } from "react";
import type { NumberExample } from "../lib/churnFeatures";

type Props = {
  dataset: NumberExample[];
  onPredictions?: (pred: { number: number; pReturn: number }[]) => void;
  modelType?: "logreg" | "rf";
  totalDraws?: number;   // pass filteredHistory.length
  minDraws?: number;     // default 36
};

export const ReturnPredictor: React.FC<Props> = ({
  dataset,
  onPredictions,
  modelType = "logreg",
  totalDraws = 0,
  minDraws = 36,
}) => {
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<{ acc?: number; prec?: number; rec?: number } | null>(null);
  const [rfAvailable, setRfAvailable] = useState(true);

  // Until returnLabel is computed, skip entries without labels
  const filtered = useMemo(
    () => dataset.filter(d => d.churnLabel === 1 && d.returnLabel != null),
    [dataset]
  );
  const hasEnough = (totalDraws ?? 0) >= (minDraws ?? 36);
  const wantRF = modelType === "rf";
  const canRF = wantRF && rfAvailable;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await import(/* @vite-ignore */ "scikitjs");
      } catch {
        if (mounted) setRfAvailable(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function trainAndPredict() {
    setBusy(true);
    try {
      const X = filtered.map(r => [
        r.freqFortnight, r.freqMonth, r.freqQuarter,
        r.tenure, r.timeSinceLast, r.zpaGroup,
      ]);
      const y = filtered.map(r => r.returnLabel!);
      const numbers = filtered.map(r => r.number);
      if (!X.length) { setMetrics(null); onPredictions?.([]); return; }

      const split = Math.max(1, Math.floor(0.8 * X.length));
      const Xtrain = X.slice(0, split), ytrain = y.slice(0, split);
      const Xtest = X.slice(split), ytest = y.slice(split);
      const numbersTest = numbers.slice(split);
      let pTest: number[] = [];

      if (canRF) {
        try {
          const tf = await import("@tensorflow/tfjs");
          const sk: any = await import(/* @vite-ignore */ "scikitjs");
          sk.setBackend(tf);
          const { RandomForestClassifier } = sk;
          const rf = new RandomForestClassifier({ nEstimators: 50, maxDepth: 6 });
          await rf.fit(Xtrain, ytrain);
          const proba = await rf.predictProba(Xtest);
          pTest = proba.map((row: number[]) => row[1]);
        } catch (err) {
          console.warn("Random Forest unavailable; falling back to logistic regression", err);
          const tf = await import("@tensorflow/tfjs");
          const Xt = tf.tensor2d(Xtrain), yt = tf.tensor2d(ytrain.map(v => [v]));
          const model = tf.sequential();
          model.add(tf.layers.dense({ inputShape: [Xtrain[0].length], units: 1, activation: "sigmoid" }));
          model.compile({ optimizer: tf.train.adam(0.05), loss: "binaryCrossentropy" });
          await model.fit(Xt, yt, { epochs: 50, batchSize: 16, verbose: 0 });
          const Xv = tf.tensor2d(Xtest);
          const preds = (model.predict(Xv) as any).dataSync() as Float32Array;
          pTest = Array.from(preds).map((p) => Math.min(0.999, Math.max(0.001, p)));
        }
      } else {
        const tf = await import("@tensorflow/tfjs");
        const Xt = tf.tensor2d(Xtrain), yt = tf.tensor2d(ytrain.map(v => [v]));
        const model = tf.sequential();
        model.add(tf.layers.dense({ inputShape: [Xtrain[0].length], units: 1, activation: "sigmoid" }));
        model.compile({ optimizer: tf.train.adam(0.05), loss: "binaryCrossentropy" });
        await model.fit(Xt, yt, { epochs: 50, batchSize: 16, verbose: 0 });
        const Xv = tf.tensor2d(Xtest);
        const preds = (model.predict(Xv) as any).dataSync() as Float32Array;
        pTest = Array.from(preds).map((p) => Math.min(0.999, Math.max(0.001, p)));
      }

      const yhat = pTest.map(p => (p >= 0.5 ? 1 : 0));
      const tp = yhat.filter((v, i) => v === 1 && ytest[i] === 1).length;
      const fp = yhat.filter((v, i) => v === 1 && ytest[i] === 0).length;
      const tn = yhat.filter((v, i) => v === 0 && ytest[i] === 0).length;
      const fn = yhat.filter((v, i) => v === 0 && ytest[i] === 1).length;
      const acc = (tp + tn) / (tp + fp + tn + fn || 1);
      const prec = tp / (tp + fp || 1);
      const rec = tp / (tp + fn || 1);
      setMetrics({ acc, prec, rec });

      onPredictions?.(numbersTest.map((n, i) => ({ number: n, pReturn: pTest[i] ?? 0 })));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: 12, marginTop: 10 }}>
      <h4>Return Predictor ({canRF ? "rf" : "logreg"})</h4>
      {wantRF && !rfAvailable && (
        <div style={{ color: "#b26a00", marginBottom: 6, fontSize: 13 }}>
          Random Forest not available; falling back to logistic regression.
        </div>
      )}
      {!hasEnough && (
        <div style={{ color: "#b26a00", marginBottom: 6, fontSize: 13 }}>
          Need at least {minDraws} draws (have {totalDraws}) to train reliably.
        </div>
      )}
      <button onClick={trainAndPredict} disabled={busy || !hasEnough}>
        {busy ? "Training…" : "Train & Predict"}
      </button>
      {metrics && (
        <div style={{ marginTop: 6, fontSize: 13 }}>
          acc {(metrics.acc ?? 0).toFixed(2)}, prec {(metrics.prec ?? 0).toFixed(2)}, rec {(metrics.rec ?? 0).toFixed(2)}
        </div>
      )}
    </section>
  );
};