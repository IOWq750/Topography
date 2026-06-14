const TAU = Math.PI * 2;

export const toRad = (degrees) => degrees * Math.PI / 180;
export const toDeg = (radians) => radians * 180 / Math.PI;
export const wrapRad = (angle) => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;

export function dmsToDegrees(degrees, minutes, seconds) {
  const sign = Number(degrees) < 0 ? -1 : 1;
  return sign * (Math.abs(Number(degrees) || 0) + (Number(minutes) || 0) / 60 + (Number(seconds) || 0) / 3600);
}

export function degreesToDms(value) {
  const normalized = ((value % 360) + 360) % 360;
  let degrees = Math.floor(normalized);
  let minutes = Math.floor((normalized - degrees) * 60);
  let seconds = Math.round(((normalized - degrees) * 60 - minutes) * 60 * 10) / 10;
  if (seconds >= 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes = 0;
    degrees = (degrees + 1) % 360;
  }
  return { degrees, minutes, seconds };
}

export function calculateStationHeight(point, station, verticalDegrees, targetHeight = 0, instrumentHeight = 0) {
  const distance = Math.hypot(point.x - station.x, point.y - station.y);
  return point.h + targetHeight - instrumentHeight - distance * Math.tan(toRad(verticalDegrees));
}

export function addHeightsToSolutions(result, rows, verticals, instrumentHeight) {
  if (!result.summary) return result;
  const validHeights = [];

  result.solutions.forEach((solution) => {
    if (!solution.ok) return;
    const estimates = solution.indices.map((index) => calculateStationHeight(
      rows[index].point,
      solution,
      verticals[index].angle,
      verticals[index].targetHeight,
      instrumentHeight
    ));
    solution.heightEstimates = estimates;
    solution.h = estimates.reduce((sum, value) => sum + value, 0) / estimates.length;
    solution.heightRms = Math.sqrt(estimates.reduce((sum, value) => sum + (value - solution.h) ** 2, 0) / estimates.length);
    validHeights.push(solution);
  });

  if (!validHeights.length) return result;
  result.summary.meanH = validHeights.reduce((sum, item) => sum + item.h, 0) / validHeights.length;
  validHeights.forEach((item) => {
    item.heightDeviation = Math.abs(item.h - result.summary.meanH);
  });
  result.summary.heightRms = Math.sqrt(validHeights.reduce((sum, item) => sum + item.heightDeviation ** 2, 0) / validHeights.length);
  result.summary.heightCount = validHeights.length;
  return result;
}

export function diagnoseInfluence(result, rows) {
  const valid = result.solutions.filter(({ ok }) => ok);
  if (valid.length < 4) return [];
  return rows.map(({ point }, excludedIndex) => {
    const excludedSolution = valid.find(({ indices }) => !indices.includes(excludedIndex));
    const includedSolutions = valid.filter(({ indices }) => indices.includes(excludedIndex));
    const meanX = includedSolutions.reduce((sum, item) => sum + item.x, 0) / includedSolutions.length;
    const meanY = includedSolutions.reduce((sum, item) => sum + item.y, 0) / includedSolutions.length;
    return {
      index: excludedIndex,
      name: point.name,
      influence: Math.hypot(excludedSolution.x - meanX, excludedSolution.y - meanY),
      adjacentAngles: [
        `${String.fromCharCode(65 + ((excludedIndex + 3) % 4))}${String.fromCharCode(65 + excludedIndex)}`,
        `${String.fromCharCode(65 + excludedIndex)}${String.fromCharCode(65 + ((excludedIndex + 1) % 4))}`
      ]
    };
  }).sort((a, b) => b.influence - a.influence);
}

function solve3(matrix, vector) {
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-14) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j < 4; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j < 4; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[3]);
}

function evaluate(params, observations) {
  const [x, y, orientation] = params;
  return observations.map(({ point, direction }) => {
    const bearing = Math.atan2(point.y - y, point.x - x);
    return wrapRad(bearing - orientation - direction);
  });
}

function refine(start, observations, scale) {
  let params = [...start];
  let damping = 1e-5;
  let residuals = evaluate(params, observations);
  let score = residuals.reduce((sum, value) => sum + value * value, 0);

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const steps = [Math.max(scale * 1e-6, 1e-4), Math.max(scale * 1e-6, 1e-4), 1e-7];
    const jacobian = residuals.map(() => [0, 0, 0]);
    for (let col = 0; col < 3; col += 1) {
      const shifted = [...params];
      shifted[col] += steps[col];
      const next = evaluate(shifted, observations);
      next.forEach((value, row) => {
        jacobian[row][col] = wrapRad(value - residuals[row]) / steps[col];
      });
    }

    const normal = Array.from({ length: 3 }, () => [0, 0, 0]);
    const rhs = [0, 0, 0];
    jacobian.forEach((row, i) => {
      for (let a = 0; a < 3; a += 1) {
        rhs[a] -= row[a] * residuals[i];
        for (let b = 0; b < 3; b += 1) normal[a][b] += row[a] * row[b];
      }
    });
    for (let i = 0; i < 3; i += 1) normal[i][i] += damping;
    const delta = solve3(normal, rhs);
    if (!delta) break;

    const candidate = params.map((value, index) => value + delta[index]);
    const candidateResiduals = evaluate(candidate, observations);
    const candidateScore = candidateResiduals.reduce((sum, value) => sum + value * value, 0);
    if (candidateScore < score) {
      params = candidate;
      residuals = candidateResiduals;
      if (Math.hypot(delta[0], delta[1]) < 1e-7 && Math.abs(delta[2]) < 1e-10) break;
      score = candidateScore;
      damping = Math.max(damping / 4, 1e-12);
    } else {
      damping *= 10;
    }
  }
  return { params, residuals, score };
}

export function solvePothenot(points, directions) {
  const observations = points.map((point, index) => ({ point, direction: toRad(directions[index]) }));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const scale = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 10);
  const starts = [];

  for (let gx = -2; gx <= 2; gx += 1) {
    for (let gy = -2; gy <= 2; gy += 1) {
      const x = center[0] + gx * scale * 0.55;
      const y = center[1] + gy * scale * 0.55;
      const orientation = wrapRad(Math.atan2(points[0].y - y, points[0].x - x) - observations[0].direction);
      starts.push([x, y, orientation]);
    }
  }

  const candidates = starts
    .map((start) => refine(start, observations, scale))
    .filter(({ params, score }) => params.every(Number.isFinite) && Number.isFinite(score))
    .sort((a, b) => a.score - b.score);

  const best = candidates[0];
  if (!best || best.score > 1e-5) {
    return { ok: false, message: "Решение не найдено: проверьте углы и геометрию пунктов." };
  }

  const angularRms = Math.sqrt(best.score / observations.length);
  return {
    ok: true,
    x: best.params[0],
    y: best.params[1],
    orientation: toDeg(best.params[2]),
    angularRmsSeconds: toDeg(angularRms) * 3600
  };
}

export function solveAllCombinations(rows) {
  const combinations = [
    [0, 1, 2],
    [0, 1, 3],
    [0, 2, 3],
    [1, 2, 3]
  ];
  const solutions = combinations.map((indices) => {
    const selected = indices.map((index) => rows[index]);
    const result = solvePothenot(
      selected.map(({ point }) => point),
      selected.map(({ direction }) => direction)
    );
    return { indices, names: selected.map(({ point }) => point.name), ...result };
  });

  const valid = solutions.filter(({ ok }) => ok);
  if (!valid.length) return { solutions, summary: null };
  const meanX = valid.reduce((sum, item) => sum + item.x, 0) / valid.length;
  const meanY = valid.reduce((sum, item) => sum + item.y, 0) / valid.length;
  valid.forEach((item) => {
    item.deviation = Math.hypot(item.x - meanX, item.y - meanY);
  });
  const rms = Math.sqrt(valid.reduce((sum, item) => sum + item.deviation ** 2, 0) / valid.length);
  const max = Math.max(...valid.map((item) => item.deviation));
  return { solutions, summary: { meanX, meanY, rms, max, count: valid.length } };
}
