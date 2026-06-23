import { addHeightsToSolutions, degreesToDms, diagnoseInfluence, dmsToDegrees, solveAllCombinations } from "./solver.js?v=6";
import { benchmarkDatabase } from "./benchmarks.js";
import { downloadReport } from "./report.js?v=2";

const mapRaster = {
  width: 14208,
  height: 11179,
  levels: [
    { href: "./assets/satino-map.jpg", width: 4000, height: 3147 },
    { href: "./assets/satino-map-7104.jpg", width: 7104, height: 5590 },
    { href: "./assets/satino-map-full.jpg", width: 14208, height: 11179 }
  ],
  world: { a: 0.423987599586809927, d: 0.023484333754752899, b: 0.020083610070392936, e: -0.418674356411386839, c: 1303276.8007205629, f: 510374.6552451836 }
};
const initialPoints = benchmarkDatabase.map((point) => ({ id: crypto.randomUUID(), ...point }));
const demoStation = { x: 508500, y: 1306850 };
const initialSelectedPoints = initialPoints.slice(0, 4).sort((a, b) =>
  wrapBearing(a) - wrapBearing(b)
);
function wrapBearing(point) {
  return ((Math.atan2(point.y - demoStation.y, point.x - demoStation.x) * 180 / Math.PI) % 360 + 360) % 360;
}
const initialReadings = initialSelectedPoints.map((point) =>
  ((Math.atan2(point.y - demoStation.y, point.x - demoStation.x) * 180 / Math.PI - 12) % 360 + 360) % 360
);
const wrapDegrees = (value) => ((value % 360) + 360) % 360;
const readingsToAngles = (readings) => readings.map((reading, index) => wrapDegrees(readings[(index + 1) % readings.length] - reading));
const initialDirections = readingsToAngles(initialReadings).map(degreesToDms);
const STORAGE_KEY = "georesect-state-v2";
const coordinateSystems = {
  msk40: { name: "МСК-40", mapEnabled: true },
  utm37n: { name: "UTM 37N", mapEnabled: false }
};
const createUtmPoints = () => Array.from({ length: 4 }, (_, index) => ({
  id: crypto.randomUUID(), name: `UTM пункт ${index + 1}`, x: 0, y: 0, h: 0, hrep: 0
}));
const utmPointDatabase = [
  ["Итуруп", 6213015.384, 386545.623, 198.674, 0],
  ["Лаплас", 6213464.508, 386471.874, 199.332, 0],
  ["Пруд", 6213054.837, 386016.414, 202.523, 0],
  ["Вега", 6212865.506, 386160.522, 201.101, 0],
  ["Фрейя", 6213184.583, 386060.177, 201.557, 0],
  ["Эридан", 6213048.907, 386167.974, 199.925, 0],
  ["Бессель", 6212341.838, 385930.704, 221.877, 0],
  ["Сигма", 6212700.287, 385865.019, 221.576, 0],
  ["База", 6211774.023, 385680.76, 231.765, 0],
  ["Лямбда2", 6212203.484, 385755.692, 220.94, 0],
  ["Осирис", 6213289.155, 386313.066, 199.624, 0],
  ["Картоха", 6212529.269, 385536.007, 217.819, 0],
  ["Ольха", 6212284.4, 386347.332, 217.663, 0],
  ["Аллея", 6211809.445, 385753.326, 231.112, 0],
  ["Бали", 6212633.126, 386182.79, 202.494, 0],
  ["Пекарь", 6212749.752, 386150.076, 201.84, 0],
  ["Гамма", 6212566.997, 386850.024, 198.705, 0],
  ["Эльзас", 6212785.342, 386826.427, 199.054, 0],
  ["Время", 6209921.414, 388640.223, 0, 0],
  ["ЛПУМГ", 6210562.585, 386507.432, 0, 0],
  ["Метеостанция", 6211991.04, 385692.823, 0, 0],
  ["Липа", 6212088.254, 385861.533, 0, 0]
].map(([name, x, y, h, hrep]) => ({ id: crypto.randomUUID(), name, x, y, h, hrep }));
const createWorkspace = (points, selectedIds, directions = initialDirections) => ({
  points,
  selectedIds,
  directions: directions.map((item) => ({ ...item })),
  inputMode: "angles",
  traversal: "clockwise",
  verticalEnabled: false,
  instrumentHeight: 0,
  verticals: Array.from({ length: 4 }, () => ({ sign: 1, degrees: 0, minutes: 0, seconds: 0, targetHeight: 0 }))
});
const initialUtmPoints = structuredClone(utmPointDatabase);
const defaultState = {
  activeSystem: "msk40",
  catalogs: {
    msk40: createWorkspace(structuredClone(initialPoints), initialSelectedPoints.map(({ id }) => id)),
    utm37n: createWorkspace(initialUtmPoints, initialUtmPoints.slice(0, 4).map(({ id }) => id))
  },
  result: null,
  catalogQuery: ""
};
const isLegacyUtmPlaceholder = (workspace) =>
  workspace?.points?.length === 4 && workspace.points.every((point) =>
    point.name?.startsWith("UTM ") && point.x === 0 && point.y === 0 && point.h === 0
  );
const shouldUseDefaultUtmCatalog = (workspace) =>
  !workspace?.points?.some((point) => point.name === "Итуруп") ||
  !workspace?.points?.some((point) => point.name === "Липа") ||
  workspace?.selectedIds?.length !== 4 ||
  workspace?.directions?.length !== 4 ||
  isLegacyUtmPlaceholder(workspace);
const loadWorkspace = (workspace) => Object.assign(state, structuredClone(workspace), { result: null, catalogQuery: "" });
const storeWorkspace = () => {
  state.catalogs[state.activeSystem] = structuredClone({
    points: state.points, selectedIds: state.selectedIds, directions: state.directions,
    inputMode: state.inputMode, traversal: state.traversal, verticalEnabled: state.verticalEnabled,
    instrumentHeight: state.instrumentHeight, verticals: state.verticals
  });
};
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.catalogs && coordinateSystems[saved.activeSystem]) {
      const loaded = {
        ...structuredClone(defaultState),
        ...saved,
        catalogs: { ...structuredClone(defaultState.catalogs), ...saved.catalogs },
        result: null,
        catalogQuery: ""
      };
      if (shouldUseDefaultUtmCatalog(loaded.catalogs.utm37n)) {
        loaded.catalogs.utm37n = structuredClone(defaultState.catalogs.utm37n);
      }
      return { ...loaded, ...structuredClone(loaded.catalogs[loaded.activeSystem]) };
    }
    if (!saved?.points?.length || saved.selectedIds?.length !== 4 || saved.directions?.length !== 4) {
      return { ...structuredClone(defaultState), ...structuredClone(defaultState.catalogs.msk40) };
    }
    const migrated = structuredClone(defaultState);
    migrated.catalogs.msk40 = createWorkspace(saved.points, saved.selectedIds, saved.directions);
    Object.assign(migrated.catalogs.msk40, saved);
    return { ...migrated, ...structuredClone(migrated.catalogs.msk40), result: null, catalogQuery: "" };
  } catch {
    return { ...structuredClone(defaultState), ...structuredClone(defaultState.catalogs.msk40) };
  }
}
const state = loadState();

const app = document.querySelector("#app");
app.innerHTML = `
  <header class="app-header">
    <div class="title"><span class="logo">G</span><div><strong>GeoResect</strong><small>Обратная угловая засечка</small></div></div>
    <div class="header-actions"><label class="system-picker">Система координат <select id="coordinate-system">${Object.entries(coordinateSystems).map(([id, item]) => `<option value="${id}">${item.name}</option>`).join("")}</select></label><span class="database-state"><i></i><b id="point-total"></b> репера</span><button class="ghost" id="reset-demo">Сбросить</button><button class="ghost" id="toggle-catalog">Каталог реперов</button></div>
  </header>

  <main class="app-shell">
    <section class="map-panel">
      <div class="panel-title"><div><h1>Схема засечки</h1><span id="map-state">Предварительное положение</span></div><div class="map-legend"><span><i class="legend-control"></i>Пункт</span><span><i class="legend-station"></i>Станция</span><span><i class="legend-ray"></i>Направление</span></div></div>
      <svg id="scheme" viewBox="0 0 900 680" role="img" aria-label="Схема геодезической засечки"></svg>
      <div class="map-coordinates" id="map-coordinates">X — · Y —</div>
    </section>

    <aside class="control-panel">
      <section class="control-block">
        <div class="block-title"><div><span>01</span><h2>Исходные пункты</h2></div><div class="mode-switch"><button data-mode="angles" class="active">Углы между</button><button data-mode="readings">Отсчёты</button></div></div>
        <div class="input-guide"><p class="input-hint" id="input-hint"></p><select id="traversal"><option value="clockwise">по часовой ↻</option><option value="counterclockwise">против часовой ↺</option></select></div>
        <div class="height-tools"><label><input id="vertical-enabled" type="checkbox"> Высотный расчёт</label><label id="instrument-height-label">Высота инструмента, м <input id="instrument-height" type="number" step="0.001"></label></div>
        <p class="vertical-hint" id="vertical-hint">Вертикальный угол от горизонта: <b>+</b> вверх, <b>−</b> вниз.</p>
        <div class="observations" id="observations"></div>
        <p class="validation" id="validation"></p>
        <button class="primary" id="calculate">Рассчитать</button>
      </section>

      <section class="control-block result-block" id="results">
        <div class="block-title"><div><span>02</span><h2>Результат</h2></div><div class="result-actions"><div class="quality" id="quality">Не рассчитано</div><button class="ghost report-button" id="download-report" disabled>Отчёт Word</button></div></div>
        <div class="summary-cards" id="summary-cards"></div>
        <div class="diagnostics" id="diagnostics"></div>
        <div class="solutions" id="solutions"></div>
        <p class="note">Каждая строка — независимое решение по трём пунктам. При высотном расчёте H определяется как среднее по трём направлениям комбинации.</p>
      </section>
    </aside>
  </main>

  <aside class="catalog-drawer" id="catalog">
    <div class="drawer-head"><div><h2 id="catalog-title">Каталог реперов</h2><span id="catalog-count"></span></div><button class="close" id="close-catalog">×</button></div>
    <div class="catalog-tools"><input id="catalog-search" type="search" placeholder="Поиск по названию"><button class="ghost" id="add-point">+ Добавить</button></div>
    <div class="catalog-table"><table><thead><tr><th>Название</th><th>X, м</th><th>Y, м</th><th>H, м</th><th></th></tr></thead><tbody id="catalog-body"></tbody></table></div>
  </aside>
  <div class="scrim" id="scrim"></div>`;

const format = (value, digits = 3) => Number(value).toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const sortedPoints = () => [...state.points].sort((a, b) => a.name.localeCompare(b.name, "ru", { sensitivity: "base", numeric: true }));
const saveState = () => {
  storeWorkspace();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    activeSystem: state.activeSystem,
    catalogs: state.catalogs
  }));
};
const dmsText = (value) => {
  const dms = degreesToDms(value);
  return `${dms.degrees}°${String(dms.minutes).padStart(2, "0")}′${String(dms.seconds).padStart(2, "0")}″`;
};
const getMeasurements = () => state.directions.map((item) => dmsToDegrees(item.degrees, item.minutes, item.seconds));
const getDirections = () => {
  const values = getMeasurements();
  const sign = state.traversal === "clockwise" ? 1 : -1;
  return state.inputMode === "readings" ? values : [0, sign * values[0], sign * (values[0] + values[1]), sign * (values[0] + values[1] + values[2])];
};
const getRows = () => state.selectedIds.map((id, index) => ({
  point: state.points.find((point) => point.id === id),
  direction: getDirections()[index]
}));
const getVerticals = () => state.verticals.map((item) => ({
  angle: item.sign * dmsToDegrees(item.degrees, item.minutes, item.seconds),
  targetHeight: Number(item.targetHeight)
}));

function renderObservations() {
  const angleNames = ["AB", "BC", "CD", "DA"];
  document.querySelector("#input-hint").innerHTML = state.inputMode === "angles"
    ? `Последовательно: <b>AB, BC, CD, DA</b>. Сумма 360°.`
    : `Введите круговые отсчёты на направления <b>A, B, C, D</b>.`;
  document.querySelector("#traversal").value = state.traversal;
  document.querySelector("#vertical-enabled").checked = state.verticalEnabled;
  document.querySelector("#instrument-height").value = state.instrumentHeight;
  document.querySelector("#instrument-height").disabled = !state.verticalEnabled;
  document.querySelector("#instrument-height-label").classList.toggle("disabled", !state.verticalEnabled);
  document.querySelector("#vertical-hint").hidden = !state.verticalEnabled;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.inputMode));
  document.querySelector("#observations").innerHTML = state.selectedIds.map((selectedId, index) => `
    <div class="observation">
      <span class="point-letter">${String.fromCharCode(65 + index)}</span>
      <select data-point="${index}" aria-label="Пункт ${String.fromCharCode(65 + index)}">${sortedPoints().map((point) => `<option value="${point.id}" ${point.id === selectedId ? "selected" : ""}>${point.name}</option>`).join("")}</select>
      <div class="point-coords">${(() => { const p = state.points.find((item) => item.id === selectedId); return `X ${format(p.x, 2)} · Y ${format(p.y, 2)} · H ${format(p.h, 3)}`; })()}</div>
      <div class="dms"><b>${state.inputMode === "angles" ? angleNames[index] : String.fromCharCode(65 + index)}</b><label><input data-dms="${index}:degrees" aria-label="Градусы ${index + 1}" type="number" value="${state.directions[index].degrees}" min="0" max="359"><span>°</span></label><label><input data-dms="${index}:minutes" aria-label="Минуты ${index + 1}" type="number" value="${state.directions[index].minutes}" min="0" max="59"><span>′</span></label><label><input data-dms="${index}:seconds" aria-label="Секунды ${index + 1}" type="number" value="${state.directions[index].seconds}" min="0" max="59.999" step="0.1"><span>″</span></label></div>
      ${state.verticalEnabled ? `<div class="vertical-inputs"><b>v${String.fromCharCode(65 + index)}</b><select data-vertical="${index}:sign" aria-label="Знак вертикального угла"><option value="1" ${state.verticals[index].sign === 1 ? "selected" : ""}>+</option><option value="-1" ${state.verticals[index].sign === -1 ? "selected" : ""}>−</option></select><label><input data-vertical="${index}:degrees" type="number" value="${state.verticals[index].degrees}" min="0" max="89"><span>°</span></label><label><input data-vertical="${index}:minutes" type="number" value="${state.verticals[index].minutes}" min="0" max="59"><span>′</span></label><label><input data-vertical="${index}:seconds" type="number" value="${state.verticals[index].seconds}" min="0" max="59.999" step="0.1"><span>″</span></label><label class="target-height"><span>h виз., м</span><input data-vertical="${index}:targetHeight" type="number" value="${state.verticals[index].targetHeight}" step="0.001"></label></div>` : ""}
    </div>`).join("");
}

function renderCatalog() {
  const query = state.catalogQuery.trim().toLocaleLowerCase("ru");
  const visible = state.points.filter((point) => point.name.toLocaleLowerCase("ru").includes(query));
  document.querySelector("#catalog-search").value = state.catalogQuery;
  document.querySelector("#point-total").textContent = state.points.length;
  document.querySelector("#coordinate-system").value = state.activeSystem;
  document.querySelector("#catalog-title").textContent = `Каталог реперов · ${coordinateSystems[state.activeSystem].name}`;
  document.querySelector("#catalog-count").textContent = `${visible.length} из ${state.points.length}`;
  document.querySelector("#catalog-body").innerHTML = visible.map((point) => `
    <tr><td><input data-catalog="${point.id}:name" value="${point.name}"></td><td><input data-catalog="${point.id}:x" type="number" value="${point.x}"></td><td><input data-catalog="${point.id}:y" type="number" value="${point.y}"></td><td><input data-catalog="${point.id}:h" type="number" value="${point.h}"></td><td><button class="delete" data-delete="${point.id}" aria-label="Удалить">×</button></td></tr>`).join("");
}

function renderScheme() {
  const rows = getRows().filter(({ point }) => point);
  const solution = state.result?.summary;
  const stationCoordinates = solution
    ? { x: solution.meanX, y: solution.meanY }
    : null;
  const all = rows.map(({ point }) => point).concat(stationCoordinates ? [stationCoordinates] : []);
  const xs = all.map(({ x }) => x), ys = all.map(({ y }) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scaleY = 700 / (maxY - minY || 1);
  const scaleX = 480 / (maxX - minX || 1);
  const project = ({ x, y }) => ({ x: 100 + (y - minY) * scaleY, y: 580 - (x - minX) * scaleX });
  const requestedScale = Math.max(scaleY * Math.hypot(mapRaster.world.a, mapRaster.world.d), scaleX * Math.hypot(mapRaster.world.b, mapRaster.world.e));
  const rasterLevel = mapRaster.levels.find((level) => level.width / mapRaster.width >= requestedScale * 1.4) || mapRaster.levels.at(-1);
  const pixelFactor = mapRaster.width / rasterLevel.width;
  const rasterMatrix = {
    a: scaleY * mapRaster.world.a * pixelFactor,
    b: -scaleX * mapRaster.world.d * pixelFactor,
    c: scaleY * mapRaster.world.b * pixelFactor,
    d: -scaleX * mapRaster.world.e * pixelFactor,
    e: 100 + scaleY * (mapRaster.world.c - minY),
    f: 580 - scaleX * (mapRaster.world.f - minX)
  };
  const station = project(stationCoordinates || { x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  const projectedPoints = rows.map(({ point }) => project(point));
  const angles = state.inputMode === "angles" ? getMeasurements() : [];
  const sweep = state.traversal === "clockwise" ? 1 : 0;
  const arcMarkup = solution && state.inputMode === "angles" ? projectedPoints.map((point, index) => {
    const next = projectedPoints[(index + 1) % projectedPoints.length];
    const radius = 38 + index * 13;
    const startAngle = Math.atan2(point.y - station.y, point.x - station.x);
    const endAngle = Math.atan2(next.y - station.y, next.x - station.x);
    const start = { x: station.x + Math.cos(startAngle) * radius, y: station.y + Math.sin(startAngle) * radius };
    const end = { x: station.x + Math.cos(endAngle) * radius, y: station.y + Math.sin(endAngle) * radius };
    const middle = startAngle + (sweep ? 1 : -1) * angles[index] * Math.PI / 360;
    const label = { x: station.x + Math.cos(middle) * (radius + 12), y: station.y + Math.sin(middle) * (radius + 12) };
    return `<path d="M${start.x},${start.y} A${radius},${radius} 0 ${angles[index] > 180 ? 1 : 0} ${sweep} ${end.x},${end.y}" class="angle-arc"/><text x="${label.x}" y="${label.y}" class="angle-label">${["AB","BC","CD","DA"][index]}</text>`;
  }).join("") : "";
  document.querySelector("#map-state").textContent = solution ? "Результат расчёта" : "Предварительное положение";
  document.querySelector("#map-coordinates").textContent = solution ? `X ${format(solution.meanX)} · Y ${format(solution.meanY)}${Number.isFinite(solution.meanH) ? ` · H ${format(solution.meanH)}` : ""}` : "X — · Y —";
  document.querySelector("#scheme").innerHTML = `
    <defs><pattern id="grid" width="45" height="45" patternUnits="userSpaceOnUse"><path d="M45 0H0V45" fill="none" stroke="#dfe4e2" stroke-width="1"/></pattern></defs>
    ${coordinateSystems[state.activeSystem].mapEnabled ? `<image href="${rasterLevel.href}" width="${rasterLevel.width}" height="${rasterLevel.height}" preserveAspectRatio="none" transform="matrix(${rasterMatrix.a} ${rasterMatrix.b} ${rasterMatrix.c} ${rasterMatrix.d} ${rasterMatrix.e} ${rasterMatrix.f})" class="map-raster"/>` : ""}
    <rect width="900" height="680" fill="url(#grid)" class="map-grid"/>
    ${rows.map(({ point }) => { const p = project(point); return `<line x1="${station.x}" y1="${station.y}" x2="${p.x}" y2="${p.y}" class="ray"/>`; }).join("")}
    ${arcMarkup}
    ${rows.map(({ point }, index) => { const p = project(point); return `<g><circle cx="${p.x}" cy="${p.y}" r="8" class="control-dot"/><text x="${p.x + 16}" y="${p.y - 9}" class="point-label">${String.fromCharCode(65 + index)} · ${point.name}</text><text x="${p.x + 16}" y="${p.y + 10}" class="coord-label">${format(point.x, 1)} / ${format(point.y, 1)}</text></g>`; }).join("")}
    <g><circle cx="${station.x}" cy="${station.y}" r="16" class="station-ring"/><circle cx="${station.x}" cy="${station.y}" r="5" class="station-dot"/><text x="${station.x + 23}" y="${station.y + 4}" class="station-label">P</text></g>`;
}

function renderResults() {
  const cards = document.querySelector("#summary-cards");
  const diagnostics = document.querySelector("#diagnostics");
  const solutions = document.querySelector("#solutions");
  const quality = document.querySelector("#quality");
  document.querySelector("#download-report").disabled = !state.result?.summary;
  if (!state.result?.summary) {
    quality.className = "quality";
    quality.textContent = "Не рассчитано";
    cards.innerHTML = `<div><small>X</small><strong>—</strong></div><div><small>Y</small><strong>—</strong></div>${state.verticalEnabled ? `<div><small>H</small><strong>—</strong></div>` : ""}<div><small>СКП</small><strong>—</strong></div>`;
    diagnostics.innerHTML = "";
    solutions.innerHTML = `<div class="empty">После расчёта здесь появятся четыре решения.</div>`;
    return;
  }
  const { summary } = state.result;
  const qualityText = summary.count < 4 ? `Решено ${summary.count} из 4` : summary.rms < 0.03 ? "Малый разлёт" : summary.rms < 0.1 ? "Средний разлёт" : "Большой разлёт";
  quality.className = `quality ${summary.count < 4 ? "bad" : summary.rms < 0.03 ? "good" : summary.rms < 0.1 ? "warn" : "bad"}`;
  quality.textContent = qualityText;
  cards.innerHTML = `<div><small>Среднее X, м</small><strong>${format(summary.meanX)}</strong></div><div><small>Среднее Y, м</small><strong>${format(summary.meanY)}</strong></div>${Number.isFinite(summary.meanH) ? `<div><small>Среднее H, м</small><strong>${format(summary.meanH)}</strong></div>` : ""}<div><small>Разлёт XY${Number.isFinite(summary.heightRms) ? " / H" : ""}</small><strong>${format(summary.rms * 1000, 1)} мм${Number.isFinite(summary.heightRms) ? ` / ${format(summary.heightRms * 1000, 1)} мм` : ""}</strong></div>`;
  const influence = diagnoseInfluence(state.result, getRows());
  diagnostics.innerHTML = influence.length ? `<div class="diagnostic-title"><strong>Оценка влияния пунктов</strong><span>больше — подозрительнее</span></div>${influence.map((item, index) => `<div class="diagnostic-row ${index === 0 ? "suspect" : ""}"><b>${String.fromCharCode(65 + item.index)} · ${item.name}</b><span>связанные углы ${item.adjacentAngles.join(", ")}</span><strong>${format(item.influence * 1000, 1)} мм</strong></div>`).join("")}<p>Это диагностическая оценка влияния, а не однозначное обнаружение ошибки.</p>` : "";
  solutions.innerHTML = state.result.solutions.map((item, index) => item.ok
    ? `<div class="solution-row"><b>${index + 1}</b><span>${item.names.join(" · ")}</span><strong>${format(item.x)} / ${format(item.y)}${Number.isFinite(item.h) ? ` / H ${format(item.h)}` : ""}</strong><em>XY ${format(item.deviation * 1000, 1)} мм${Number.isFinite(item.heightRms) ? ` · H внут. ${format(item.heightRms * 1000, 1)} мм` : ""}</em></div>`
    : `<div class="solution-row error"><b>${index + 1}</b><span>${item.names.join(" · ")}</span><strong>Решение не найдено</strong></div>`).join("");
}

function renderAll() { renderObservations(); renderCatalog(); renderScheme(); renderResults(); }
function toggleCatalog(open) {
  document.querySelector("#catalog").classList.toggle("open", open);
  document.querySelector("#scrim").classList.toggle("open", open);
}
function switchCoordinateSystem(systemId) {
  if (!coordinateSystems[systemId] || systemId === state.activeSystem) return;
  storeWorkspace();
  state.activeSystem = systemId;
  loadWorkspace(state.catalogs[state.activeSystem]);
  saveState();
  renderAll();
}

document.addEventListener("change", (event) => {
  if (event.target.id === "coordinate-system") {
    switchCoordinateSystem(event.target.value);
  }
  if (event.target.id === "vertical-enabled") {
    state.verticalEnabled = event.target.checked;
    state.result = null;
    saveState();
    renderObservations(); renderResults(); renderScheme();
  }
  if (event.target.id === "traversal") {
    state.traversal = event.target.value;
    state.result = null;
    saveState();
    renderScheme(); renderResults();
  }
  if (event.target.dataset.point !== undefined) {
    state.selectedIds[Number(event.target.dataset.point)] = event.target.value;
    state.result = null;
    saveState();
    renderObservations(); renderScheme(); renderResults();
  }
  if (event.target.dataset.dms) {
    const [index, field] = event.target.dataset.dms.split(":");
    state.directions[Number(index)][field] = Number(event.target.value);
    saveState();
  }
  if (event.target.dataset.vertical) {
    const [index, field] = event.target.dataset.vertical.split(":");
    state.verticals[Number(index)][field] = Number(event.target.value);
    state.result = null;
    saveState();
    renderResults(); renderScheme();
  }
  if (event.target.dataset.catalog) {
    const [id, field] = event.target.dataset.catalog.split(":");
    const point = state.points.find((item) => item.id === id);
    point[field] = field === "name" ? event.target.value : Number(event.target.value);
    state.result = null;
    saveState();
    renderObservations(); renderScheme(); renderResults();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "coordinate-system") {
    switchCoordinateSystem(event.target.value);
  }
  if (event.target.id === "instrument-height") {
    state.instrumentHeight = Number(event.target.value);
    state.result = null;
    saveState();
    renderResults(); renderScheme();
  }
  if (event.target.dataset.dms) {
    const [index, field] = event.target.dataset.dms.split(":");
    state.directions[Number(index)][field] = Number(event.target.value);
    saveState();
  }
  if (event.target.dataset.vertical) {
    const [index, field] = event.target.dataset.vertical.split(":");
    state.verticals[Number(index)][field] = Number(event.target.value);
    state.result = null;
    saveState();
    renderResults(); renderScheme();
  }
  if (event.target.id === "catalog-search") {
    state.catalogQuery = event.target.value;
    renderCatalog();
    const search = document.querySelector("#catalog-search");
    search.value = state.catalogQuery; search.focus();
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#download-report") && state.result?.summary) {
    const button = document.querySelector("#download-report");
    button.disabled = true;
    button.textContent = "Создание…";
    downloadReport({
      state,
      rows: getRows(),
      systemName: coordinateSystems[state.activeSystem].name,
      measurements: state.directions,
      directions: getDirections(),
      verticals: state.verticals,
      influence: diagnoseInfluence(state.result, getRows()),
      svg: document.querySelector("#scheme")
    }).catch((error) => {
      console.error(error);
      document.querySelector("#validation").textContent = "Не удалось создать Word-отчёт.";
    }).finally(() => {
      button.disabled = false;
      button.textContent = "Отчёт Word";
    });
  }
  if (event.target.closest("#calculate")) {
    const validation = document.querySelector("#validation");
    if (new Set(state.selectedIds).size !== 4) { validation.textContent = "Выберите четыре разных пункта."; return; }
    if (state.inputMode === "angles") {
      const closure = getMeasurements().reduce((sum, value) => sum + value, 0) - 360;
      if (Math.abs(closure) > 0.01) {
        validation.textContent = `Невязка суммы углов: ${closure > 0 ? "+" : ""}${format(closure, 4)}°.`;
        return;
      }
    }
    if (state.verticalEnabled) {
      const verticals = getVerticals();
      if (!Number.isFinite(state.instrumentHeight) || verticals.some((item) => !Number.isFinite(item.angle) || !Number.isFinite(item.targetHeight) || Math.abs(item.angle) >= 90)) {
        validation.textContent = "Проверьте вертикальные углы, высоты визирования и высоту инструмента.";
        return;
      }
    }
    validation.textContent = "";
    const rows = getRows();
    state.result = solveAllCombinations(rows);
    if (state.verticalEnabled) addHeightsToSolutions(state.result, rows, getVerticals(), state.instrumentHeight);
    renderResults(); renderScheme();
  }
  if (event.target.closest("#reset-demo")) {
    state.catalogs[state.activeSystem] = structuredClone(defaultState.catalogs[state.activeSystem]);
    loadWorkspace(state.catalogs[state.activeSystem]);
    renderAll();
    saveState();
  }
  if (event.target.closest("#toggle-catalog")) toggleCatalog(true);
  const mode = event.target.closest("[data-mode]")?.dataset.mode;
  if (mode && mode !== state.inputMode) {
    const values = getMeasurements();
    const converted = mode === "angles" ? readingsToAngles(values) : getDirections().map(wrapDegrees);
    state.inputMode = mode;
    state.directions = converted.map(degreesToDms);
    state.result = null;
    saveState();
    renderObservations(); renderResults(); renderScheme();
  }
  if (event.target.closest("#close-catalog") || event.target.id === "scrim") toggleCatalog(false);
  if (event.target.closest("#add-point")) {
    const point = { id: crypto.randomUUID(), name: `Новый пункт ${state.points.length + 1}`, x: 0, y: 0, h: 0 };
    state.points.unshift(point);
    state.catalogQuery = "";
    saveState();
    renderCatalog(); renderObservations();
    const nameInput = document.querySelector(`[data-catalog="${point.id}:name"]`);
    nameInput?.scrollIntoView({ block: "center" });
    nameInput?.focus();
    nameInput?.select();
  }
  const id = event.target.dataset.delete;
  if (id && state.points.length > 4) {
    state.points = state.points.filter((point) => point.id !== id);
    state.selectedIds = state.selectedIds.map((selected, index) => selected === id ? state.points[index % state.points.length].id : selected);
    state.result = null; renderAll();
    saveState();
  }
});

renderAll();
