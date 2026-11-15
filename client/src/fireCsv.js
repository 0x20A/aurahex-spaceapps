const columns = [
  "h3_index",
  "h3_resolution",
  "acq_date",
  "instruments",
  "total_frp_mw",
  "avg_confidence_pct",
  "avg_brightness_k",
  "point_count",
];

function csvField(value) {
  if (value == null) return "";
  if (typeof value === "number") return String(value);

  const text = String(value);
  // Prevent spreadsheet apps from treating imported text as a formula.
  const safeText = /^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? "'" + text : text;
  return '"' + safeText.replaceAll('"', '""') + '"';
}

export function buildFireCsv(cells, resolution) {
  const rows = cells.map((cell) =>
    [
      cell.h3_index,
      resolution,
      cell.acq_date,
      cell.instruments,
      cell.total_frp,
      cell.avg_confidence,
      cell.avg_brightness,
      cell.point_count,
    ].map(csvField).join(","),
  );

  return [columns.join(","), ...rows].join("\r\n") + "\r\n";
}

export function downloadFireCsv(cells, resolution, date) {
  const file = new Blob(["\uFEFF", buildFireCsv(cells, resolution)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aurahex-${date}-h3-r${resolution}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
