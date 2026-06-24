import test from "node:test";
import assert from "node:assert/strict";
import { addHeightsToSolutions, calculateStationHeight, diagnoseInfluence, solveAllCombinations } from "./solver.js";

test("four Pothenot combinations converge around the known station", () => {
  const points = [
    { name: "A", x: 5000, y: 5000 },
    { name: "B", x: 5250, y: 4980 },
    { name: "C", x: 5300, y: 5300 },
    { name: "D", x: 4920, y: 5350 }
  ];
  const directions = [237, 333.3407, 57, 137.7539];
  const result = solveAllCombinations(points.map((point, index) => ({
    point,
    direction: directions[index]
  })));

  assert.equal(result.summary.count, 4);
  assert.ok(Math.abs(result.summary.meanX - 5100) < 0.002);
  assert.ok(Math.abs(result.summary.meanY - 5100) < 0.002);
  assert.ok(result.summary.rms < 0.002);
});

test("adjacent angles AB, BC, CD, DA produce the expected station", () => {
  const points = [
    { name: "C11", x: 508167.38, y: 1307428.47 },
    { name: "БарД", x: 508166.77, y: 1307479.66 },
    { name: "Сосенки", x: 508252.73, y: 1307545.33 },
    { name: "Татьяна", x: 508112.48, y: 1307579.39 }
  ];
  const angles = [77.675, 19.2, 73.525, 189.6];
  const directions = [0, angles[0], angles[0] + angles[1], angles[0] + angles[1] + angles[2]];
  const result = solveAllCombinations(points.map((point, index) => ({ point, direction: directions[index] })));

  assert.equal(angles.reduce((sum, value) => sum + value, 0), 360);
  assert.equal(result.summary.count, 4);
  assert.ok(Math.abs(result.summary.meanX - 508144.588) < 0.002);
  assert.ok(Math.abs(result.summary.meanY - 1307474.021) < 0.002);
});

test("UTM 37N default observations converge around the demo station", () => {
  const station = { x: 6213000, y: 386250 };
  const points = [
    { name: "Laplas", x: 6213464.508, y: 386471.874 },
    { name: "Iturup", x: 6213015.384, y: 386545.623 },
    { name: "Vega", x: 6212865.506, y: 386160.522 },
    { name: "Prud", x: 6213054.837, y: 386016.414 }
  ];
  const directions = [0, 61.48940786517386, 188.1039195526301, 257.67995095692874];
  const result = solveAllCombinations(points.map((point, index) => ({ point, direction: directions[index] })));

  assert.equal(result.summary.count, 4);
  assert.ok(Math.abs(result.summary.meanX - station.x) < 0.002);
  assert.ok(Math.abs(result.summary.meanY - station.y) < 0.002);
  assert.ok(result.summary.rms < 0.002);
});

test("station height is calculated from elevation angle and instrument/target heights", () => {
  const station = { x: 0, y: 0 };
  const point = { x: 100, y: 0, h: 110 };
  const verticalAngle = Math.atan(10.5 / 100) * 180 / Math.PI;

  assert.ok(Math.abs(calculateStationHeight(point, station, verticalAngle, 2, 1.5) - 100) < 1e-10);
});

test("each horizontal combination receives an independent mean height", () => {
  const station = { x: 5100, y: 5100, h: 100 };
  const points = [
    { name: "A", x: 5000, y: 5000, h: 104 },
    { name: "B", x: 5250, y: 4980, h: 106 },
    { name: "C", x: 5300, y: 5300, h: 102 },
    { name: "D", x: 4920, y: 5350, h: 108 }
  ];
  const directions = [237, 333.3407, 57, 137.7539];
  const rows = points.map((point, index) => ({ point, direction: directions[index] }));
  const instrumentHeight = 1.5;
  const targetHeight = 2;
  const verticals = points.map((point) => ({
    angle: Math.atan((point.h + targetHeight - station.h - instrumentHeight) / Math.hypot(point.x - station.x, point.y - station.y)) * 180 / Math.PI,
    targetHeight
  }));
  const result = addHeightsToSolutions(solveAllCombinations(rows), rows, verticals, instrumentHeight);

  assert.equal(result.summary.heightCount, 4);
  assert.ok(Math.abs(result.summary.meanH - station.h) < 0.001);
  assert.ok(result.summary.heightRms < 0.001);
});

test("influence diagnostics ranks the point whose exclusion changes the solution most", () => {
  const rows = ["A", "B", "C", "D"].map((name) => ({ point: { name } }));
  const result = {
    solutions: [
      { ok: true, indices: [0, 1, 2], x: 10, y: 0 },
      { ok: true, indices: [0, 1, 3], x: 0, y: 0 },
      { ok: true, indices: [0, 2, 3], x: 0, y: 0 },
      { ok: true, indices: [1, 2, 3], x: 0, y: 0 }
    ]
  };

  const diagnostics = diagnoseInfluence(result, rows);
  assert.equal(diagnostics[0].name, "D");
  assert.deepEqual(diagnostics[0].adjacentAngles, ["CD", "DA"]);
});
