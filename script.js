const NUM_ROWS = 24;
let columns = [24, 25, 26];
let manualGrid = createEmptyGrid(3);
let autoGrid = createEmptyGrid(3);
let fileName = "-";
let statusText = "Ready";

const tableEl = document.getElementById("table");
const statusEl = document.getElementById("statusText");
const fileTextEl = document.getElementById("fileText");
const colTextEl = document.getElementById("colText");

const fileInput = document.getElementById("fileInput");
const addColumnBtn = document.getElementById("addColumnBtn");
const clearBtn = document.getElementById("clearBtn");
const exportBtn = document.getElementById("exportBtn");

function createEmptyGrid(cols) {
  return Array.from({ length: NUM_ROWS }, () => Array(cols).fill(""));
}

function cloneGrid(grid, cols) {
  return Array.from({ length: NUM_ROWS }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (grid[r] && grid[r][c] !== undefined ? grid[r][c] : ""))
  );
}

function linearIndex(row, col) {
  return col * NUM_ROWS + row;
}

function positionFromIndex(index) {
  return {
    row: index % NUM_ROWS,
    col: Math.floor(index / NUM_ROWS),
  };
}

function ensureColumnLabels(length) {
  const next = columns.slice(0, length);
  while (next.length < length) {
    const last = next.length ? next[next.length - 1] : 0;
    next.push(last + 1);
  }
  columns = next;
}

function setStatus(msg) {
  statusText = msg;
  renderMeta();
}

function renderMeta() {
  statusEl.textContent = `Status: ${statusText}`;
  fileTextEl.textContent = `File: ${fileName}`;
  colTextEl.textContent = `Columns: ${columns.length}`;
}

function normalizeValue(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function rebuildAutoGrid() {
  let grid = cloneGrid(manualGrid, manualGrid[0].length);
  let changed = true;
  let guard = 0;

  while (changed && guard < 200) {
    changed = false;
    guard += 1;

    const occurrences = new Map();

    for (let c = 0; c < grid[0].length; c++) {
      for (let r = 0; r < NUM_ROWS; r++) {
        const value = normalizeValue(grid[r][c]);
        if (!value) continue;

        if (!occurrences.has(value)) occurrences.set(value, []);
        occurrences.get(value).push({ row: r, col: c });
      }
    }

    for (const [value, list] of occurrences.entries()) {
      if (list.length < 2) continue;

      list.sort((a, b) => linearIndex(a.row, a.col) - linearIndex(b.row, b.col));

      const gap =
        linearIndex(list[1].row, list[1].col) -
        linearIndex(list[0].row, list[0].col);

      if (gap <= 0) continue;

      let current = linearIndex(list[list.length - 1].row, list[list.length - 1].col);

      while (true) {
        const next = current + gap;
        const pos = positionFromIndex(next);

        if (pos.col >= grid[0].length) {
          const addCols = pos.col - grid[0].length + 1;
          grid = grid.map((row) => [...row, ...Array(addCols).fill("")]);
        }

        const existing = normalizeValue(grid[pos.row][pos.col]);

        if (!existing) {
          grid[pos.row][pos.col] = value;
          changed = true;
          current = next;
          continue;
        }

        if (existing === value) {
          current = next;
          continue;
        }

        break;
      }
    }
  }

  autoGrid = grid;
  if (autoGrid[0].length > columns.length) {
    ensureColumnLabels(autoGrid[0].length);
  }
}

function getDisplayValue(r, c) {
  return normalizeValue(manualGrid[r]?.[c]) || normalizeValue(autoGrid[r]?.[c]) || "";
}

function isAutoCell(r, c) {
  return !normalizeValue(manualGrid[r]?.[c]) && !!normalizeValue(autoGrid[r]?.[c]);
}

function renderTable() {
  rebuildAutoGrid();
  renderMeta();

  const cols = Math.max(columns.length, manualGrid[0].length, autoGrid[0].length);
  ensureColumnLabels(cols);

  let html = "<thead><tr>";
  html += `<th class="corner">#</th>`;
  for (let c = 0; c < cols; c++) {
    html += `<th>Col ${columns[c]}</th>`;
  }
  html += `<th style="min-width:70px">+</th>`;
  html += "</tr></thead><tbody>";

  for (let r = 0; r < NUM_ROWS; r++) {
    html += `<tr>`;
    html += `<td class="row-head">${r + 1}</td>`;

    for (let c = 0; c < cols; c++) {
      const value = getDisplayValue(r, c);
      const manual = normalizeValue(manualGrid[r]?.[c]);
      const auto = normalizeValue(autoGrid[r]?.[c]);
      const autoOnly = !manual && !!auto;

      html += `
        <td class="${autoOnly ? "auto-cell" : "manual-cell"}">
          <input
            class="cell-input"
            data-row="${r}"
            data-col="${c}"
            type="text"
            inputmode="numeric"
            value="${escapeHtml(value)}"
          />
        </td>
      `;
    }

    html += `<td></td>`;
    html += `</tr>`;
  }

  html += "</tbody>";
  tableEl.innerHTML = html;

  tableEl.querySelectorAll(".cell-input").forEach((input) => {
    input.addEventListener("input", onCellInput);
    input.addEventListener("paste", onCellPaste);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function onCellInput(e) {
  const input = e.target;
  const row = Number(input.dataset.row);
  const col = Number(input.dataset.col);
  const value = normalizeValue(input.value);

  if (col >= manualGrid[0].length) {
    expandColumns(col + 1);
  }

  manualGrid[row][col] = value;
  renderTable();
}

function onCellPaste(e) {
  e.preventDefault();

  const input = e.target;
  const startRow = Number(input.dataset.row);
  const startCol = Number(input.dataset.col);
  const text = e.clipboardData.getData("text");

  const rows = text
    .split(/\r\n|\n|\r/)
    .map((line) => line.split(/\t+/));

  let neededCols = manualGrid[0].length;
  rows.forEach((row) => {
    neededCols = Math.max(neededCols, startCol + row.length);
  });

  expandColumns(neededCols);

  rows.forEach((row, rIndex) => {
    row.forEach((cell, cIndex) => {
      const rr = startRow + rIndex;
      const cc = startCol + cIndex;
      if (rr >= NUM_ROWS || cc >= manualGrid[0].length) return;

      manualGrid[rr][cc] = normalizeValue(cell);
    });
  });

  setStatus("Pasted data");
  renderTable();
}

function expandColumns(newCount) {
  if (newCount <= manualGrid[0].length) return;

  const add = newCount - manualGrid[0].length;
  manualGrid = manualGrid.map((row) => [...row, ...Array(add).fill("")]);
  autoGrid = autoGrid.map((row) => [...row, ...Array(add).fill("")]);

  const start = columns.length ? columns[columns.length - 1] : 0;
  for (let i = 1; i <= add; i++) {
    columns.push(start + i);
  }
}

function addColumn() {
  expandColumns(manualGrid[0].length + 1);
  setStatus("Added column");
  renderTable();
}

function clearAll() {
  columns = [24, 25, 26];
  manualGrid = createEmptyGrid(3);
  autoGrid = createEmptyGrid(3);
  fileName = "-";
  setStatus("Cleared");
  renderTable();
}

async function handleUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      setStatus("No sheet found");
      return;
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    const loadedCols = Math.max(
      3,
      ...(rows.slice(0, NUM_ROWS).map((r) => (Array.isArray(r) ? r.length : 0)))
    );

    columns = [24, 25, 26];
    while (columns.length < loadedCols) {
      columns.push(columns[columns.length - 1] + 1);
    }

    manualGrid = createEmptyGrid(columns.length);

    for (let r = 0; r < Math.min(NUM_ROWS, rows.length); r++) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      for (let c = 0; c < Math.min(columns.length, row.length); c++) {
        manualGrid[r][c] = normalizeValue(row[c]);
      }
    }

    fileName = file.name;
    setStatus(`Loaded ${file.name} (${sheetName})`);
    renderTable();
  } catch (err) {
    console.error(err);
    setStatus("Failed to load file");
  } finally {
    event.target.value = "";
  }
}

function exportToExcel() {
  rebuildAutoGrid();

  const data = [];
  const header = ["No", ...columns.map((c) => String(c))];
  data.push(header);

  for (let r = 0; r < NUM_ROWS; r++) {
    const row = [r + 1];
    for (let c = 0; c < columns.length; c++) {
      row.push(getDisplayValue(r, c));
    }
    data.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Prediction");
  XLSX.writeFile(wb, "prediction_table.xlsx");
  setStatus("Exported to Excel");
}

fileInput.addEventListener("change", handleUpload);
addColumnBtn.addEventListener("click", addColumn);
clearBtn.addEventListener("click", clearAll);
exportBtn.addEventListener("click", exportToExcel);

renderTable();