import React, { useState, useRef, useEffect, useCallback } from "react";
import Papa from "papaparse";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const numberColorMap = {
  1: "#1abc9c", 2: "#25ccf7", 3: "#3867d6", 4: "#2d98da", 5: "#8854d0",
  6: "#fd9644", 7: "#f7b731", 8: "#6a89cc", 9: "#218c5b", 10: "#28abb9",
  11: "#43e97b", 12: "#f6416c", 13: "#ffb400", 14: "#3d84a8", 15: "#46cdcf",
  16: "#abedd8", 17: "#6a0572", 18: "#b83b5e", 19: "#f08a5d", 20: "#f9ed69",
  21: "#8c6239", 22: "#e6e6e6", 23: "#c69c6d", 24: "#808080", 25: "#c7b299",
  26: "#ffde17", 27: "#009245", 28: "#3f48cc", 29: "#d4145a", 30: "#ff6f61",
  31: "#fbb040", 32: "#b5bd00", 33: "#f15a29", 34: "#662d91", 35: "#00bff3",
  36: "#ed1e79", 37: "#00a99d", 38: "#39b54a", 39: "#92278f", 40: "#c1272d",
  41: "#8dc63f", 42: "#ffe600", 43: "#0072bc", 44: "#f7931e", 45: "#333333"
};

function parseDateString(str) {
  const parts = str.split("/");
  if (parts.length !== 3) return NaN;
  let [month, day, year] = parts.map(Number);
  if (year < 100) year += 2000;
  return new Date(year, month - 1, day).getTime();
}

function flattenDraws(data) {
  const keys = [
    "main1", "main2", "main3", "main4", "main5", "main6", "supp1", "supp2"
  ];
  const result = [];
  data.forEach((row, drawIndex) => {
    keys.forEach((k) => {
      if (row[k]) {
        result.push({
          date: row.date,
          number: Number(row[k]),
          isSupp: k === "supp1" || k === "supp2",
          fill: numberColorMap[row[k]] || "#000",
          drawIndex,
          numberIndex: Number(row[k]) - 1, // 0-based vertical index for even rows
        });
      }
    });
  });
  return result;
}

function parseCsvData(text) {
  const parsed = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true
  });
  return parsed.data.map((row) => ({
    ...row,
    main1: Number(row.main1),
    main2: Number(row.main2),
    main3: Number(row.main3),
    main4: Number(row.main4),
    main5: Number(row.main5),
    main6: Number(row.main6),
    supp1: Number(row.supp1),
    supp2: Number(row.supp2)
  }));
}

function formatDrawTick(idx) {
  return `Draw ${idx + 1}`;
}

const shapeBall = (props) => {
  const { cx, cy, payload } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={7}
      fill={payload.fill}
      stroke="#222"
      strokeWidth={1}
    />
  );
};

// FIX: Use <= in threshold check so "exactly on" the ball always counts
function findNearestBall(overlayPx, ballsPx, threshold = 12) {
  let minDist = Infinity;
  let nearest = null;
  for (let i = 0; i < ballsPx.length; ++i) {
    const b = ballsPx[i];
    const dx = overlayPx.x - b.x;
    const dy = overlayPx.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= threshold && d < minDist) {
      minDist = d;
      nearest = b;
    }
  }
  return nearest;
}

function GrayPreviewCircles({ show, overlayPos, ballsPx, ballsData, chartToSvg }) {
  if (!show || !overlayPos || !ballsPx || !ballsData || !chartToSvg || !ballsPx.length) return null;

  const nearest = findNearestBall(overlayPos, ballsPx, 12);
  let grayCircles = [];
  if (nearest) {
    const drawIndexes = Array.from(new Set(ballsData.map(b => b.drawIndex))).sort((a,b)=>a-b);
    const idx = drawIndexes.indexOf(nearest.drawIndex);

    let nextDrawIndex = null;
    if (idx >= 0 && idx < drawIndexes.length-1) {
      nextDrawIndex = drawIndexes[idx+1];
    } else if (idx === drawIndexes.length-1 && idx > 0) {
      nextDrawIndex = drawIndexes[drawIndexes.length-1] + 1;
    }
    if (nextDrawIndex !== null) {
      [nearest.numberIndex-1, nearest.numberIndex+1].forEach(numIdx => {
        if (numIdx >= 0 && numIdx < 45) {
          const {x, y} = chartToSvg({drawIndex: nextDrawIndex, numberIndex: numIdx});
          grayCircles.push(
            <circle
              key={numIdx}
              cx={x}
              cy={y}
              r={7}
              fill="none"
              stroke="#888"
              strokeWidth={1}
              style={{ pointerEvents: "none" }}
            />
          );
        }
      });
    }
  }
  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
        zIndex: 99,
      }}
      width="100%"
      height="100%"
    >
      {grayCircles}
    </svg>
  );
}

function DraggableResizableRotatableOverlay({
  parentWidth,
  parentHeight,
  crossLen,
  setCrossLen,
  rotation,
  setRotation,
  circleRadius = 7,
  minCrossLen = 100,
  maxCrossLen = 450,
  onOverlayMove,
  initialOnData: { initialX, initialY },
}) {
  const [pos, setPos] = useState({
    x: initialX !== undefined ? initialX : parentWidth / 2,
    y: initialY !== undefined ? initialY : parentHeight / 2,
  });
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState(null);
  const [rotating, setRotating] = useState(false);
  const [resizing, setResizing] = useState(false);
  const mainGroupRef = useRef();

  const handleSize = 10;
  const resizeHandle = {
    x: crossLen * Math.cos((45 * Math.PI) / 180),
    y: crossLen * Math.sin((45 * Math.PI) / 180),
  };
  const rotateHandle = {
    x: 0,
    y: -crossLen - 20,
  };

  useEffect(() => {
    if (onOverlayMove) onOverlayMove(pos);
  }, [pos.x, pos.y, onOverlayMove]);

  useEffect(() => {
    if (typeof initialX === "number" && typeof initialY === "number") {
      setPos({ x: initialX, y: initialY });
    }
  }, [initialX, initialY]);

  function onPointerDown(e) {
    if (e.target.dataset.handle === "resize") {
      setResizing(true);
      setLastMouse({
        x: e.clientX,
        y: e.clientY,
        startCrossLen: crossLen,
      });
    } else if (e.target.dataset.handle === "rotate") {
      setRotating(true);
      setLastMouse({
        x: e.clientX,
        y: e.clientY,
        angleAtStart: Math.atan2(e.clientY - pos.y, e.clientX - pos.x),
        rotationAtStart: rotation,
      });
    } else {
      setDragging(true);
      setLastMouse({ x: e.clientX, y: e.clientY });
      if (mainGroupRef.current) {
        mainGroupRef.current.focus();
      }
    }
  }
  function onPointerMove(e) {
    if (dragging && lastMouse) {
      setPos((pos) => ({
        x: Math.max(0, Math.min(parentWidth, pos.x + e.movementX)),
        y: Math.max(0, Math.min(parentHeight, pos.y + e.movementY)),
      }));
    }
    if (resizing && lastMouse) {
      const center = { x: pos.x, y: pos.y };
      const dx = e.clientX - center.x;
      const dy = e.clientY - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      setCrossLen(Math.max(minCrossLen, Math.min(maxCrossLen, dist)));
    }
    if (rotating && lastMouse) {
      const center = { x: pos.x, y: pos.y };
      const angle0 = lastMouse.angleAtStart;
      const angle1 = Math.atan2(e.clientY - center.y, e.clientX - center.x);
      const deltaDeg = ((angle1 - angle0) * 180) / Math.PI;
      setRotation((lastMouse.rotationAtStart + deltaDeg + 360) % 360);
    }
  }
  function onPointerUp() {
    setDragging(false);
    setResizing(false);
    setRotating(false);
    setLastMouse(null);
  }
  const handleKeyDown = useCallback(
    (e) => {
      if (
        document.activeElement !== mainGroupRef.current ||
        (dragging || resizing || rotating)
      ) {
        return;
      }
      let handled = false;
      let move = 1;
      if (e.shiftKey) move = 10;
      if (e.key === "ArrowLeft") {
        setPos((pos) => ({
          ...pos,
          x: Math.max(0, pos.x - move),
        }));
        handled = true;
      } else if (e.key === "ArrowRight") {
        setPos((pos) => ({
          ...pos,
          x: Math.min(parentWidth, pos.x + move),
        }));
        handled = true;
      } else if (e.key === "ArrowUp") {
        setPos((pos) => ({
          ...pos,
          y: Math.max(0, pos.y - move),
        }));
        handled = true;
      } else if (e.key === "ArrowDown") {
        setPos((pos) => ({
          ...pos,
          y: Math.min(parentHeight, pos.y + move),
        }));
        handled = true;
      } else if (e.key === "r" || e.key === "R") {
        setRotation((rot) => (rot + (e.shiftKey ? 10 : 1)) % 360);
        handled = true;
      } else if (e.key === "s" || e.key === "S") {
        setCrossLen((len) =>
          Math.max(
            minCrossLen,
            Math.min(maxCrossLen, len + (e.shiftKey ? 5 : 1))
          )
        );
        handled = true;
      } else if (e.key === "a" || e.key === "A") {
        setCrossLen((len) =>
          Math.max(
            minCrossLen,
            Math.min(maxCrossLen, len - (e.shiftKey ? 5 : 1))
          )
        );
        handled = true;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [parentWidth, parentHeight, dragging, resizing, rotating, minCrossLen, maxCrossLen, setCrossLen, setRotation]
  );

  useEffect(() => {
    if (mainGroupRef.current) {
      mainGroupRef.current.addEventListener("keydown", handleKeyDown);
      return () =>
        mainGroupRef.current &&
        mainGroupRef.current.removeEventListener("keydown", handleKeyDown);
    }
  }, [handleKeyDown]);

  useEffect(() => {
    if (dragging || resizing || rotating) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      return () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
    }
  }, [dragging, resizing, rotating, lastMouse, pos, crossLen, rotation]);

  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
        width: parentWidth,
        height: parentHeight,
        zIndex: 100,
      }}
      width={parentWidth}
      height={parentHeight}
    >
      <g
        ref={mainGroupRef}
        style={{ cursor: dragging ? "grabbing" : "grab", pointerEvents: "all" }}
        tabIndex={0}
        transform={`translate(${pos.x},${pos.y}) rotate(${rotation})`}
        onPointerDown={onPointerDown}
        aria-label="Draggable, rotatable, resizable circle-X overlay"
      >
        <circle
          cx={0}
          cy={0}
          r={circleRadius}
          fill="rgba(255,0,0,0.35)"
          stroke="red"
          strokeWidth={2}
        />
        <line
          x1={-crossLen}
          y1={-crossLen}
          x2={crossLen}
          y2={crossLen}
          stroke="red"
          strokeWidth={2}
        />
        <line
          x1={-crossLen}
          y1={crossLen}
          x2={crossLen}
          y2={-crossLen}
          stroke="red"
          strokeWidth={2}
        />
        <circle
          cx={resizeHandle.x}
          cy={resizeHandle.y}
          r={handleSize}
          fill="#fff"
          stroke="red"
          strokeWidth={2}
          data-handle="resize"
          style={{
            cursor: "nwse-resize",
            pointerEvents: "all",
          }}
        />
        <circle
          cx={rotateHandle.x}
          cy={rotateHandle.y}
          r={handleSize}
          fill="#fff"
          stroke="red"
          strokeWidth={2}
          data-handle="rotate"
          style={{
            cursor: "alias",
            pointerEvents: "all",
          }}
        />
        <path
          d={`M 0 ${-circleRadius}
            A ${circleRadius} ${circleRadius} 0 0 1 ${rotateHandle.x} ${rotateHandle.y + handleSize * 2}`}
          fill="none"
          stroke="red"
          strokeWidth={1}
          markerEnd="url(#arrowhead)"
        />
        <defs>
          <marker
            id="arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 6 3, 0 6" fill="red" />
          </marker>
        </defs>
      </g>
    </svg>
  );
}

export default function App() {
  const [flatData, setFlatData] = useState([]);
  const [originalFlatData, setOriginalFlatData] = useState([]);
  const [error, setError] = useState("");
  const svgExportRef = useRef();
  const [simulateNumbers, setSimulateNumbers] = useState(Array(8).fill(""));
  const [simError, setSimError] = useState("");
  const chartAreaRef = useRef();
  const [chartSize, setChartSize] = useState({ width: 800, height: 400 });
  const [rotation, setRotation] = useState(0);
  const [crossLen, setCrossLen] = useState(100);
  const minCrossLen = 100;
  const maxCrossLen = 450;
  const [showGrayPreview, setShowGrayPreview] = useState(false);
  const [overlayPos, setOverlayPos] = useState(null);

  const drawIndexes = flatData.length
    ? Array.from(new Set(flatData.map(d => d.drawIndex))).sort((a,b)=>a-b)
    : [0];
  const minDrawIndex = drawIndexes.length ? drawIndexes[0] : 0;
  const maxDrawIndex = drawIndexes.length ? drawIndexes[drawIndexes.length-1] : 0;

  const [chartToSvg, setChartToSvg] = useState(null);
  const [ballsPx, setBallsPx] = useState([]);
  const [initialOverlayXY, setInitialOverlayXY] = useState({ initialX: undefined, initialY: undefined });

  useEffect(() => {
    function updateSize() {
      if (chartAreaRef.current) {
        setChartSize({
          width: chartAreaRef.current.offsetWidth,
          height: chartAreaRef.current.offsetHeight,
        });
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!flatData.length || !chartSize.width || !chartSize.height) return;
    const xVals = flatData.map(d => d.drawIndex);
    const yVals = flatData.map(d => d.numberIndex);
    const xMin = Math.min(...xVals);
    const xMax = Math.max(...xVals);
    const yMin = 0; // 0-based index for even rows
    const yMax = 44; // 0-based index for even rows (45 balls)
    const margin = { top: 20, right: 30, bottom: 40, left: 40 };
    const svgWidth = chartSize.width;
    const svgHeight = chartSize.height;
    const plotWidth = svgWidth - margin.left - margin.right;
    const plotHeight = svgHeight - margin.top - margin.bottom;
    const xScale = d => margin.left + ((d - xMin) / (xMax - xMin || 1)) * plotWidth;
    const yScale = idx => margin.top + ((yMax - idx) / (yMax - yMin || 1)) * plotHeight;
    const fn = ({drawIndex, numberIndex}) => ({
      x: xScale(drawIndex),
      y: yScale(numberIndex),
    });
    setChartToSvg(() => fn);
    const pxBalls = flatData.map(d => ({
      drawIndex: d.drawIndex,
      numberIndex: d.numberIndex,
      ...fn({drawIndex: d.drawIndex, numberIndex: d.numberIndex})
    }));
    setBallsPx(pxBalls);

    const lastDrawIndex = Math.max(...flatData.map(d => d.drawIndex));
    const ball22 = pxBalls.find(
      b => b.drawIndex === lastDrawIndex && b.numberIndex === 21
    );
    if (ball22) {
      setInitialOverlayXY({ initialX: ball22.x, initialY: ball22.y });
    } else {
      setInitialOverlayXY({ initialX: undefined, initialY: undefined });
    }
  }, [flatData, chartSize.width, chartSize.height]);

  useEffect(() => {
    if (
      showGrayPreview && !overlayPos &&
      ballsPx && ballsPx.length && chartToSvg && initialOverlayXY.initialX && initialOverlayXY.initialY
    ) {
      setOverlayPos({ x: initialOverlayXY.initialX, y: initialOverlayXY.initialY });
    }
  }, [
    showGrayPreview,
    ballsPx,
    chartToSvg,
    initialOverlayXY.initialX,
    initialOverlayXY.initialY,
    overlayPos
  ]);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        let parsed = parseCsvData(evt.target.result);
        parsed = [...parsed].reverse();
        const flat = flattenDraws(parsed);
        setFlatData(flat);
        setOriginalFlatData(flat);
        setError("");
      } catch (err) {
        setError("Failed to parse CSV. Ensure correct columns.");
      }
    };
    reader.readAsText(file);
  }

  function handleExportSVG() {
    const svgExportRefCurrent = svgExportRef.current;
    if (!svgExportRefCurrent) return alert("SVG container not found!");
    const svgElem = svgExportRefCurrent.querySelector("svg");
    if (!svgElem) return alert("SVG not found!");
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElem);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(
        /^<svg/,
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
    }
    if (!source.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
      source = source.replace(
        /^<svg/,
        '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
      );
    }
    const url =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lotto-plot.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleSimulateSubmit(e) {
    e.preventDefault();
    const nums = simulateNumbers.map((n) => parseInt(n, 10));
    if (
      nums.length !== 8 ||
      nums.some(isNaN) ||
      new Set(nums).size !== 8 ||
      nums.some((n) => n < 1 || n > 45)
    ) {
      setSimError("Enter 8 unique numbers between 1 and 45.");
      return;
    }
    setSimError("");
    const nextDrawIndex = maxDrawIndex + 1;
    const nextDateNum = Date.now();
    const nextDateObj = new Date(nextDateNum);
    const nextDateStr = `${
      nextDateObj.getMonth() + 1
    }/${nextDateObj.getDate()}/${String(nextDateObj.getFullYear()).slice(-2)}`;
    const newDraw = {
      date: nextDateStr,
      main1: nums[0],
      main2: nums[1],
      main3: nums[2],
      main4: nums[3],
      main5: nums[4],
      main6: nums[5],
      supp1: nums[6],
      supp2: nums[7],
    };
    const flat = flattenDraws([newDraw]).map((row) => ({
      ...row,
      drawIndex: nextDrawIndex,
      numberIndex: row.number - 1,
    }));
    setFlatData((prev) => [...prev, ...flat]);
    setSimulateNumbers(Array(8).fill(""));
  }

  function handleRefreshSimulated() {
    setFlatData(originalFlatData);
    setSimulateNumbers(Array(8).fill(""));
    setSimError("");
  }

  const numberTicks = Array.from({ length: 45 }, (_, i) => i);

  return (
    <div style={{ fontFamily: "sans-serif", margin: 20, height: "100vh", position: "relative" }}>
      <h2>
        Lotto Scatter Plot — colored balls &amp; draggable, resizable (X only), rotatable overlay
      </h2>
      <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} />
        <button
          style={{ padding: "8px 16px", fontSize: 16 }}
          onClick={handleRefreshSimulated}
          type="button"
          disabled={flatData.length === originalFlatData.length}
          title={
            flatData.length === originalFlatData.length
              ? "No simulated draw to clear"
              : ""
          }
        >
          Refresh (Clear Simulated Draw)
        </button>
        <button
          style={{ padding: "8px 16px", fontSize: 16 }}
          onClick={handleExportSVG}
          type="button"
          disabled={!flatData.length}
          title={!flatData.length ? "Upload data first" : ""}
        >
          Export as SVG
        </button>
      </div>
      <div style={{ marginBottom: 16, display: "flex", gap: 32, alignItems: "center" }}>
        <div>
          <b>X Overlay:</b>
          <span style={{ marginLeft: 10 }}>
            <b>Rotation:</b>{" "}
            <input
              type="number"
              min={0}
              max={359}
              value={rotation}
              onChange={e => setRotation(((Number(e.target.value) % 360) + 360) % 360)}
              style={{ width: 56 }}
            />{" "}
            &deg;
            <button onClick={() => setRotation(((rotation - 1) + 360) % 360)} style={{ marginLeft: 4 }}>-</button>
            <button onClick={() => setRotation((rotation + 1) % 360)} style={{ marginLeft: 2 }}>+</button>
            <button onClick={() => setRotation(0)} style={{ marginLeft: 4 }}>Reset</button>
          </span>
          <span style={{ marginLeft: 16 }}>
            <b>X size:</b>{" "}
            <input
              type="number"
              min={100}
              max={450}
              value={crossLen}
              onChange={e => setCrossLen(Math.max(100, Math.min(450, Number(e.target.value))))}
              style={{ width: 56 }}
            />{" "}
            px
            <button onClick={() => setCrossLen(Math.max(100, crossLen - 1))} style={{ marginLeft: 4 }}>-</button>
            <button onClick={() => setCrossLen(Math.min(450, crossLen + 1))} style={{ marginLeft: 2 }}>+</button>
            <button onClick={() => setCrossLen(100)} style={{ marginLeft: 4 }}>Reset</button>
          </span>
        </div>
        <div>
          <label style={{ fontWeight: "bold" }}>
            <input
              type="checkbox"
              checked={showGrayPreview}
              onChange={e => setShowGrayPreview(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Show gray preview circles
          </label>
        </div>
      </div>
      <form
        onSubmit={handleSimulateSubmit}
        style={{
          margin: "8px 0 24px 0",
          background: "#f6f6f6",
          padding: 12,
          borderRadius: 6,
        }}
      >
        <strong>Simulate a draw for next blank Monday, Wednesday, or Friday:</strong>
        <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <input
              key={i}
              type="number"
              min={1}
              max={45}
              style={{ width: 40 }}
              value={simulateNumbers[i]}
              onChange={(e) => {
                const arr = [...simulateNumbers];
                arr[i] = e.target.value;
                setSimulateNumbers(arr);
              }}
              required
            />
          ))}
        </div>
        <button type="submit">Add Simulated Draw</button>
        {simError && (
          <span style={{ color: "red", marginLeft: 12 }}>{simError}</span>
        )}
        {error && <div style={{ color: "red" }}>{error}</div>}
      </form>
      <div
        ref={chartAreaRef}
        style={{
          width: "100vw",
          height: "60vh",
          marginTop: 24,
          position: "relative"
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 40 }}>
            <CartesianGrid
              stroke="#fff"
              strokeDasharray="3 3"
              vertical={false}
              horizontal={false}
            />
            <XAxis
              dataKey="drawIndex"
              type="number"
              name="Draw"
              domain={[minDrawIndex, maxDrawIndex + 1]}
              tickFormatter={formatDrawTick}
              tick={{ fontSize: 10 }}
              label={{
                value: "Draw Number",
                position: "insideBottom",
                offset: -20
              }}
              allowDataOverflow
            />
            <YAxis
              dataKey="numberIndex"
              domain={[0, 44]}
              ticks={numberTicks}
              interval={0}
              tickFormatter={(i) => i + 1}
              label={{
                value: "Number",
                angle: -90,
                position: "insideLeft"
              }}
              allowDataOverflow
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const { date, number } = payload[0].payload;
                  return (
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #aaa",
                        padding: 8
                      }}
                    >
                      <div>
                        Date: <b>{date}</b>
                      </div>
                      <div>
                        <span
                          style={{
                            color: numberColorMap[number] || "#000",
                            fontWeight: "bold"
                          }}
                        >
                          {number}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter
              name="Draw Numbers (main and supp)"
              data={flatData}
              shape={shapeBall}
              legendType="circle"
              isAnimationActive={false}
              line={false}
              dataKey="numberIndex"
            />
          </ScatterChart>
        </ResponsiveContainer>
        <GrayPreviewCircles
          show={showGrayPreview}
          overlayPos={overlayPos}
          ballsPx={ballsPx}
          ballsData={flatData}
          chartToSvg={chartToSvg}
        />
        <DraggableResizableRotatableOverlay
          parentWidth={chartSize.width}
          parentHeight={chartSize.height}
          crossLen={crossLen}
          setCrossLen={setCrossLen}
          rotation={rotation}
          setRotation={setRotation}
          circleRadius={7}
          minCrossLen={minCrossLen}
          maxCrossLen={maxCrossLen}
          onOverlayMove={setOverlayPos}
          initialOnData={initialOverlayXY}
        />
      </div>
      <div
        ref={svgExportRef}
        style={{
          position: "absolute",
          left: -9999,
          top: -9999,
          pointerEvents: "none",
        }}
      ></div>
      <div style={{ marginTop: 24 }}>
        <h4>Color Legend</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(numberColorMap).map(([num, color]) => (
            <div
              key={num}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginRight: 8
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  background: color,
                  display: "inline-block",
                  border: "1px solid #222"
                }}
              />
              <span style={{ fontSize: 13 }}>{num}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12, color: "#888" }}>
        <small>
          Drag the red overlay anywhere.<br/>
          <b>Resize X:</b> grab the small white handle at lower right.<br/>
          <b>Rotate X:</b> grab the small white handle at top.<br/>
          <b>Note:</b> The red circle remains a fixed size (same as colored balls).<br/>
          <b>Gray circles:</b> Appear above/below in the next draw column when the overlay is over a colored ball.<br/>
          <b>Toggle preview:</b> Use the checkbox above the chart to show/hide gray preview circles.
        </small>
      </div>
    </div>
  );
}