const NUM_ROWS = 24;

const state = {
  columns: [24, 25, 26],
  manualRows: createEmptyGrid(3),
  autoRows: createEmptyGrid(3),
  status: "Ready",
  fileName: "-",
  ocrText: "-",
  previewUrl: "",
};

const tableEl = document.getElementById("table");
const statusEl = document.getElementById("statusText");
const fileTextEl = document.getElementById("fileText");
const colTextEl = document.getElementById("colText");
const ocrTextEl = document.getElementById("ocrText");
const fileInput = document.getElementById("fileInput");
const addColumnBtn = document.getElementById("addColumnBtn");
const clearBtn = document.getElementById("clearBtn");
const previewImage = document.getElementById("previewImage");

function createEmptyGrid(cols) {
  return Array.from({ length: NUM_ROWS }, () => Array(cols).fill(""));
}

function cloneGrid(grid, cols) {
  return Array.from({ length: NUM_ROWS }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (grid[r] && grid[r][c] !== undefined ? grid[r][c] : ""))
  );
}

function normalizeValue(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
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

function setStatus(msg) {
  state.status = msg;
  renderMeta();
}

function renderMeta() {
  statusEl.textContent = `Status: ${state.status}`;
  fileTextEl.textContent = `File: ${state.fileName}`;
  colTextEl.textContent = `Columns: ${state.columns.length}`;
  ocrTextEl.textContent = `OCR: ${state.ocrText}`;
}

function ensureColumnLabels(length) {
  while (state.columns.length < length) {
    const last = state.columns[state.columns.length - 1] || 0;
    state.columns.push(last + 1);
  }
}

function expandAllGrids(newCols) {
  if (newCols <= state.manualRows[0].length) return;

  const add = newCols - state.manualRows[0].length;
  state.manualRows = state.manualRows.map((row) => [...row, ...Array(add).fill("")]);
  state.autoRows = state.autoRows.map((row) => [...row, ...Array(add).fill("")]);
  ensureColumnLabels(newCols);
}

function rebuildAutoGrid() {
  let grid = cloneGrid(state.manualRows, state.manualRows[0].length);
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

  state.autoRows = grid;
  if (state.autoRows[0].length > state.manualRows[0].length) {
    expandAllGrids(state.autoRows[0].length);
  }
}

function getDisplayValue(r, c) {
  return normalizeValue(state.manualRows[r]?.[c]) || normalizeValue(state.autoRows[r]?.[c]) || "";
}

function isAutoCell(r, c) {
  return !normalizeValue(state.manualRows[r]?.[c]) && !!normalizeValue(state.autoRows[r]?.[c]);
}

function renderTable() {
  rebuildAutoGrid();

  const cols = Math.max(state.columns.length, state.manualRows[0].length, state.autoRows[0].length);
  ensureColumnLabels(cols);
  expandAllGrids(cols);

  let html = "<thead><tr>";
  html += `<th class="corner">#</th>`;

  for (let c = 0; c < cols; c++) {
    html += `<th>Col ${state.columns[c]}</th>`;
  }

  html += `<th style="min-width:70px">+</th>`;
  html += "</tr></thead><tbody>";

  for (let r = 0; r < NUM_ROWS; r++) {
    html += "<tr>";
    html += `<td class="row-head">${r + 1}</td>`;

    for (let c = 0; c < cols; c++) {
      const value = getDisplayValue(r, c);
      const manual = normalizeValue(state.manualRows[r]?.[c]);
      const auto = normalizeValue(state.autoRows[r]?.[c]);
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
    html += "</tr>";
  }

  html += "</tbody>";
  tableEl.innerHTML = html;

  tableEl.querySelectorAll(".cell-input").forEach((input) => {
    input.addEventListener("input", onCellInput);
  });

  renderMeta();
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

  if (col >= state.manualRows[0].length) {
    expandAllGrids(col + 1);
  }

  state.manualRows[row][col] = value;
  setStatus("Cell updated");
  renderTable();
}

function addColumn() {
  expandAllGrids(state.manualRows[0].length + 1);
  setStatus("Added column");
  renderTable();
}

function clearAll() {
  state.columns = [24, 25, 26];
  state.manualRows = createEmptyGrid(3);
  state.autoRows = createEmptyGrid(3);
  state.fileName = "-";
  state.ocrText = "-";
  state.previewUrl = "";
  previewImage.src = "";
  previewImage.classList.add("hidden");
  setStatus("Cleared");
  renderTable();
}

async function handleUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    state.fileName = file.name;
    state.previewUrl = URL.createObjectURL(file);
    previewImage.src = state.previewUrl;
    previewImage.classList.remove("hidden");

    setStatus("Processing image...");
    renderMeta();

    if (!window.Tesseract) {
      setStatus("Tesseract is still loading");
      return;
    }

    const result = await window.Tesseract.recognize(file, "eng");
    const text = result?.data?.text || "";
    state.ocrText = text ? `Found ${text.length} chars` : "No text";

    const numbers = text.match(/\b\d{1,3}\b/g) || [];
    const cleaned = numbers
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n >= 0);

    if (cleaned.length === 0) {
      setStatus("No numbers found");
      renderMeta();
      event.target.value = "";
      return;
    }

    const requiredCols = Math.max(3, Math.ceil(cleaned.length / NUM_ROWS));
    expandAllGrids(requiredCols);

    state.manualRows = createEmptyGrid(state.columns.length);

    cleaned.forEach((num, index) => {
      const row = index % NUM_ROWS;
      const col = Math.floor(index / NUM_ROWS);
      if (col < state.manualRows[0].length) {
        state.manualRows[row][col] = String(num);
      }
    });

    setStatus(`OCR loaded ${cleaned.length} numbers`);
    renderTable();
  } catch (err) {
    console.error(err);
    setStatus("OCR failed");
  } finally {
    event.target.value = "";
  }
}

fileInput.addEventListener("change", handleUpload);
addColumnBtn.addEventListener("click", addColumn);
clearBtn.addEventListener("click", clearAll);

renderTable();