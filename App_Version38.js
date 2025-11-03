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

// Color map for numbers 1-45
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

const DAY_MS = 24 * 60 * 60 * 1000;

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
  data.forEach((row) => {
    const dateNum = parseDateString(row.date);
    keys.forEach((k) => {
      if (row[k]) {
        result.push({
          date: row.date,
          dateNum,
          number: Number(row[k]),
          isSupp: k === "supp1" || k === "supp2",
          fill: numberColorMap[row[k]] || "#000"
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

function formatDateTick(tick) {
  const d = new Date(tick);
  return d.toISOString().slice(2, 10);
}

// Next valid Mon/Wed/Fri following latest draw, placed right next to it
function getNextDrawDate(flatData) {
  const validDays = [1, 3, 5]; // Monday, Wednesday, Friday
  const maxDate = flatData.length
    ? Math.max(...flatData.map((d) => d.dateNum))
    : Date.now();
  let date = new Date(maxDate);
  date.setHours(0, 0, 0, 0);
  let next = new Date(date);
  for (let i = 1; i <= 7; i++) {
    next.setDate(date.getDate() + i);
    if (validDays.includes(next.getDay())) {
      return next.getTime();
    }
  }
  // fallback, next calendar day
  next.setDate(date.getDate() + 1);
  return next.getTime();
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

function DraggableResizableRotatableOverlay({
  parentWidth,
  parentHeight,
  crossLen,
  setCrossLen,
  rotation,
  setRotation,
  circleRadius = 7,
  minCrossLen = 10,
  maxCrossLen = 100,
}) {
  const [pos, setPos] = useState({
    x: parentWidth / 2,
    y: parentHeight / 2,
  });
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState(null);

  const [rotating, setRotating] = useState(false);
  const [resizing, setResizing] = useState(false);

  const mainGroupRef = useRef();

  // Handles: resize at lower right, rotate at top
  const handleSize = 10;
  const resizeHandle = {
    x: crossLen * Math.cos((45 * Math.PI) / 180),
    y: crossLen * Math.sin((45 * Math.PI) / 180),
  };
  const rotateHandle = {
    x: 0,
    y: -crossLen - 20,
  };

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
      // Focus for keyboard
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

  // Keyboard movement/rotation
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
    // eslint-disable-next-line
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
        {/* Fixed-size circle */}
        <circle
          cx={0}
          cy={0}
          r={circleRadius}
          fill="rgba(255,0,0,0.35)"
          stroke="red"
          strokeWidth={2}
        />
        {/* Resizable/rotatable X */}
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
        {/* Resize handle (bottom right) */}
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
        {/* Rotate handle (top) */}
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
        {/* Arc between center and rotate handle */}
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

  // X overlay state
  const [rotation, setRotation] = useState(0);
  const [crossLen, setCrossLen] = useState(10.5); // 1.5 * ball radius
  const minCrossLen = 10;
  const maxCrossLen = 100;

  // derived range
  const validDates = flatData.filter((d) => !isNaN(d.dateNum));
  const minDate = validDates.length
    ? Math.min(...validDates.map((d) => d.dateNum))
    : Date.now();
  const maxDate = validDates.length
    ? Math.max(...validDates.map((d) => d.dateNum))
    : Date.now();
  // Add gutter: 7 days after maxDate (adjust as needed)
  const paddedMinDate = minDate - 2 * DAY_MS;
  const paddedMaxDate = maxDate + 7 * DAY_MS;

  useEffect(() => {
    // Update chart size on resize.
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
    const nextDateNum = getNextDrawDate(flatData);
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
    // Use our own flatten to inject the dateNum
    const flat = flattenDraws([newDraw]).map((row) => ({
      ...row,
      dateNum: nextDateNum, // ensure dateNum matches simulated
    }));
    setFlatData((prev) => [...prev, ...flat]);
    setSimulateNumbers(Array(8).fill(""));
  }

  function handleRefreshSimulated() {
    setFlatData(originalFlatData);
    setSimulateNumbers(Array(8).fill(""));
    setSimError("");
  }

  const numberTicks = Array.from({ length: 45 }, (_, i) => i + 1);

  // Handlers for rotation and crossLen numeric controls
  function handleRotationChange(e) {
    let val = Number(e.target.value);
    if (isNaN(val)) val = 0;
    setRotation(((val % 360) + 360) % 360);
  }
  function handleCrossLenChange(e) {
    let val = Number(e.target.value);
    if (isNaN(val)) val = minCrossLen;
    setCrossLen(Math.max(minCrossLen, Math.min(maxCrossLen, val)));
  }

  return (
    <div style={{ fontFamily: "sans-serif", margin: 20, height: "100vh", position: "relative" }}>
      <h2>
        Lotto Scatter Plot — colored balls &amp; draggable, resizable (X only), rotatable overlay
      </h2>
      <input type="file" accept=".csv,text/csv" onChange={handleFile} />
      <button
        style={{ marginLeft: 12, padding: "8px 16px", fontSize: 16 }}
        onClick={handleExportSVG}
        disabled={!flatData.length}
        title={!flatData.length ? "Upload data first" : ""}
      >
        Export as SVG
      </button>
      <button
        style={{ marginLeft: 12, padding: "8px 16px", fontSize: 16 }}
        onClick={handleRefreshSimulated}
        disabled={flatData.length === originalFlatData.length}
        title={
          flatData.length === originalFlatData.length
            ? "No simulated draw to clear"
            : ""
        }
      >
        Refresh (Clear Simulated Draw)
      </button>
      {error && <div style={{ color: "red" }}>{error}</div>}

      <form
        onSubmit={handleSimulateSubmit}
        style={{
          margin: "24px 0",
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
              dataKey="dateNum"
              type="number"
              name="Date"
              domain={[paddedMinDate, paddedMaxDate]}
              tickFormatter={formatDateTick}
              tick={{ fontSize: 10 }}
              label={{
                value: "Draw Date",
                position: "insideBottom",
                offset: -20
              }}
              allowDataOverflow
            />
            <YAxis
              dataKey="number"
              domain={[1, 45]}
              ticks={numberTicks}
              interval={0}
              tickFormatter={(n) => n}
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
              dataKey="number"
            />
          </ScatterChart>
        </ResponsiveContainer>
        {/* Fixed-size red ball, resizable and rotatable X */}
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
      {/* Overlay parameters display and controls */}
      <div style={{ marginTop: 16, color: "#222", background: "#f9f9f9", padding: 12, borderRadius: 4, maxWidth: 420 }}>
        <div>
          <b>X Overlay:</b>
        </div>
        <div style={{ margin: "8px 0", display: "flex", alignItems: "center", gap: 16 }}>
          <span>
            <b>Rotation:</b>{" "}
            <input
              type="number"
              min={0}
              max={359}
              value={rotation}
              onChange={handleRotationChange}
              style={{ width: 56 }}
            />{" "}
            &deg;
            <button onClick={() => setRotation(((rotation - 1) + 360) % 360)} style={{ marginLeft: 4 }}>-</button>
            <button onClick={() => setRotation((rotation + 1) % 360)} style={{ marginLeft: 2 }}>+</button>
            <button onClick={() => setRotation(0)} style={{ marginLeft: 4 }}>Reset</button>
          </span>
          <span>
            <b>X size:</b>{" "}
            <input
              type="number"
              min={minCrossLen}
              max={maxCrossLen}
              value={crossLen}
              onChange={handleCrossLenChange}
              style={{ width: 56 }}
            />{" "}
            px
            <button onClick={() => setCrossLen(Math.max(minCrossLen, crossLen - 1))} style={{ marginLeft: 4 }}>-</button>
            <button onClick={() => setCrossLen(Math.min(maxCrossLen, crossLen + 1))} style={{ marginLeft: 2 }}>+</button>
            <button onClick={() => setCrossLen(10.5)} style={{ marginLeft: 4 }}>Reset</button>
          </span>
        </div>
        <div style={{ color: "#888", fontSize: "13px", marginTop: 3 }}>
          Arrow keys: move. Shift+arrow: move fast. <b>r</b>: rotate, <b>s</b>/<b>a</b>: size. Keyboard and UI in sync.
        </div>
      </div>
      <div style={{ marginTop: 12, color: "#888" }}>
        <small>
          Drag the red overlay anywhere.<br/>
          <b>Resize X:</b> grab the small white handle at lower right.<br/>
          <b>Rotate X:</b> grab the small white handle at top.<br/>
          <b>Note:</b> The red circle remains a fixed size (same as colored balls).
        </small>
      </div>
    </div>
  );
}