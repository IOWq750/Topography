const MAP_WIDTH = 8202;
const MAP_HEIGHT = 8592;
const SCAN_PX_PER_METER = 1.58;
const RULER_SIDE_PADDING = 12;

const stage = document.querySelector("#stage");
const mapLayer = document.querySelector("#mapLayer");
const pinLayer = document.querySelector("#pinLayer");
const ruler = document.querySelector("#ruler");
const rulerScale = document.querySelector("#rulerScale");
const protractor = document.querySelector("#protractor");
const protractorCanvas = document.querySelector("#protractorCanvas");

const zoomInput = document.querySelector("#zoom");
const rulerLengthInput = document.querySelector("#rulerLength");
const rulerOpacityInput = document.querySelector("#rulerOpacity");
const protractorSizeInput = document.querySelector("#protractorSize");
const mirrorProtractorInput = document.querySelector("#mirrorProtractor");
const rulerAngleLabel = document.querySelector("#rulerAngle");
const protractorAngleLabel = document.querySelector("#protractorAngle");
const rulerCalibrationLabel = document.querySelector("#rulerCalibration");

const map = {
  x: 0,
  y: 0,
  scale: Number(zoomInput.value),
};

const tools = {
  ruler: {
    el: ruler,
    x: 520,
    y: 340,
    angle: 0,
  },
  protractor: {
    el: protractor,
    x: 760,
    y: 560,
    angle: 0,
  },
};

let activeDrag = null;
let addPinMode = false;
let pins = [];
let zCounter = 10;

function fitMap() {
  const bounds = stage.getBoundingClientRect();
  const scale = Math.min(bounds.width / MAP_WIDTH, bounds.height / MAP_HEIGHT) * 0.96;
  map.scale = clamp(scale, Number(zoomInput.min), Number(zoomInput.max));
  zoomInput.value = map.scale.toFixed(2);
  map.x = (bounds.width - MAP_WIDTH * map.scale) / 2;
  map.y = (bounds.height - MAP_HEIGHT * map.scale) / 2;
  renderMap();
}

function renderMap() {
  mapLayer.style.transform = `translate(${map.x}px, ${map.y}px) scale(${map.scale})`;
  resizeRuler();
  renderPins();
}

function renderTool(name) {
  const tool = tools[name];
  const anchor = name === "protractor"
    ? "translate(-50%, calc(-100% + 3px))"
    : "translate(-50%, -50%)";
  tool.el.style.transform = `translate(${tool.x}px, ${tool.y}px) ${anchor} rotate(${tool.angle}deg)`;

  if (name === "ruler") {
    rulerAngleLabel.textContent = `${normalizeAngle(tool.angle)}°`;
  } else {
    protractorAngleLabel.textContent = `${normalizeAngle(tool.angle)}°`;
  }
}

function renderAllTools() {
  renderTool("ruler");
  renderTool("protractor");
}

function drawRulerScale() {
  rulerScale.innerHTML = "";
  const meters = Number(rulerLengthInput.value);
  const meterStepPx = SCAN_PX_PER_METER * map.scale;
  const usableWidth = meters * meterStepPx;
  const minorStepMeters = 10;
  const totalSteps = Math.floor(meters / minorStepMeters);
  const showMinor = minorStepMeters * meterStepPx >= 3;
  const labelStepMeters = 100 * meterStepPx >= 52 ? 100 : 200 * meterStepPx >= 52 ? 200 : 500;

  for (let i = 0; i <= totalSteps; i += 1) {
    const metersAtTick = i * minorStepMeters;
    const isHundred = metersAtTick % 100 === 0;
    const isFifty = metersAtTick % 50 === 0;

    if (!showMinor && !isFifty && !isHundred) continue;

    const tick = document.createElement("span");
    tick.className = "tick minor";
    if (isHundred) tick.className = "tick major";
    else if (isFifty) tick.className = "tick medium";
    tick.style.left = `${metersAtTick * meterStepPx}px`;
    rulerScale.appendChild(tick);

    if (metersAtTick % labelStepMeters === 0) {
      const label = document.createElement("span");
      label.className = "tick-label";
      label.style.left = `${metersAtTick * meterStepPx}px`;
      label.textContent = String(metersAtTick);
      rulerScale.appendChild(label);
    }
  }

  rulerCalibrationLabel.textContent = `${meters} м`;
  ruler.style.width = `${usableWidth + RULER_SIDE_PADDING * 2}px`;
}

function drawProtractor() {
  const canvas = protractorCanvas;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height - 6;
  const radius = Math.min(width / 2 - 20, height - 18);
  const mirror = mirrorProtractorInput.checked;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(232, 248, 247, 0.66)";
  ctx.strokeStyle = "rgba(18, 58, 64, 0.84)";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(centerX - radius, centerY);
  ctx.arc(centerX, centerY, radius, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.54, Math.PI, 0);
  ctx.strokeStyle = "rgba(18, 58, 64, 0.38)";
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let deg = 0; deg <= 180; deg += 1) {
    const rad = Math.PI - (deg * Math.PI) / 180;
    const isTen = deg % 10 === 0;
    const isFive = deg % 5 === 0;
    const length = isTen ? 25 : isFive ? 16 : 9;
    const outer = pointOnArc(centerX, centerY, radius, rad);
    const inner = pointOnArc(centerX, centerY, radius - length, rad);

    ctx.beginPath();
    ctx.moveTo(outer.x, outer.y);
    ctx.lineTo(inner.x, inner.y);
    ctx.strokeStyle = isTen ? "rgba(22, 31, 34, 0.88)" : "rgba(22, 31, 34, 0.62)";
    ctx.lineWidth = isTen ? 2 : 1;
    ctx.stroke();

    if (isTen) {
      const value = mirror ? 180 - deg : deg;
      const label = pointOnArc(centerX, centerY, radius - 43, rad);
      ctx.save();
      ctx.translate(label.x, label.y);
      ctx.rotate(rad - Math.PI / 2);
      ctx.fillStyle = "#1b2729";
      ctx.font = "24px Segoe UI, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), 0, 0);
      ctx.restore();
    }
  }

  ctx.beginPath();
  ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#b64c31";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  ctx.strokeStyle = "rgba(22, 31, 34, 0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function pointOnArc(cx, cy, radius, radians) {
  return {
    x: cx + Math.cos(radians) * radius,
    y: cy - Math.sin(radians) * radius,
  };
}

function startInstrumentDrag(event) {
  const instrument = event.target.closest(".instrument");
  if (!instrument) return;

  const mode = event.target.dataset.drag;
  if (!mode) return;

  event.preventDefault();
  const name = instrument.dataset.tool;
  const tool = tools[name];
  const rect = stage.getBoundingClientRect();
  const start = pointerInStage(event, rect);
  tool.el.style.zIndex = String(++zCounter);

  activeDrag = {
    type: "instrument",
    mode,
    name,
    pointerId: event.pointerId,
    startX: start.x,
    startY: start.y,
    toolX: tool.x,
    toolY: tool.y,
    angle: tool.angle,
    basePointerAngle: angleBetween(tool.x, tool.y, start.x, start.y),
  };

  event.target.setPointerCapture(event.pointerId);
}

function startMapDrag(event) {
  if (event.target.closest(".instrument") || addPinMode) return;
  event.preventDefault();
  const rect = stage.getBoundingClientRect();
  const start = pointerInStage(event, rect);
  activeDrag = {
    type: "map",
    pointerId: event.pointerId,
    startX: start.x,
    startY: start.y,
    mapX: map.x,
    mapY: map.y,
  };
  stage.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  const rect = stage.getBoundingClientRect();
  const point = pointerInStage(event, rect);

  if (activeDrag.type === "map") {
    map.x = activeDrag.mapX + point.x - activeDrag.startX;
    map.y = activeDrag.mapY + point.y - activeDrag.startY;
    renderMap();
    return;
  }

  const tool = tools[activeDrag.name];

  if (activeDrag.mode === "move") {
    tool.x = activeDrag.toolX + point.x - activeDrag.startX;
    tool.y = activeDrag.toolY + point.y - activeDrag.startY;
  } else {
    const current = angleBetween(tool.x, tool.y, point.x, point.y);
    tool.angle = activeDrag.angle + current - activeDrag.basePointerAngle;
  }

  renderTool(activeDrag.name);
}

function stopDrag(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  activeDrag = null;
}

function handleWheel(event) {
  if (event.ctrlKey) return;
  event.preventDefault();

  const rect = stage.getBoundingClientRect();
  const pointer = pointerInStage(event, rect);
  const oldScale = map.scale;
  const factor = event.deltaY < 0 ? 1.08 : 0.92;
  const newScale = clamp(oldScale * factor, Number(zoomInput.min), Number(zoomInput.max));
  const mapPointX = (pointer.x - map.x) / oldScale;
  const mapPointY = (pointer.y - map.y) / oldScale;

  map.scale = newScale;
  zoomInput.value = newScale.toFixed(2);
  map.x = pointer.x - mapPointX * newScale;
  map.y = pointer.y - mapPointY * newScale;
  renderMap();
}

function handleStageClick(event) {
  if (!addPinMode || event.target.closest(".instrument")) return;
  const rect = stage.getBoundingClientRect();
  const pointer = pointerInStage(event, rect);
  const x = (pointer.x - map.x) / map.scale;
  const y = (pointer.y - map.y) / map.scale;

  if (x < 0 || y < 0 || x > MAP_WIDTH || y > MAP_HEIGHT) return;

  pins.push({ x, y });
  addPinMode = false;
  document.querySelector('[data-action="add-pin"]').classList.remove("active");
  renderPins();
}

function renderPins() {
  pinLayer.innerHTML = "";
  pins.forEach((pin, index) => {
    const marker = document.createElement("span");
    marker.className = "pin";
    marker.dataset.label = String(index + 1);
    marker.style.left = `${map.x + pin.x * map.scale}px`;
    marker.style.top = `${map.y + pin.y * map.scale}px`;
    pinLayer.appendChild(marker);
  });
}

function pointerInStage(event, rect) {
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function angleBetween(cx, cy, x, y) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

function normalizeAngle(angle) {
  const normalized = Math.round(((angle % 360) + 360) % 360);
  return normalized === 360 ? 0 : normalized;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resizeRuler() {
  ruler.style.opacity = rulerOpacityInput.value;
  drawRulerScale();
}

function resizeProtractor() {
  const size = Number(protractorSizeInput.value);
  protractor.style.width = `${size}px`;
  protractor.style.height = `${size / 2}px`;
  drawProtractor();
}

function resetTools() {
  const bounds = stage.getBoundingClientRect();
  tools.ruler.x = bounds.width * 0.36;
  tools.ruler.y = bounds.height * 0.30;
  tools.ruler.angle = 0;
  tools.protractor.x = bounds.width * 0.70;
  tools.protractor.y = bounds.height * 0.78;
  tools.protractor.angle = 0;
  tools.ruler.el.style.zIndex = "11";
  tools.protractor.el.style.zIndex = "10";
  renderAllTools();
}

document.addEventListener("pointerdown", startInstrumentDrag);
stage.addEventListener("pointerdown", startMapDrag);
document.addEventListener("pointermove", handlePointerMove);
document.addEventListener("pointerup", stopDrag);
document.addEventListener("pointercancel", stopDrag);
stage.addEventListener("wheel", handleWheel, { passive: false });
stage.addEventListener("click", handleStageClick);

zoomInput.addEventListener("input", () => {
  const bounds = stage.getBoundingClientRect();
  const center = { x: bounds.width / 2, y: bounds.height / 2 };
  const oldScale = map.scale;
  const nextScale = Number(zoomInput.value);
  const mapPointX = (center.x - map.x) / oldScale;
  const mapPointY = (center.y - map.y) / oldScale;
  map.scale = nextScale;
  map.x = center.x - mapPointX * nextScale;
  map.y = center.y - mapPointY * nextScale;
  renderMap();
});

rulerLengthInput.addEventListener("input", resizeRuler);
rulerOpacityInput.addEventListener("input", resizeRuler);
protractorSizeInput.addEventListener("input", resizeProtractor);
mirrorProtractorInput.addEventListener("change", drawProtractor);

document.querySelector('[data-action="toggle-ruler"]').addEventListener("click", (event) => {
  event.currentTarget.classList.toggle("active");
  ruler.classList.toggle("hidden");
});

document.querySelector('[data-action="toggle-protractor"]').addEventListener("click", (event) => {
  event.currentTarget.classList.toggle("active");
  protractor.classList.toggle("hidden");
});

document.querySelector('[data-action="add-pin"]').addEventListener("click", (event) => {
  addPinMode = !addPinMode;
  event.currentTarget.classList.toggle("active", addPinMode);
});

document.querySelector('[data-action="clear-pins"]').addEventListener("click", () => {
  pins = [];
  renderPins();
});

document.querySelector('[data-action="reset-view"]').addEventListener("click", fitMap);
document.querySelector('[data-action="reset-tools"]').addEventListener("click", resetTools);

window.addEventListener("resize", () => {
  renderMap();
  renderAllTools();
});

resizeRuler();
resizeProtractor();
fitMap();
resetTools();
