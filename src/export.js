// export.js — shared CSV/JSON export helpers.
// Loaded via <script> before the page script; exposes a global `ExportUtils`.
(function (global) {
  "use strict";

  // Guard against CSV injection: a cell that starts with = + - @ (or tab/CR)
  // can be executed as a formula by Excel/Sheets. Prefix such values with '.
  function sanitizeCell(value) {
    const str = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(str)) {
      return "'" + str;
    }
    return str;
  }

  // Quote a value for CSV: sanitize, escape embedded quotes, wrap in quotes.
  function csvQuote(value) {
    return '"' + sanitizeCell(value).replace(/"/g, '""') + '"';
  }

  // Trigger a browser download of `content` as a file.
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Firefox Android can begin the download asynchronously after the click.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // headers: string[]; rows: Array<Array<string|number>>
  function exportCsv(filename, headers, rows) {
    const lines = [headers.map(csvQuote).join(";")];
    for (const row of rows) {
      lines.push(row.map(csvQuote).join(";"));
    }
    // Prepend UTF-8 BOM so Excel detects encoding correctly.
    download(filename, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8;");
  }

  function exportJson(filename, data) {
    download(
      filename,
      JSON.stringify(data, null, 2),
      "application/json;charset=utf-8;",
    );
  }

  // YYYY-MM-DD for use in file names.
  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  global.ExportUtils = { exportCsv, exportJson, dateStamp, sanitizeCell };
})(this);
