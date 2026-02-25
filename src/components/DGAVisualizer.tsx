import React, { useMemo, useState } from 'react';
import type { DiamondShape } from '../types/Diamond';
import { isCellInShape } from '../lib/diamondShapes';
import type { Diamond as DGADiamond } from '../dga';
import { DiamondShapeSelector } from './controls/DiamondShapeSelector';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type HighlightRenderStyle = 'solid' | 'hatch';

type HighlightShape = {
  row: number;        // 1-based (may be float in targets-only mode)
  col: number;        // 1-based
  radius: number;
  color: string;
  slope?: number;
  biasUp?: number;
  biasDown?: number;
  tol?: number;
  slopeUp?: number;
  slopeDown?: number;
  cellsSet?: Set<string>;
  renderStyle?: HighlightRenderStyle;
};

type BaseDiamond = DGADiamond;

// Keep external/custom shape as-is (id optional, matches incoming data)
type Diamond = BaseDiamond & {
  id?: string;
  rawRadius?: number;
  clipped?: boolean;
  clipMode?: 'partial' | 'shrunk';
  fillColor?: string;
  edgeColor?: string;
  boundaryOnly?: boolean;
  shape?: DiamondShape;
  fill?: boolean;
  opacity?: number;
  hidden?: boolean;
};

// Locally guaranteed id (used for UI + selector)
type DiamondWithId = BaseDiamond & {
  id: string;
  rawRadius?: number;
  clipped?: boolean;
  clipMode?: 'partial' | 'shrunk';
  fillColor?: string;
  edgeColor?: string;
  boundaryOnly?: boolean;
  shape?: DiamondShape;
  fill?: boolean;
  opacity?: number;
  hidden?: boolean;
};

export interface DGAVisualizerProps {
  grid: number[][];
  diamonds: Diamond[];
  predictions: number[];
  drawLabels: string[];
  numberLabels: string[];
  numberCounts: number[];
  minCount: number;
  maxCount: number;
  highlights: HighlightShape[];
  setHighlights: React.Dispatch<React.SetStateAction<HighlightShape[]>>;
  controlsPosition?: 'above' | 'below'; // default 'above'
focusNumber?: number | null;
focusedCol?: number | null;
onColumnClick?: (col: number) => void;
}

type SolveMode = 'center-and-targets' | 'targets-only';

type ExportPayload = {
  version: number;
  settings: {
    includeNextCol: boolean;
    useDigitalLine: boolean;
    useIndependentAngles: boolean;
    solveMode: SolveMode;
    defaultDiamondFill: string;
    defaultDiamondEdge: string;
  };
  diamonds: Diamond[];
  highlights: (Omit<HighlightShape, 'cellsSet'> & { digital: boolean })[];
};

/* -------------------------------------------------------------------------- */
/* Constants / Utility                                                        */
/* -------------------------------------------------------------------------- */

const defaultShape: DiamondShape = 'manhattan';

const DEFAULT_COLOR = 'rgba(255,0,0,0.3)';
const DEFAULT_DIAMOND_FILL = 'rgba(255,0,180,0.30)';
const DEFAULT_DIAMOND_EDGE = 'rgba(255,0,180,0.85)';
const HATCH_WIDTH = 2;
const HATCH_GAP = 4;

function getHeatmapColor(count: number, min: number, max: number) {
  if (max === min) return '#fff';
  const t = (count - min) / (max - min);
  const r = Math.round(255 * t);
  const g = Math.round(220 * (1 - t) + 50 * t);
  const b = Math.round(255 * (1 - t));
  return `rgba(${r},${g},${b},0.20)`;
}

function buildDigitalCells(
  r1: number,
  c1: number,
  radius: number,
  kShared: number,
  bUp: number,
  bDown: number,
  nRows: number,
  nCols: number,
  kUpOverride?: number,
  kDownOverride?: number
): Set<string> {
  const set = new Set<string>();
  const r0 = r1 - 1;
  const c0 = c1 - 1;
  const kUp = kUpOverride ?? kShared;
  const kDown = kDownOverride ?? kShared;

  for (let dx = -radius; dx <= radius; dx++) {
    const c = c0 + dx;
    if (c < 0 || c >= nCols) continue;
    const yUp = r0 + (-kUp * dx + bUp);
    const yDown = r0 + (kDown * dx + bDown);
    const upRow = Math.round(yUp + 1e-9);
    const downRow = Math.round(yDown + 1e-9);
    if (upRow >= 0 && upRow < nRows) set.add(`${upRow},${c}`);
    if (downRow >= 0 && downRow < nRows) set.add(`${downRow},${c}`);
  }
  return set;
}

function isOnAdjustableX(
  rIdx: number,
  cIdx: number,
  hl: HighlightShape,
  nRows: number,
  nCols: number
): boolean {
  if (hl.cellsSet) return hl.cellsSet.has(`${rIdx},${cIdx}`);
  const hRow = (hl.row ?? 1) - 1;
  const hCol = (hl.col ?? 1) - 1;
  const rad = Math.max(0, hl.radius ?? 0);
  const kUp = hl.slopeUp ?? hl.slope ?? 1;
  const kDown = hl.slopeDown ?? hl.slope ?? 1;
  const biasUp = hl.biasUp ?? 0;
  const biasDown = hl.biasDown ?? 0;
  const tolRaw = hl.tol ?? 0.5;
  const tol = Math.max(0, tolRaw - 1e-6);
  const dx = cIdx - hCol;
  if (Math.abs(dx) > rad) return false;
  const dy = rIdx - hRow;
  if (rIdx < 0 || rIdx >= nRows || cIdx < 0 || cIdx >= nCols) return false;
  const onDownArm = Math.abs(dy - (kDown * dx + biasDown)) < tol;
  const onUpArm = Math.abs(dy - (-kUp * dx + biasUp)) < tol;
  return onDownArm || onUpArm;
}

function diamondCellMembership(d: Diamond, rIdx: number, cIdx: number) {
  const dr = rIdx - d.centerRow;
  const dc = cIdx - d.centerCol;
  const shape = d.shape ?? defaultShape;

  const boundary = isCellInShape(shape, {
    dr,
    dc,
    radius: d.radius,
    boundaryOnly: true,
  });

  const inside = isCellInShape(shape, {
    dr,
    dc,
    radius: d.radius,
    boundaryOnly: false,
  });

  return { inside, boundary };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export const DGAVisualizer: React.FC<DGAVisualizerProps> = ({
  grid,
  diamonds,
  predictions,
  drawLabels,
  numberLabels,
  numberCounts,
  minCount,
  maxCount,
  highlights,
  setHighlights,
  controlsPosition = 'above',
focusNumber = null,
focusedCol = null,
onColumnClick,
}) => {
  // Defensive defaults
  grid = grid || [];
  diamonds = diamonds || [];
  predictions = predictions || [];
  drawLabels = drawLabels || [];
  numberLabels = numberLabels || [];
  numberCounts = numberCounts || [];
  highlights = highlights || [];

  /* Mode Toggles */
  const [includeNextCol, setIncludeNextCol] = useState(true);
  const baseCols = grid[0]?.length || 0;
  const effectiveCols = baseCols + (includeNextCol ? 1 : 0);
  const [useDigitalLine, setUseDigitalLine] = useState(true);
  const [useIndependentAngles, setUseIndependentAngles] = useState(true);
  const [solveMode, setSolveMode] = useState<SolveMode>('targets-only');
  const [centerOffset, setCenterOffset] = useState('20');

  /* Center + Targets inputs */
  const [inputRow, setInputRow] = useState('');
  const [inputCol, setInputCol] = useState('');
  const [aimMode, setAimMode] = useState<'edge-right' | 'edge-left' | 'custom-col'>('edge-right');
  const [customAimCol, setCustomAimCol] = useState('');

  /* Targets (both modes) */
  const [aimTargetUpRow, setAimTargetUpRow] = useState('');
  const [aimTargetDownRow, setAimTargetDownRow] = useState('');

  /* Highlight appearance */
  const [inputColor, setInputColor] = useState(DEFAULT_COLOR);
  const [renderStyle, setRenderStyle] = useState<HighlightRenderStyle>('solid');

  /* Advanced highlight geometry */
  const [inputSlope, setInputSlope] = useState('1');
  const [inputBiasUp, setInputBiasUp] = useState('0.000');
  const [inputBiasDown, setInputBiasDown] = useState('0.000');
  const [inputTol, setInputTol] = useState('0.49');
  const [advancedRadius, setAdvancedRadius] = useState('');

  /* Diamonds (custom/additional) */
  const [customDiamonds, setCustomDiamonds] = useState<Diamond[]>([]);
  const [manualWestRow, setManualWestRow] = useState('');
  const [manualWestCol, setManualWestCol] = useState('');
  const [manualNorthRow, setManualNorthRow] = useState('');
  const [manualNorthCol, setManualNorthCol] = useState('');
  const [allowApproxDiamond, setAllowApproxDiamond] = useState(false);
  const [autoClipDiamond, setAutoClipDiamond] = useState(true);
  const [permitPartialDiamond, setPermitPartialDiamond] = useState(false);
  const [diamondBoundaryOnly, setDiamondBoundaryOnly] = useState(false);
  const [diamondFillDefault, setDiamondFillDefault] = useState(DEFAULT_DIAMOND_FILL);
  const [diamondEdgeDefault, setDiamondEdgeDefault] = useState(DEFAULT_DIAMOND_EDGE);
  const [diamondMessage, setDiamondMessage] = useState('');
  const [showDiamonds, setShowDiamonds] = useState(true);

  /* Per-diamond recolor UI */
  const [editingDiamondIndex, setEditingDiamondIndex] = useState<number | null>(null);

  /* Export / Import */
  const [exportJSON, setExportJSON] = useState('');
  const [importJSON, setImportJSON] = useState('');
  const [importMessage, setImportMessage] = useState('');

  /* Prepare diamonds list with ids */
const allDiamonds = useMemo<DiamondWithId[]>(() => {
  return [...diamonds, ...customDiamonds].map((d, i) => {
    // guarantee id is a string
    const id = d.id ?? `d${i}`;
    return { ...d, id } as DiamondWithId;
  });
}, [diamonds, customDiamonds]);

const diamondOptions = useMemo(
  () =>
    allDiamonds.map((d, i) => {
      const clipTag =
        d.clipMode === 'partial'
          ? ' (partial)'
          : d.clipMode === 'shrunk'
          ? ' (shrunk)'
          : '';
      return {
        label: `#${i + 1} r=${d.radius}${clipTag} @ (${d.centerRow + 1}, ${d.centerCol + 1})`,
        value: i,
        d, // d is DiamondWithId
      };
    }),
  [allDiamonds]
);
const [selectedDiamondIdx, setSelectedDiamondIdx] = useState(0);
const selectedDiamond = diamondOptions[selectedDiamondIdx]?.d; // DiamondWithId | undefined

  function getHighlightInfos(rIdx: number, cIdx: number) {
    const infos: {
      idx: number;
      color: string;
      row: number;
      col: number;
      radius: number;
      slope: number;
      biasUp: number;
      biasDown: number;
      tol: number;
    }[] = [];
    const nRows = grid.length;
    const nCols = effectiveCols;
    highlights.forEach((hl, idx) => {
      if (isOnAdjustableX(rIdx, cIdx, hl, nRows, nCols)) {
        infos.push({
          idx,
          color: hl.color,
          row: hl.row,
          col: hl.col,
          radius: hl.radius,
          slope: hl.slope ?? 1,
          biasUp: hl.biasUp ?? 0,
          biasDown: hl.biasDown ?? 0,
          tol: hl.tol ?? 0.5,
        });
      }
    });
    return infos;
  }

  function addHighlightWithParams(
    row: number,
    col: number,
    radius: number,
    slope: number,
    biasUp: number,
    biasDown: number,
    tol: number,
    color: string,
    slopeUpOverride?: number,
    slopeDownOverride?: number
  ) {
    const nRows = grid.length;
    const nCols = effectiveCols;
    const cellsSet = useDigitalLine
      ? buildDigitalCells(
          row,
          col,
          radius,
          slope,
          biasUp,
          biasDown,
          nRows,
          nCols,
          slopeUpOverride,
          slopeDownOverride
        )
      : undefined;
    setHighlights(prev => [
      ...prev,
      {
        row,
        col,
        radius,
        color,
        slope,
        biasUp,
        biasDown,
        tol,
        cellsSet,
        renderStyle,
        ...(slopeUpOverride !== undefined ? { slopeUp: slopeUpOverride } : {}),
        ...(slopeDownOverride !== undefined ? { slopeDown: slopeDownOverride } : {}),
      },
    ]);
  }

  function handleAddHighlightAdvanced() {
    if (solveMode === 'targets-only') return;
    const row = parseFloat(inputRow);
    const col = parseInt(inputCol, 10);
    if (
      isNaN(row) ||
      isNaN(col) ||
      row < 1 ||
      row > grid.length ||
      col < 1 ||
      col > (grid[0]?.length || 1)
    ) {
      return;
    }
    let aimCol: number;
    if (aimMode === 'edge-right') aimCol = effectiveCols;
    else if (aimMode === 'edge-left') aimCol = 1;
    else {
      const custom = parseInt(customAimCol, 10);
      const cols = effectiveCols;
      if (isNaN(custom)) return;
      aimCol = Math.min(Math.max(1, custom), cols);
    }
    const dx = aimCol - col;
    let radius = parseInt(advancedRadius, 10);
    if (isNaN(radius) || radius <= 0) radius = Math.abs(dx);

    const slope = parseFloat(inputSlope);
    const biasUp = parseFloat(inputBiasUp);
    const biasDown = parseFloat(inputBiasDown);
    const tol = isNaN(parseFloat(inputTol)) ? 0.49 : parseFloat(inputTol);

    addHighlightWithParams(
      row,
      col,
      radius,
      isNaN(slope) ? 1 : slope,
      isNaN(biasUp) ? 0 : biasUp,
      isNaN(biasDown) ? 0 : biasDown,
      tol,
      inputColor || DEFAULT_COLOR
    );
  }

  function handleRemoveHighlight(index: number) {
    setHighlights(prev => prev.filter((_, i) => i !== index));
  }

  function handleAimCompute(addNow = false) {
    const ru = aimTargetUpRow.trim() === '' ? undefined : parseInt(aimTargetUpRow, 10);
    const rd = aimTargetDownRow.trim() === '' ? undefined : parseInt(aimTargetDownRow, 10);
    const tol = isNaN(parseFloat(inputTol)) ? 0.49 : parseFloat(inputTol);
    const color = inputColor || DEFAULT_COLOR;

    if (solveMode === 'targets-only') {
      if (ru === undefined || rd === undefined) return;
      const aimCol = baseCols + 1;
      const rawDx = parseInt(centerOffset, 10);
      const dx = Math.max(1, Math.min(isNaN(rawDx) ? 20 : rawDx, aimCol - 1));
      const c0 = aimCol - dx;
      const r0 = (ru + rd) / 2;
      const k = (rd - ru) / (2 * dx);
      setInputRow(r0.toFixed(3));
      setInputCol(String(c0));
      setInputSlope(k.toFixed(3));
      setInputBiasUp('0.000');
      setInputBiasDown('0.000');
      if (addNow) addHighlightWithParams(r0, c0, Math.abs(dx), k, 0, 0, tol, color);
      return;
    }

    const row = parseFloat(inputRow);
    const col = parseInt(inputCol, 10);
    if (
      isNaN(row) ||
      isNaN(col) ||
      row < 1 ||
      row > grid.length ||
      col < 1 ||
      col > (grid[0]?.length || 1)
    )
      return;

    let aimCol: number;
    if (aimMode === 'edge-right') aimCol = effectiveCols;
    else if (aimMode === 'edge-left') aimCol = 1;
    else {
      const custom = parseInt(customAimCol, 10);
      const cols = effectiveCols;
      if (isNaN(custom)) return;
      aimCol = Math.min(Math.max(1, custom), cols);
    }
    const dx = aimCol - col;
    if (dx === 0) return;

    let kShared: number;
    let bUp = 0;
    let bDown = 0;
    let kUpInd: number | undefined;
    let kDownInd: number | undefined;

    if (useIndependentAngles && ru !== undefined && rd !== undefined) {
      kUpInd = (row - ru) / dx;
      kDownInd = (rd - row) / dx;
      kShared = (kUpInd + kDownInd) / 2;
    } else if (ru !== undefined && rd !== undefined) {
      kShared = (rd - ru) / (2 * dx);
      const dyUp = ru - row;
      const dyDown = rd - row;
      bUp = dyUp + kShared * dx;
      bDown = dyDown - kShared * dx;
    } else if (rd !== undefined) {
      kShared = (rd - row) / dx;
    } else if (ru !== undefined) {
      kShared = (row - ru) / dx;
    } else {
      return;
    }
    setInputSlope((kShared ?? 1).toFixed(3));
    setInputBiasUp(bUp.toFixed(3));
    setInputBiasDown(bDown.toFixed(3));
    if (addNow) {
      addHighlightWithParams(
        row,
        col,
        Math.abs(dx),
        kShared ?? 1,
        bUp,
        bDown,
        tol,
        color,
        kUpInd,
        kDownInd
      );
    }
  }

  function setCenterFromDiamond(where: 'top' | 'bottom' | 'left' | 'right') {
    if (!selectedDiamond) return;
    let r = selectedDiamond.centerRow + 1;
    let c = selectedDiamond.centerCol + 1;
    if (where === 'top') r = selectedDiamond.centerRow + 1 - selectedDiamond.radius;
    if (where === 'bottom') r = selectedDiamond.centerRow + 1 + selectedDiamond.radius;
    if (where === 'left') c = selectedDiamond.centerCol + 1 - selectedDiamond.radius;
    if (where === 'right') c = selectedDiamond.centerCol + 1 + selectedDiamond.radius;
    setInputRow(String(r));
    setInputCol(String(c));
  }

  function handleAddManualDiamond() {
    setDiamondMessage('');
    const wR = parseInt(manualWestRow, 10);
    const wC = parseInt(manualWestCol, 10);
    const nR = parseInt(manualNorthRow, 10);
    const nC = parseInt(manualNorthCol, 10);

    if ([wR, wC, nR, nC].some(isNaN)) {
      setDiamondMessage('Enter all four coordinates.');
      return;
    }
    if (wR < 1 || wR > grid.length || nR < 1 || nR > grid.length) {
      setDiamondMessage('Row(s) outside grid.');
      return;
    }
    if (wC < 1 || wC > baseCols || nC < 1 || nC > baseCols) {
      setDiamondMessage('Col(s) outside current draws.');
      return;
    }

    const R1 = wR - nR;
    const R2 = nC - wC;
    if (R1 <= 0 || R2 <= 0) {
      setDiamondMessage('Computed radius <= 0 (check ordering).');
      return;
    }
    let rawRadius = R1;
    let exact = R1 === R2;
    if (!exact && allowApproxDiamond && Math.abs(R1 - R2) === 1) {
      rawRadius = Math.round((R1 + R2) / 2);
      exact = true;
    }
    if (!exact) {
      setDiamondMessage(`Radii mismatch R1=${R1}, R2=${R2} (enable mismatch tolerance?).`);
      return;
    }

    const centerRow = wR - 1;
    const centerCol = nC - 1;

    // bounding distances
    const maxUp = centerRow;
    const maxDown = grid.length - 1 - centerRow;
    const maxLeft = centerCol;
    const maxRight = (includeNextCol ? baseCols : baseCols - 1) - centerCol;
    const maxPossible = Math.min(maxUp, maxDown, maxLeft, maxRight);

    let finalRadius = rawRadius;
    let clipped = false;
    let clipMode: Diamond['clipMode'] | undefined;

    if (finalRadius > maxPossible) {
      if (autoClipDiamond) {
        finalRadius = maxPossible;
        clipped = true;
        clipMode = 'shrunk';
      } else if (permitPartialDiamond) {
        finalRadius = rawRadius;
        clipped = true;
        clipMode = 'partial';
      } else {
        setDiamondMessage('Exceeds bounds (enable auto-clip or partial).');
        return;
      }
    }

    if (finalRadius <= 0) {
      setDiamondMessage('Radius <= 0 after clipping; cannot add.');
      return;
    }

    const newDiamond: Diamond = {
      id: `custom-${Date.now()}-${customDiamonds.length}`,
      centerRow,
      centerCol,
      radius: finalRadius,
      rawRadius,
      clipped,
      clipMode,
      fillColor: diamondFillDefault,
      edgeColor: diamondEdgeDefault,
      boundaryOnly: diamondBoundaryOnly,
    };

    setCustomDiamonds(prev => [...prev, newDiamond]);
    setDiamondMessage(
      `Added diamond center=(${centerRow + 1},${centerCol + 1}) r=${finalRadius}${clipMode ? ` (${clipMode})` : ''}.`
    );
  }

  function handleRemoveDiamond(index: number) {
    const autoLen = diamonds.length;
    if (index < autoLen) {
      setDiamondMessage('Cannot remove external (auto) diamond.');
      return;
    }
    const customIndex = index - autoLen;
    setCustomDiamonds(prev => prev.filter((_, i) => i !== customIndex));
  }

  function updateDiamondShape(index: number, shape: DiamondShape) {
    const autoLen = diamonds.length;
    if (index < autoLen) return;
    const customIndex = index - autoLen;
    setCustomDiamonds(prev => prev.map((d, i) => (i === customIndex ? { ...d, shape } : d)));
  }

  function updateDiamondColor(index: number, fill?: string, edge?: string) {
    const autoLen = diamonds.length;
    if (index < autoLen) return;
    const customIndex = index - autoLen;
    setCustomDiamonds(prev =>
      prev.map((d, i) =>
        i === customIndex
          ? {
              ...d,
              fillColor: fill !== undefined ? fill : d.fillColor,
              edgeColor: edge !== undefined ? edge : d.edgeColor,
            }
          : d
      )
    );
  }

  function toggleDiamondBoundaryOnly(index: number) {
    const autoLen = diamonds.length;
    if (index < autoLen) return;
    const customIndex = index - autoLen;
    setCustomDiamonds(prev => prev.map((d, i) => (i === customIndex ? { ...d, boundaryOnly: !d.boundaryOnly } : d)));
  }

  const preview = useMemo(() => {
    const ru = aimTargetUpRow.trim() === '' ? undefined : parseInt(aimTargetUpRow, 10);
    const rd = aimTargetDownRow.trim() === '' ? undefined : parseInt(aimTargetDownRow, 10);

    if (solveMode === 'targets-only') {
      if (ru === undefined || rd === undefined) return null;
      const aimCol = baseCols + 1;
      const rawDx = parseInt(centerOffset, 10);
      const dx = Math.max(1, Math.min(isNaN(rawDx) ? 20 : rawDx, aimCol - 1));
      const c0 = aimCol - dx;
      const r0 = (ru + rd) / 2;
      const k = (rd - ru) / (2 * dx);
      return {
        aimCol,
        center: `(${r0.toFixed(2)}, ${c0})`,
        slope: k.toFixed(3),
        upRow: ru.toFixed(2),
        downRow: rd.toFixed(2),
        dx,
      };
    }

    const row = parseFloat(inputRow);
    const col = parseInt(inputCol, 10);
    const cols = effectiveCols;
    if (
      isNaN(row) ||
      isNaN(col) ||
      row < 1 ||
      row > grid.length ||
      col < 1 ||
      col > (grid[0]?.length || 1) ||
      cols <= 0
    )
      return null;

    let aimCol: number;
    if (aimMode === 'edge-right') aimCol = cols;
    else if (aimMode === 'edge-left') aimCol = 1;
    else {
      const custom = parseInt(customAimCol, 10);
      if (isNaN(custom)) return null;
      aimCol = Math.min(Math.max(1, custom), cols);
    }
    const dx = aimCol - col;
    if (dx === 0) return null;

    const ru2 = aimTargetUpRow.trim() === '' ? undefined : parseInt(aimTargetUpRow, 10);
    const rd2 = aimTargetDownRow.trim() === '' ? undefined : parseInt(aimTargetDownRow, 10);

    if (useIndependentAngles && ru2 !== undefined && rd2 !== undefined) {
      const kUp = (row - ru2) / dx;
      const kDown = (rd2 - row) / dx;
      const upRow = row + (-kUp * dx + 0);
      const downRow = row + (kDown * dx + 0);
      return {
        aimCol,
        center: `(${row.toFixed(2)}, ${col})`,
        slope: `up=${kUp.toFixed(3)}, down=${kDown.toFixed(3)}`,
        upRow: upRow.toFixed(2),
        downRow: downRow.toFixed(2),
        dx,
      };
    }

    const k = parseFloat(inputSlope);
    const bUp = parseFloat(inputBiasUp);
    const bDown = parseFloat(inputBiasDown);
    if (isNaN(k)) return null;

    const upRow = row + (-k * dx + (isNaN(bUp) ? 0 : bUp));
    const downRow = row + (k * dx + (isNaN(bDown) ? 0 : bDown));
    return {
      aimCol,
      center: `(${row.toFixed(2)}, ${col})`,
      slope: k.toFixed(3),
      upRow: upRow.toFixed(2),
      downRow: downRow.toFixed(2),
      dx,
    };
  }, [
    aimTargetUpRow,
    aimTargetDownRow,
    solveMode,
    baseCols,
    centerOffset,
    inputRow,
    inputCol,
    effectiveCols,
    aimMode,
    customAimCol,
    grid,
    useIndependentAngles,
    inputSlope,
    inputBiasUp,
    inputBiasDown,
  ]);

  function handleExport() {
    const payload: ExportPayload = {
      version: 1,
      settings: {
        includeNextCol,
        useDigitalLine,
        useIndependentAngles,
        solveMode,
        defaultDiamondFill: diamondFillDefault,
        defaultDiamondEdge: diamondEdgeDefault,
      },
      diamonds: customDiamonds,
      highlights: highlights.map(h => ({
        ...h,
        digital: !!h.cellsSet,
      })),
    };
    const json = JSON.stringify(payload, null, 2);
    setExportJSON(json);
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(json).catch(() => {});
    }
  }

  function handleImport() {
    setImportMessage('');
    try {
      const parsed = JSON.parse(importJSON);

      if (!parsed || typeof parsed !== 'object') {
        setImportMessage('Import error: top-level is not an object.');
        return;
      }

      if (parsed.version && parsed.version !== 1) {
        setImportMessage(`Warning: Unknown version ${parsed.version}, attempting best-effort import.`);
      }

      if (parsed.diamonds) {
        if (!Array.isArray(parsed.diamonds)) {
          setImportMessage('Import error: diamonds is not an array.');
          return;
        }
        const cleanedDiamonds: Diamond[] = parsed.diamonds
          .filter(
            (d: any) =>
              d &&
              Number.isInteger(d.centerRow) &&
              Number.isInteger(d.centerCol) &&
              Number.isInteger(d.radius) &&
              d.radius > 0
          )
          .map((d: any) => ({
            centerRow: d.centerRow,
            centerCol: d.centerCol,
            radius: d.radius,
            rawRadius: Number.isInteger(d.rawRadius) ? d.rawRadius : d.radius,
            clipped: !!d.clipped,
            clipMode: d.clipMode === 'partial' || d.clipMode === 'shrunk' ? d.clipMode : undefined,
            fillColor: typeof d.fillColor === 'string' ? d.fillColor : diamondFillDefault,
            edgeColor: typeof d.edgeColor === 'string' ? d.edgeColor : diamondEdgeDefault,
            boundaryOnly: !!d.boundaryOnly,
            shape:
              d.shape === 'manhattan' || d.shape === 'square' || d.shape === 'circle' || d.shape === 'doubleHelix'
                ? d.shape
                : undefined,
          }));
        setCustomDiamonds(cleanedDiamonds);
      }

      if (parsed.highlights) {
        if (!Array.isArray(parsed.highlights)) {
          setImportMessage('Import error: highlights is not an array.');
          return;
        }
        const rebuilt: HighlightShape[] = parsed.highlights
          .filter(
            (h: any) =>
              h &&
              typeof h.row === 'number' &&
              typeof h.col === 'number' &&
              Number.isInteger(h.radius) &&
              h.radius >= 0
          )
          .map((h: any) => {
            const slope = typeof h.slope === 'number' ? h.slope : 1;
            const tol = typeof h.tol === 'number' ? h.tol : 0.49;
            const biasUp = typeof h.biasUp === 'number' ? h.biasUp : 0;
            const biasDown = typeof h.biasDown === 'number' ? h.biasDown : 0;
            const slopeUp = typeof h.slopeUp === 'number' ? h.slopeUp : undefined;
            const slopeDown = typeof h.slopeDown === 'number' ? h.slopeDown : undefined;
            const renderStyle = h.renderStyle === 'hatch' || h.renderStyle === 'solid' ? h.renderStyle : 'solid';
            const color =
              typeof h.color === 'string' && h.color.startsWith('rgba') ? h.color : DEFAULT_COLOR;

            let cellsSet: Set<string> | undefined;
            if (h.digital) {
              cellsSet = buildDigitalCells(
                h.row,
                h.col,
                h.radius,
                slope,
                biasUp,
                biasDown,
                grid.length,
                effectiveCols,
                slopeUp,
                slopeDown
              );
            }

            return {
              row: h.row,
              col: h.col,
              radius: h.radius,
              color,
              slope,
              biasUp,
              biasDown,
              tol,
              slopeUp,
              slopeDown,
              cellsSet,
              renderStyle,
            } as HighlightShape;
          });
        setHighlights(rebuilt);
      }

      if (parsed.settings && typeof parsed.settings === 'object') {
        const s = parsed.settings;
        if (typeof s.includeNextCol === 'boolean') setIncludeNextCol(s.includeNextCol);
        if (typeof s.useDigitalLine === 'boolean') setUseDigitalLine(s.useDigitalLine);
        if (typeof s.useIndependentAngles === 'boolean') setUseIndependentAngles(s.useIndependentAngles);
        if (s.solveMode === 'targets-only' || s.solveMode === 'center-and-targets') setSolveMode(s.solveMode);
        if (typeof s.defaultDiamondFill === 'string') setDiamondFillDefault(s.defaultDiamondFill);
        if (typeof s.defaultDiamondEdge === 'string') setDiamondEdgeDefault(s.defaultDiamondEdge);
      }

      setImportMessage('Import successful.');
    } catch (e: any) {
      setImportMessage(`Import error: ${e.message}`);
    }
  }

  const gridKey = grid.map(r => r.join(',')).join('|');
  const highlightsKey = highlights
    .map(
      h =>
        `${h.row}-${h.col}-${h.radius}-${h.color}-${h.slope ?? 1}-${h.biasUp ?? 0}-${h.biasDown ?? 0}-${
          h.tol ?? 0.5
        }-${h.slopeUp ?? ''}-${h.slopeDown ?? ''}-${h.renderStyle ?? 'solid'}`
    )
    .join('|');
  const diamondsKey = allDiamonds
    .map(
      d =>
        `${d.centerRow}-${d.centerCol}-${d.radius}-${d.fillColor}-${d.edgeColor}-${d.boundaryOnly}-${d.clipMode}-${
          d.shape ?? defaultShape
        }`
    )
    .join('|');
  const tableKey = `${gridKey}::${highlightsKey}::${diamondsKey}::next=${includeNextCol}`;

  const disableCenterInputs = solveMode === 'targets-only';

  /* ------------------------------- Rendering ------------------------------ */

  const renderControls = () => (
    <>
      {/* Aim Helper */}
      <div
        style={{
          marginTop: 10,
          marginBottom: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          background: '#f7f7f7',
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: '8px 10px',
        }}
      >
        <b>Aim helper:</b>
        <label>
          Solve using:{' '}
          <select value={solveMode} onChange={e => setSolveMode(e.target.value as SolveMode)}>
            <option value="targets-only">Targets only (compute center)</option>
            <option value="center-and-targets">Center + Targets</option>
          </select>
        </label>
        <label title={disableCenterInputs ? 'Computed in targets-only' : 'Center row (1-based)'}>
          Row:{' '}
          <input
            type="number"
            min={1}
            max={grid.length}
            value={inputRow}
            onChange={e => setInputRow(e.target.value)}
            style={{ width: 70 }}
            disabled={disableCenterInputs}
          />
        </label>
        <label title={disableCenterInputs ? 'Computed in targets-only' : 'Center column (1-based)'}>
          Col:{' '}
          <input
            type="number"
            min={1}
            max={grid[0]?.length || 1}
            value={inputCol}
            onChange={e => setInputCol(e.target.value)}
            style={{ width: 70 }}
            disabled={disableCenterInputs}
          />
        </label>
        {solveMode === 'center-and-targets' && (
          <>
            <label>
              Aim to:{' '}
              <select value={aimMode} onChange={e => setAimMode(e.target.value as any)}>
                <option value="edge-right">Right edge</option>
                <option value="edge-left">Left edge</option>
                <option value="custom-col">Custom column…</option>
              </select>
            </label>
            {aimMode === 'custom-col' && (
              <label>
                Column:{' '}
                <input
                  type="number"
                  min={1}
                  max={effectiveCols}
                  value={customAimCol}
                  onChange={e => setCustomAimCol(e.target.value)}
                  style={{ width: 80 }}
                />
              </label>
            )}
          </>
        )}
        <label>
          Target Up @ Next:{' '}
          <input
            type="number"
            min={1}
            max={grid.length}
            value={aimTargetUpRow}
            onChange={e => setAimTargetUpRow(e.target.value)}
            style={{ width: 90 }}
            placeholder="required"
          />
        </label>
        <label>
          Target Down @ Next:{' '}
          <input
            type="number"
            min={1}
            max={grid.length}
            value={aimTargetDownRow}
            onChange={e => setAimTargetDownRow(e.target.value)}
            style={{ width: 100 }}
            placeholder="required"
          />
        </label>
        {solveMode === 'targets-only' && (
          <label title="Columns between center and Next">
            Center offset:{' '}
            <input
              type="number"
              min={1}
              max={Math.max(1, baseCols + 1 - 1)}
              value={centerOffset}
              onChange={e => setCenterOffset(e.target.value)}
              style={{ width: 80 }}
            />
          </label>
        )}
        <label>
          Color:{' '}
          <input
            type="color"
            value={/^rgba?\(/.test(inputColor) ? '#ff0000' : inputColor || '#ff0000'}
            onChange={e => {
              const hex = e.target.value;
              setInputColor(
                `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(
                  hex.slice(3, 5),
                  16
                )},${parseInt(hex.slice(5, 7), 16)},0.3)`
              );
            }}
            style={{ width: 32, height: 22, padding: 0, border: 'none' }}
          />
        </label>
        <label>
          Style:{' '}
          <select
            value={renderStyle}
            onChange={e => setRenderStyle(e.target.value as HighlightRenderStyle)}
            style={{ width: 80 }}
          >
            <option value="solid">Solid</option>
            <option value="hatch">Hatch</option>
          </select>
        </label>
        <button onClick={() => handleAimCompute(false)}>Compute</button>
        <button onClick={() => handleAimCompute(true)} style={{ fontWeight: 700 }}>
          Compute + Add
        </button>
        {preview && (
          <span style={{ fontSize: 12, color: '#555' }}>
            Aim col: <b>{preview.aimCol}</b>, Center≈<b>{preview.center}</b>, k=<b>{preview.slope}</b>, Δx=
            <b>{preview.dx}</b>, Up≈<b>{preview.upRow}</b>, Down≈<b>{preview.downRow}</b>
          </span>
        )}
        <div style={{ width: '100%', display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={includeNextCol}
              onChange={e => setIncludeNextCol(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Include Next column
          </label>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={useDigitalLine}
              onChange={e => setUseDigitalLine(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            One-cell digital line
          </label>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={useIndependentAngles}
              onChange={e => setUseIndependentAngles(e.target.checked)}
              style={{ marginRight: 6 }}
              disabled={solveMode === 'targets-only'}
            />
            Independent arm angles
          </label>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={showDiamonds}
              onChange={e => setShowDiamonds(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Show diamonds
          </label>
        </div>
      </div>

      {/* Manual Diamond Creator */}
      <div
        style={{
          marginBottom: 10,
          padding: '8px 10px',
          border: '1px solid #bcd',
          background: '#f5faff',
          borderRadius: 6,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        <b>Manual Diamond (West & North points)</b>
        <label style={{ fontSize: 12 }}>
          West Row:
          <input
            type="number"
            style={{ width: 70 }}
            value={manualWestRow}
            onChange={e => setManualWestRow(e.target.value)}
            min={1}
            max={grid.length}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          West Col:
          <input
            type="number"
            style={{ width: 70 }}
            value={manualWestCol}
            onChange={e => setManualWestCol(e.target.value)}
            min={1}
            max={baseCols}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          North Row:
          <input
            type="number"
            style={{ width: 70 }}
            value={manualNorthRow}
            onChange={e => setManualNorthRow(e.target.value)}
            min={1}
            max={grid.length}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          North Col:
          <input
            type="number"
            style={{ width: 70 }}
            value={manualNorthCol}
            onChange={e => setManualNorthCol(e.target.value)}
            min={1}
            max={baseCols}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={allowApproxDiamond}
            onChange={e => setAllowApproxDiamond(e.target.checked)}
            style={{ marginRight: 4 }}
          />
          Allow ±1 mismatch
        </label>
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={autoClipDiamond}
            onChange={e => setAutoClipDiamond(e.target.checked)}
            style={{ marginRight: 4 }}
            disabled={permitPartialDiamond}
          />
          Auto-clip
        </label>
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={permitPartialDiamond}
            onChange={e => setPermitPartialDiamond(e.target.checked)}
            style={{ marginRight: 4 }}
            disabled={autoClipDiamond}
          />
          Permit partial (no shrink)
        </label>
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={diamondBoundaryOnly}
            onChange={e => setDiamondBoundaryOnly(e.target.checked)}
            style={{ marginRight: 4 }}
          />
          Boundary only
        </label>
        <label style={{ fontSize: 12 }}>
          Fill:
          <input
            type="color"
            value={/^rgba?\(/.test(diamondFillDefault) ? '#ff00b4' : diamondFillDefault}
            onChange={e => {
              const hex = e.target.value;
              setDiamondFillDefault(
                `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(
                  hex.slice(5, 7),
                  16
                )},0.30)`
              );
            }}
            style={{ width: 40, marginLeft: 4 }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          Edge:
          <input
            type="color"
            value={/^rgba?\(/.test(diamondEdgeDefault) ? '#ff00b4' : diamondEdgeDefault}
            onChange={e => {
              const hex = e.target.value;
              setDiamondEdgeDefault(
                `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(
                  hex.slice(5, 7),
                  16
                )},0.85)`
              );
            }}
            style={{ width: 40, marginLeft: 4 }}
          />
        </label>
        <button onClick={handleAddManualDiamond} style={{ fontWeight: 600 }}>
          Add Diamond
        </button>
        {diamondMessage && (
          <span
            style={{
              fontSize: 12,
              color: /Added/.test(diamondMessage) ? 'green' : '#c00',
              flexBasis: '100%',
            }}
          >
            {diamondMessage}
          </span>
        )}
      </div>

      {/* Diamond List / Edit */}
      {allDiamonds.length > 0 && (
        <details style={{ marginBottom: 10 }}>
          <summary style={{ cursor: 'pointer' }}>
            <b>Diamonds ({allDiamonds.length})</b>
          </summary>
          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4 }}>
            {allDiamonds.map((d, idx) => {
              const autoLen = diamonds.length;
              const isCustom = idx >= autoLen;
              const clipInfo = d.clipMode === 'partial' ? ' (partial)' : d.clipMode === 'shrunk' ? ' (shrunk)' : '';
              return (
                <div
                  key={d.id || idx}
                  style={{
                    padding: '4px 6px',
                    marginBottom: 4,
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    background: '#fafafa',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>
                    #{idx + 1} center=({d.centerRow + 1},{d.centerCol + 1}) r={d.radius}
                    {clipInfo}
                    {d.rawRadius && d.rawRadius !== d.radius
                      ? ` raw=${d.rawRadius}`
                      : d.clipMode === 'partial'
                      ? ' raw preserved'
                      : ''}
                    {d.boundaryOnly ? ' [boundary-only]' : ''}
                    {d.shape ? ` shape=${d.shape}` : ''}
                  </span>

                  {isCustom && (
                    <>
                      <DiamondShapeSelector
                        diamond={d}
                        onChange={updated => updateDiamondShape(idx, updated.shape ?? 'manhattan')}
                      />

                      <label>
                        Fill:
                        <input
                          type="color"
                          value={/^rgba?\(/.test(d.fillColor || '') ? '#ff00b4' : d.fillColor || '#ff00b4'}
                          onChange={e => {
                            const hex = e.target.value;
                            updateDiamondColor(
                              idx,
                              `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(
                                hex.slice(5, 7),
                                16
                              )},0.30)`
                            );
                          }}
                          style={{ width: 36, marginLeft: 4 }}
                        />
                      </label>

                      <label>
                        Edge:
                        <input
                          type="color"
                          value={/^rgba?\(/.test(d.edgeColor || '') ? '#ff00b4' : d.edgeColor || '#ff00b4'}
                          onChange={e => {
                            const hex = e.target.value;
                            updateDiamondColor(
                              idx,
                              undefined,
                              `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(
                                hex.slice(5, 7),
                                16
                              )},0.85)`
                            );
                          }}
                          style={{ width: 36, marginLeft: 4 }}
                        />
                      </label>

                      <button onClick={() => toggleDiamondBoundaryOnly(idx)} style={{ fontSize: 11 }}>
                        {d.boundaryOnly ? 'Fill On' : 'Boundary Only'}
                      </button>

                      <button onClick={() => handleRemoveDiamond(idx)} style={{ fontSize: 11, color: '#c00' }}>
                        Remove
                      </button>
                    </>
                  )}

                  {!isCustom && <span style={{ color: '#999' }}>auto</span>}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Diamond center presets */}
      <div
        style={{
          marginBottom: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          background: '#fffdf5',
          border: '1px solid #f0d580',
          borderRadius: 6,
          padding: '8px 10px',
        }}
      >
        <b>Center from diamond:</b>
        <select
          value={Math.min(selectedDiamondIdx, Math.max(0, diamondOptions.length - 1))}
          onChange={e => setSelectedDiamondIdx(Number(e.target.value))}
          disabled={diamondOptions.length === 0}
        >
          {diamondOptions.length > 0 ? (
            diamondOptions.map((opt, i) => (
              <option key={i} value={i}>
                {opt.label}
              </option>
            ))
          ) : (
            <option>No diamonds</option>
          )}
        </select>
        <button onClick={() => setCenterFromDiamond('top')} disabled={!selectedDiamond || solveMode === 'targets-only'}>
          Use Top
        </button>
        <button
          onClick={() => setCenterFromDiamond('bottom')}
          disabled={!selectedDiamond || solveMode === 'targets-only'}
        >
          Use Bottom
        </button>
        <button onClick={() => setCenterFromDiamond('left')} disabled={!selectedDiamond || solveMode === 'targets-only'}>
          Use Left
        </button>
        <button onClick={() => setCenterFromDiamond('right')} disabled={!selectedDiamond || solveMode === 'targets-only'}>
          Use Right
        </button>
        {diamondOptions.length === 0 && (
          <span style={{ fontSize: 12, color: '#a67c00' }}>Add or load diamonds to enable.</span>
        )}
        {solveMode === 'targets-only' && (
          <span style={{ fontSize: 12, color: '#555' }}>(Center computed; diamond buttons disabled)</span>
        )}
      </div>

      {/* Advanced geometry */}
      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: 'pointer' }}>
          <b>Advanced (optional): Slope, Bias, Thickness</b>
        </summary>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label>
            Slope:
            <input
              type="number"
              step={0.01}
              min={0}
              max={10}
              value={inputSlope}
              onChange={e => setInputSlope(e.target.value)}
              style={{ width: 70 }}
            />
          </label>
          <label>
            Bias Up:
            <input
              type="number"
              step={0.01}
              value={inputBiasUp}
              onChange={e => setInputBiasUp(e.target.value)}
              style={{ width: 70 }}
            />
          </label>
          <label>
            Bias Down:
            <input
              type="number"
              step={0.01}
              value={inputBiasDown}
              onChange={e => setInputBiasDown(e.target.value)}
              style={{ width: 80 }}
            />
          </label>
          <label>
            Thickness (tol):
            <input
              type="number"
              step={0.05}
              min={0.1}
              max={2}
              value={inputTol}
              onChange={e => setInputTol(e.target.value)}
              style={{ width: 80 }}
              title="Used only when digital line OFF"
            />
          </label>
          <label>
            Radius (override):
            <input
              type="number"
              min={1}
              max={Math.max(grid.length, effectiveCols)}
              value={advancedRadius}
              onChange={e => setAdvancedRadius(e.target.value)}
              style={{ width: 90 }}
              title="Blank = auto to aim col"
            />
          </label>
          <button
            onClick={handleAddHighlightAdvanced}
            disabled={solveMode === 'targets-only'}
            title={solveMode === 'targets-only' ? 'Switch to Center+Targets to use Advanced Add' : ''}
          >
            Add Using Advanced
          </button>
        </div>
      </details>

      {/* Highlights list */}
      {highlights.length > 0 && (
        <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
          <b>Highlights:</b>
          {highlights.map((h, idx) => (
            <span key={idx} style={{ marginLeft: 10 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: h.color,
                  border: '1px solid #888',
                  marginRight: 2,
                  verticalAlign: 'middle',
                }}
              />
              ({h.row},{h.col}), r={h.radius}, style={h.renderStyle ?? 'solid'},{' '}
              k={
                h.slopeUp !== undefined || h.slopeDown !== undefined
                  ? `up=${h.slopeUp?.toFixed?.(3) ?? '?'},down=${h.slopeDown?.toFixed?.(3) ?? '?'}`
                  : h.slope?.toFixed?.(3) ?? '1.000'
              }, bu={h.biasUp?.toFixed?.(3) ?? 0}, bd={h.biasDown?.toFixed?.(3) ?? 0}
              <button
                style={{
                  fontSize: 11,
                  marginLeft: 4,
                  verticalAlign: 'middle',
                  color: '#c00',
                }}
                onClick={() => handleRemoveHighlight(idx)}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Export / Import */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer' }}>
          <b>Export / Import Configuration</b>
        </summary>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleExport}>Export (copy JSON)</button>
            <button onClick={() => setExportJSON('')} disabled={!exportJSON}>
              Clear Export
            </button>
          </div>
          {exportJSON && (
            <textarea
              style={{ width: '100%', height: 150, fontSize: 12, fontFamily: 'monospace' }}
              value={exportJSON}
              readOnly
            />
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button onClick={handleImport}>Load Import JSON</button>
            <button
              onClick={() => {
                setImportJSON('');
                setImportMessage('');
              }}
            >
              Clear Import
            </button>
            {importMessage && (
              <span style={{ color: /success/i.test(importMessage) ? 'green' : '#c00', fontSize: 12 }}>
                {importMessage}
              </span>
            )}
          </div>
          <textarea
            style={{ width: '100%', height: 150, fontSize: 12, fontFamily: 'monospace' }}
            placeholder="Paste exported JSON here to import..."
            value={importJSON}
            onChange={e => setImportJSON(e.target.value)}
          />
        </div>
      </details>
    </>
  );

  const renderGrid = () => (
    <div style={{ overflowX: 'auto', border: '1px solid #ccc', background: '#fff' }}>
      <table key={tableKey} style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ background: '#f9f9f9' }}></th>
            {drawLabels.map((label, cIdx) => (
              <th
                key={cIdx}
                style={{
                  minWidth: 20,
                  textAlign: 'center',
                  background: '#f9f9f9',
                  border: '1px solid #eee',
                  opacity: focusedCol !== null && focusedCol !== cIdx ? 0.3 : 1,
                  cursor: 'pointer',
                }}
                onClick={() => onColumnClick?.(cIdx)}
              >
                {label}
              </th>
            ))}
            {includeNextCol && (
              <th
                style={{
                    width: 36,
                    minWidth: 36,
                  textAlign: 'center',
                  background: '#f0f7ff',
                  border: '1px solid #dbeaff',
                  opacity: focusedCol !== null && focusedCol !== drawLabels.length ? 0.3 : 1,
                  cursor: 'pointer',
                }}
                title="Next draw (synthetic column)"
                onClick={() => onColumnClick?.(drawLabels.length)}
              >
                Next
              </th>
            )}
          </tr>
        </thead>
       <tbody>
  {grid.map((rowArr, rIdx) => {
    const isFocusedRow = focusNumber === rIdx + 1;
    const dimCol = (c: number) => focusedCol !== null && focusedCol !== c;

    return (
      <tr key={rIdx}>
        {/* Row header (number label) */}
        <td
          style={{
            textAlign: 'right',
            background: getHeatmapColor(numberCounts[rIdx], minCount, maxCount),
            border: isFocusedRow ? '2px solid #ff9800' : '1px solid #eee',
            fontWeight: 700,
            position: 'sticky',
            left: 0,
            zIndex: 1,
            boxShadow: isFocusedRow ? 'inset 0 0 0 9999px rgba(255,235,59,0.08)' : undefined,
          }}
          title={isFocusedRow ? 'Focused number' : undefined}
        >
          {numberLabels[rIdx]}
        </td>

        {/* Grid cells */}
        {rowArr.map((cell, cIdx) => {
          const highlightInfos = getHighlightInfos(rIdx, cIdx);
          const hasHighlight = highlightInfos.length > 0;
          const firstHighlight = hasHighlight ? highlights[highlightInfos[0].idx] : undefined;

          let usedDiamond: Diamond | undefined;
          let diamondBoundary = false;
          if (showDiamonds) {
            for (const d of allDiamonds) {
              if (d.hidden) continue;
              const info = diamondCellMembership(d, rIdx, cIdx);
              if (info.inside) {
                if (!usedDiamond) usedDiamond = d;
                if (info.boundary) diamondBoundary = true;
              }
            }
          }

          const baseHeat = getHeatmapColor(numberCounts[rIdx], minCount, maxCount);
          let background = baseHeat;
          let bgImage: string | undefined;
          let border = '1px solid #eee';
          const opacity = dimCol(cIdx) ? 0.3 : 1;

          if (hasHighlight) {
            if (firstHighlight?.renderStyle === 'hatch') {
              background = baseHeat;
              bgImage = `repeating-linear-gradient(45deg, ${firstHighlight.color} 0 2px, transparent 2px 4px)`;
            } else {
              background = firstHighlight?.color || baseHeat;
            }
          } else if (usedDiamond && showDiamonds && !usedDiamond.boundaryOnly) {
            background = usedDiamond.fillColor || DEFAULT_DIAMOND_FILL;
          }

          if (!hasHighlight && usedDiamond && showDiamonds && diamondBoundary) {
            border = `1px solid ${usedDiamond.edgeColor || DEFAULT_DIAMOND_EDGE}`;
            if (usedDiamond.boundaryOnly) {
              background = baseHeat;
            }
          }

          const label = drawLabels[cIdx] ?? '';
          const isSimulatedCol = label.endsWith('*');

          let symbol: React.ReactNode = '';
          let cellType = '';
          if (cell === 1) {
            symbol = isSimulatedCol ? <span style={{ color: '#c62828' }}>⬢</span> : '⬢';
            cellType = 'Main';
          } else if (cell === 2) {
            symbol = isSimulatedCol ? <span style={{ color: '#2e7d32' }}>◯</span> : '◯';
            cellType = 'Supp';
          }
          const isPred = predictions && predictions.includes(rIdx + 1) && cIdx === (grid[0]?.length || 1) - 1;
          if (isPred) cellType = cellType ? `${cellType}, Prediction` : 'Prediction';

          let cellTitle = `Number: ${numberLabels[rIdx]}, Draw: ${drawLabels[cIdx]}`;
          if (cellType) cellTitle += `\nType: ${cellType}`;
          if (highlightInfos.length > 0) {
            cellTitle +=
              '\nHighlights: ' +
              highlightInfos
                .map(
                  h =>
                    `#${h.idx + 1} center=(${h.row},${h.col}), r=${h.radius}, slope=${h.slope}, biasUp=${h.biasUp}, biasDown=${h.biasDown}, tol=${h.tol}`
                )
                .join('; ');
          }
          if (showDiamonds) {
            const diamondsHere: string[] = [];
            for (const d of allDiamonds) {
              if (d.hidden) continue;
              const info = diamondCellMembership(d, rIdx, cIdx);
              if (info.inside) {
                const clipTag = d.clipMode === 'partial' ? ' (partial)' : d.clipMode === 'shrunk' ? ' (shrunk)' : '';
                const rawTag =
                  d.rawRadius && d.rawRadius !== d.radius
                    ? ` raw=${d.rawRadius}`
                    : d.clipMode === 'partial'
                    ? ' raw preserved'
                    : '';
                diamondsHere.push(
                  `center=(${d.centerRow + 1},${d.centerCol + 1}), r=${d.radius}${clipTag}${rawTag}${d.shape ? `, shape=${d.shape}` : ''}`
                );
              }
            }
            if (diamondsHere.length > 0) {
              cellTitle += '\nDiamonds: ' + diamondsHere.join('; ');
            }
          }
          cellTitle += `\nHot/Cold: ${numberCounts[rIdx]} times`;

          return (
            <td
              key={cIdx}
              style={{
                width: 20,
                minWidth: 20,
                height: 20,
                textAlign: 'center',
                verticalAlign: 'middle',
                border,
                position: 'relative',
                background,
                backgroundImage: bgImage,
                backgroundSize: '6px 6px',
                padding: 0,
                opacity,
              }}
              title={cellTitle}
            >
              {symbol}
            </td>
          );
        })}

        {/* Next column */}
        {includeNextCol && (
          <td
            key="next"
            style={(() => {
              const cIdx = (grid[0]?.length || 1);
              const opacity = focusedCol !== null && focusedCol !== cIdx ? 0.3 : 1;
              const highlightInfos = getHighlightInfos(rIdx, cIdx);
              const hasHighlight = highlightInfos.length > 0;
              const firstHighlight = hasHighlight ? highlights[highlightInfos[0].idx] : undefined;

              let usedDiamond: Diamond | undefined;
              let diamondBoundary = false;
              if (showDiamonds) {
                for (const d of allDiamonds) {
                  if (d.hidden) continue;
                  const info = diamondCellMembership(d, rIdx, cIdx);
                  if (info.inside) {
                    if (!usedDiamond) usedDiamond = d;
                    if (info.boundary) diamondBoundary = true;
                  }
                }
              }

              const baseHeat = getHeatmapColor(numberCounts[rIdx], minCount, maxCount);
              const style: React.CSSProperties = {
                minWidth: 20,
                height: 20,
                textAlign: 'center',
                position: 'relative',
                cursor: 'pointer',
                background: baseHeat,
                border: '1px solid #eee',
                opacity,
              };

              if (hasHighlight) {
                if (firstHighlight?.renderStyle === 'hatch') {
                  style.backgroundImage = `repeating-linear-gradient(45deg, ${firstHighlight.color} 0 2px, transparent 2px 4px)`;
                } else {
                  style.background = firstHighlight?.color || baseHeat;
                }
              } else if (usedDiamond && showDiamonds && !usedDiamond.boundaryOnly) {
                style.background = usedDiamond.fillColor || DEFAULT_DIAMOND_FILL;
              }

              if (!hasHighlight && usedDiamond && showDiamonds && diamondBoundary) {
                style.border = `1px solid ${usedDiamond.edgeColor || DEFAULT_DIAMOND_EDGE}`;
                if (usedDiamond.boundaryOnly) {
                  style.background = baseHeat;
                }
              }

              if (isFocusedRow) style.boxShadow = 'inset 0 0 0 9999px rgba(255,235,59,0.08)';

              return style;
            })()}
            title={(() => {
              let tt = `Number: ${numberLabels[rIdx]}, Draw: Next`;
              const cIdx = (grid[0]?.length || 1);
              const opacity = focusedCol !== null && focusedCol !== cIdx ? 0.3 : 1;
              const highlightInfos = getHighlightInfos(rIdx, cIdx);
              if (highlightInfos.length > 0) {
                tt +=
                  '\nHighlights: ' +
                  highlightInfos
                    .map(
                      h =>
                        `#${h.idx + 1} center=(${h.row},${h.col}), r=${h.radius}, slope=${h.slope}, biasUp=${h.biasUp}, biasDown=${h.biasDown}, tol=${h.tol}`
                    )
                    .join('; ');
              }
              if (showDiamonds) {
                const ds: string[] = [];
                for (const d of allDiamonds) {
                  if (d.hidden) continue;
                  const info = diamondCellMembership(d, rIdx, cIdx);
                  if (info.inside) {
                    const clipTag = d.clipMode === 'partial' ? ' (partial)' : d.clipMode === 'shrunk' ? ' (shrunk)' : '';
                    const rawTag =
                      d.rawRadius && d.rawRadius !== d.radius
                        ? ` raw=${d.rawRadius}`
                        : d.clipMode === 'partial'
                        ? ' raw preserved'
                        : '';
                    ds.push(`center=(${d.centerRow + 1},${d.centerCol + 1}), r=${d.radius}${clipTag}${rawTag}${d.shape ? `, shape=${d.shape}` : ''}`);
                  }
                }
                if (ds.length > 0) tt += '\nDiamonds: ' + ds.join('; ');
              }
              const isPred = predictions && predictions.includes(rIdx + 1);
              if (isPred) tt += '\nType: Prediction';
              tt += `\nOpacity: ${opacity}`;
              return tt;
            })()}
          >
            {predictions && predictions.includes(rIdx + 1) ? '•' : ''}
          </td>
        )}
      </tr>
    );
  })}
</tbody>
      </table>
    </div>
  );

  return (
    <section style={{ width: '100%' }}>
      {controlsPosition === 'above' && renderControls()}
      {renderGrid()}
      {controlsPosition === 'below' && renderControls()}
    </section>
  );
};
