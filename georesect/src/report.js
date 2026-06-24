import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "./vendor/docx.mjs";

const COLORS = {
  ink: "182522",
  muted: "66736F",
  green: "176B5B",
  greenSoft: "EAF4F1",
  line: "C7D1CD",
  lightLine: "E2E8E5",
  red: "C95B47"
};
const FONT = "Arial";
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const GRID_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.line },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.line },
  left: { style: BorderStyle.SINGLE, size: 2, color: COLORS.line },
  right: { style: BorderStyle.SINGLE, size: 2, color: COLORS.line },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.lightLine },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLORS.lightLine }
};
const NO_BORDERS = {
  top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE
};

const format = (value, digits = 3) => Number(value).toLocaleString("ru-RU", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
});
const dmsFromDegrees = (value) => {
  const normalized = ((Number(value) % 360) + 360) % 360;
  let degrees = Math.floor(normalized);
  let minutes = Math.floor((normalized - degrees) * 60);
  let seconds = Math.round(((normalized - degrees) * 60 - minutes) * 60 * 10) / 10;
  if (seconds >= 60) { seconds = 0; minutes += 1; }
  if (minutes >= 60) { minutes = 0; degrees = (degrees + 1) % 360; }
  return { degrees, minutes, seconds };
};
const dmsText = (item, signed = false) => {
  const sign = signed && Number(item.sign) < 0 ? "−" : signed ? "+" : "";
  return `${sign}${item.degrees}° ${item.minutes}′ ${item.seconds}″`;
};
const run = (text, options = {}) => new TextRun({
  text: String(text),
  font: FONT,
  size: options.size ?? 14,
  bold: options.bold ?? false,
  color: options.color ?? COLORS.ink
});
const paragraph = (text = "", options = {}) => new Paragraph({
  alignment: options.alignment,
  spacing: {
    before: options.before ?? 0,
    after: options.after ?? 0,
    line: options.line ?? 200
  },
  children: Array.isArray(text) ? text : [run(text, options)]
});
const sectionLabel = (text) => paragraph(text, { size: 15, bold: true, color: COLORS.green, before: 50, after: 25 });
const valueLine = (label, value) => paragraph([
  run(`${label}: `, { size: 13, bold: true, color: COLORS.muted }),
  run(value, { size: 13 })
], { after: 15, line: 180 });

function reportCell(content, options = {}) {
  const children = Array.isArray(content) ? content : [paragraph(content, options)];
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    verticalAlign: options.verticalAlign ?? VerticalAlign.CENTER,
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill, color: "auto" } : undefined,
    margins: options.margins ?? { top: 55, bottom: 55, left: 75, right: 75 },
    children
  });
}

function dataTable(headers, rows, widths, options = {}) {
  const makeRow = (values, header = false) => new TableRow({
    tableHeader: header,
    children: values.map((value, index) => reportCell(
      [paragraph(value, {
        size: header ? (options.headerSize ?? 12) : (options.fontSize ?? 12),
        bold: header,
        color: header ? COLORS.green : COLORS.ink,
        alignment: options.alignments?.[index] ?? AlignmentType.CENTER,
        line: 175
      })],
      {
        width: widths[index],
        fill: header ? COLORS.greenSoft : undefined,
        margins: { top: options.cellY ?? 35, bottom: options.cellY ?? 35, left: 45, right: 45 }
      }
    ))
  });
  return new Table({
    width: { size: widths.reduce((sum, value) => sum + value, 0), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [makeRow(headers, true), ...rows.map((values) => makeRow(values))],
    borders: GRID_BORDERS
  });
}

function resultCard(label, value, width) {
  return reportCell([
    paragraph(label.toUpperCase(), { size: 10, bold: true, color: COLORS.muted, after: 15, alignment: AlignmentType.CENTER }),
    paragraph(value, { size: 17, bold: true, color: COLORS.green, alignment: AlignmentType.CENTER })
  ], { width, fill: "F6F9F8", margins: { top: 70, bottom: 70, left: 45, right: 45 } });
}

async function schemePng(svg) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll(".map-raster").forEach((item) => item.remove());
  clone.setAttribute("width", "900");
  clone.setAttribute("height", "680");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .map-grid{opacity:.35}.ray{stroke:#c95b47;stroke-width:1.5;stroke-dasharray:6 5}
    .angle-arc{fill:none;stroke:#267b6a;stroke-width:2}.angle-label{font:bold 11px Arial;fill:#176b5b;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:3px}
    .control-dot{fill:#263d38;stroke:#fff;stroke-width:3}.station-ring{fill:#fff;stroke:#c95b47;stroke-width:2}
    .station-dot{fill:#c95b47}.point-label,.station-label{font:bold 13px Arial;fill:#22342f;paint-order:stroke;stroke:#fff;stroke-width:3px}
    .coord-label{font:11px Arial;fill:#42534e;paint-order:stroke;stroke:#fff;stroke-width:3px}.station-label{fill:#c95b47}`;
  clone.prepend(style);
  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await new Promise((resolve, reject) => {
      const item = new Image();
      item.onload = () => resolve(item);
      item.onerror = reject;
      item.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1350;
    canvas.height = 1020;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Uint8Array(await (await fetch(canvas.toDataURL("image/png"))).arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadReport({ state, rows, systemName, measurements, directions, verticals, influence, svg }) {
  const { summary, solutions } = state.result;
  const image = await schemePng(svg);
  const letters = ["A", "B", "C", "D"];
  const angleNames = ["AB", "BC", "CD", "DA"];
  const hasHeight = Number.isFinite(summary.meanH);
  const usableWidth = 15120;

  const summaryWidths = hasHeight ? [3024, 3024, 3024, 3024, 3024] : [3780, 3780, 3780, 3780];
  const summaryValues = hasHeight
    ? [
        ["Среднее X, м", format(summary.meanX)],
        ["Среднее Y, м", format(summary.meanY)],
        ["Среднее H, м", format(summary.meanH)],
        ["Разлёт XY", `${format(summary.rms * 1000, 1)} мм`],
        ["Разлёт H", `${format(summary.heightRms * 1000, 1)} мм`]
      ]
    : [
        ["Среднее X, м", format(summary.meanX)],
        ["Среднее Y, м", format(summary.meanY)],
        ["Разлёт XY", `${format(summary.rms * 1000, 1)} мм`],
        ["Решений", `${summary.count} из 4`]
      ];
  const summaryTable = new Table({
    width: { size: usableWidth, type: WidthType.DXA },
    columnWidths: summaryWidths,
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: summaryValues.map(([label, value], index) => resultCard(label, value, summaryWidths[index])) })],
    borders: GRID_BORDERS
  });

  const solutionWidths = hasHeight ? [1100, 1800, 1800, 1350, 1250, 1300] : [1500, 2400, 2400, 2300];
  const solutionHeaders = hasHeight
    ? ["Комбинация", "X, м", "Y, м", "H, м", "Откл. XY, мм", "H внутр., мм"]
    : ["Комбинация", "X, м", "Y, м", "Откл. XY, мм"];
  const solutionRows = solutions.map((item) => item.ok
    ? hasHeight
      ? [item.names.join(" · "), format(item.x), format(item.y), format(item.h), format(item.deviation * 1000, 1), format(item.heightRms * 1000, 1)]
      : [item.names.join(" · "), format(item.x), format(item.y), format(item.deviation * 1000, 1)]
    : [item.names.join(" · "), "Решение не найдено", "", "", ""].slice(0, solutionHeaders.length));

  const influenceWidths = [3900, 2600, 2100];
  const rightPanel = [
    sectionLabel("Независимые решения"),
    dataTable(solutionHeaders, solutionRows, solutionWidths, { fontSize: 11, headerSize: 11, cellY: 25 }),
    sectionLabel("Оценка влияния пунктов"),
    dataTable(
      ["Пункт", "Связанные углы", "Влияние, мм"],
      influence.map((item) => [`${letters[item.index]} · ${item.name}`, item.adjacentAngles.join(", "), format(item.influence * 1000, 1)]),
      influenceWidths,
      { fontSize: 11, headerSize: 11, cellY: 25 }
    ),
    paragraph("Оценка влияния является диагностической и не указывает однозначно местоположение ошибки.", {
      size: 10, color: COLORS.muted, before: 25, line: 170
    })
  ];

  const topGrid = new Table({
    width: { size: usableWidth, type: WidthType.DXA },
    columnWidths: [6300, 8820],
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({
      children: [
        reportCell([
          sectionLabel("Схема засечки"),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            children: [new ImageRun({ data: image, type: "png", transformation: { width: 300, height: 227 } })]
          })
        ], { width: 6300, verticalAlign: VerticalAlign.TOP, margins: { top: 0, bottom: 0, left: 0, right: 120 } }),
        reportCell(rightPanel, { width: 8820, verticalAlign: VerticalAlign.TOP, margins: { top: 0, bottom: 0, left: 120, right: 0 } })
      ]
    })],
    borders: NO_BORDERS
  });

  const inputHeaders = ["Поз.", "Исходный пункт", "X, м", "Y, м", "H, м", state.inputMode === "angles" ? "Угол" : "Отсчёт", "Направление"];
  const inputWidths = [600, 2600, 2200, 2400, 1700, 2000, 2200];
  if (state.verticalEnabled) {
    inputHeaders.push("Вертик. угол", "h виз., м");
    inputWidths.splice(1, inputWidths.length - 1, 2100, 1800, 2000, 1300, 1700, 1800, 1600, 1620);
  }
  const inputRows = rows.map(({ point }, index) => {
    const values = [
      letters[index],
      point.name,
      format(point.x),
      format(point.y),
      format(point.h),
      `${state.inputMode === "angles" ? angleNames[index] + " " : ""}${dmsText(measurements[index])}`,
      dmsText(dmsFromDegrees(directions[index]))
    ];
    if (state.verticalEnabled) values.push(dmsText(verticals[index], true), format(verticals[index].targetHeight));
    return values;
  });

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 15, line: 200 },
      children: [run("ОТЧЁТ ПО ОБРАТНОЙ УГЛОВОЙ ЗАСЕЧКЕ", { size: 22, bold: true, color: COLORS.green })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 55, line: 180 },
      children: [
        run(`${systemName}  ·  ${state.inputMode === "angles" ? "углы между направлениями" : "круговые отсчёты"}  ·  ${state.traversal === "clockwise" ? "по часовой стрелке" : "против часовой стрелки"}`, { size: 11, color: COLORS.muted }),
        run(`  ·  ${new Date().toLocaleString("ru-RU")}`, { size: 11, color: COLORS.muted })
      ]
    }),
    summaryTable,
    paragraph("", { after: 25 }),
    topGrid,
    sectionLabel("Исходные пункты и измерения"),
    ...(state.verticalEnabled ? [valueLine("Высота инструмента, м", format(state.instrumentHeight))] : []),
    dataTable(inputHeaders, inputRows, inputWidths, {
      fontSize: state.verticalEnabled ? 10 : 11,
      headerSize: state.verticalEnabled ? 10 : 11,
      cellY: 25,
      alignments: inputHeaders.map((_, index) => index === 1 ? AlignmentType.LEFT : AlignmentType.CENTER)
    })
  ];

  const documentFile = new Document({
    creator: "GeoResect",
    title: "Отчёт по обратной угловой засечке",
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 14, color: COLORS.ink },
          paragraph: { spacing: { after: 0, line: 200 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 420, right: 480, bottom: 420, left: 480, header: 180, footer: 180 }
        }
      },
      children
    }]
  });
  const blob = await Packer.toBlob(documentFile);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `GeoResect_${new Date().toISOString().slice(0, 10)}.docx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
