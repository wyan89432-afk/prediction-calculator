import { useEffect, useState, type ClipboardEvent, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type CellValue = number | null;

interface PredictionData {
  occurrences: Array<{ row: number; col: number }>;
  predictions: Array<{ row: number; col: number; value: number }>;
}

interface GroupState {
  columns: number[];
  manualRows: CellValue[][];
  rows: CellValue[][];
  data: Record<number, PredictionData>;
  pastedNumbers: number[];
  autoFilled: Set<string>;
}

const NUM_ROWS = 24;
const INITIAL_COLUMNS = [24, 25, 26];

const digitGroups: Record<string, string[]> = {
  "1": ["01", "10", "12", "21", "23", "32", "34", "43", "45", "54", "56", "65", "67", "76", "78", "87", "89", "98", "90", "09"],
  "2": ["02", "20", "13", "31", "24", "42", "35", "53", "46", "64", "57", "75", "68", "86", "79", "97", "80", "08"],
  "3": ["03", "30", "14", "41", "25", "52", "36", "63", "47", "74", "58", "85", "69", "96", "70", "07"],
  "4": ["04", "40", "15", "51", "26", "62", "37", "73", "48", "84", "59", "95", "60", "06"],
  "5": ["05", "50", "16", "61", "27", "72", "38", "83", "49", "94"],
  "6": ["06", "60", "17", "71", "28", "82", "39", "93", "40", "04"],
  "7": ["07", "70", "18", "81", "29", "92", "30", "03"],
  "8": ["08", "80", "19", "91", "20", "02"],
  "9": ["09", "90"],
};

declare global {
  interface Window {
    Tesseract?: any;
  }
}

function createEmptyRows(cols: number): CellValue[][] {
  return Array.from({ length: NUM_ROWS }, () => Array(cols).fill(null));
}

function cloneRows(rows: CellValue[][], cols: number): CellValue[][] {
  return Array.from({ length: NUM_ROWS }, (_, r) =>
    Array.from({ length: cols }, (_, c) => rows?.[r]?.[c] ?? null)
  );
}

function linearIndex(row: number, col: number) {
  return col * NUM_ROWS + row;
}

function positionFromIndex(index: number) {
  return {
    row: index % NUM_ROWS,
    col: Math.floor(index / NUM_ROWS),
  };
}

function ensureColumnLabels(labels: number[], length: number) {
  const next = labels.slice(0, length);
  while (next.length < length) {
    const last = next.length ? next[next.length - 1] : 0;
    next.push(last + 1);
  }
  return next;
}

function buildData(rows: CellValue[][]) {
  const data: Record<number, PredictionData> = {};
  const pastedNumbers: number[] = [];

  for (let r = 0; r < NUM_ROWS; r++) {
    for (let c = 0; c < rows[0].length; c++) {
      const value = rows[r][c];
      if (value === null) continue;

      if (!data[value]) {
        data[value] = { occurrences: [], predictions: [] };
      }

      data[value].occurrences.push({ row: r + 1, col: c });

      if (!pastedNumbers.includes(value)) {
        pastedNumbers.push(value);
      }
    }
  }

  Object.keys(data).forEach((key) => {
    const num = Number(key);
    data[num].occurrences.sort(
      (a, b) => linearIndex(a.row - 1, a.col) - linearIndex(b.row - 1, b.col)
    );
  });

  return { data, pastedNumbers };
}

function computeAutoFill(manualRows: CellValue[][], initialCols: number) {
  let grid = cloneRows(manualRows, initialCols);
  const autoFilled = new Set<string>();

  for (let pass = 0; pass < 200; pass++) {
    let changed = false;
    const occurrenceMap = new Map<number, Array<{ row: number; col: number }>>();

    for (let c = 0; c < grid[0].length; c++) {
      for (let r = 0; r < NUM_ROWS; r++) {
        const value = grid[r][c];
        if (value === null) continue;

        if (!occurrenceMap.has(value)) occurrenceMap.set(value, []);
        occurrenceMap.get(value)!.push({ row: r, col: c });
      }
    }

    for (const [num, occurrences] of occurrenceMap.entries()) {
      if (occurrences.length < 2) continue;

      occurrences.sort(
        (a, b) => linearIndex(a.row, a.col) - linearIndex(b.row, b.col)
      );

      const gap =
        linearIndex(occurrences[1].row, occurrences[1].col) -
        linearIndex(occurrences[0].row, occurrences[0].col);

      if (gap <= 0) continue;

      let current = linearIndex(
        occurrences[occurrences.length - 1].row,
        occurrences[occurrences.length - 1].col
      );

      while (true) {
        const next = current + gap;
        const pos = positionFromIndex(next);

        if (pos.col >= grid[0].length) {
          const addCols = pos.col - grid[0].length + 1;
          grid = grid.map((row) => [...row, ...Array(addCols).fill(null)]);
        }

        const existing = grid[pos.row][pos.col];

        if (existing === null) {
          grid[pos.row][pos.col] = num;
          autoFilled.add(`${pos.row}-${pos.col}`);
          changed = true;
          current = next;
          continue;
        }

        if (existing === num) {
          current = next;
          continue;
        }

        break;
      }
    }

    if (!changed) break;
  }

  return { rows: grid, autoFilled };
}

function recomputeGroup(manualRows: CellValue[][], columns: number[]): GroupState {
  const targetCols = Math.max(columns.length, manualRows[0]?.length ?? columns.length);
  const normalizedManualRows = cloneRows(manualRows, targetCols);
  const filled = computeAutoFill(normalizedManualRows, targetCols);
  const actualCols = filled.rows[0]?.length ?? targetCols;
  const finalColumns = ensureColumnLabels(columns, actualCols);
  const finalManualRows = cloneRows(normalizedManualRows, actualCols);
  const finalRows = cloneRows(filled.rows, actualCols);
  const { data, pastedNumbers } = buildData(finalRows);

  return {
    columns: finalColumns,
    manualRows: finalManualRows,
    rows: finalRows,
    autoFilled: filled.autoFilled,
    data,
    pastedNumbers,
  };
}

function createInitialGroup(): GroupState {
  return recomputeGroup(createEmptyRows(3), INITIAL_COLUMNS);
}

export default function Home() {
  const [groupA, setGroupA] = useState<GroupState>(() => createInitialGroup());
  const [groupB, setGroupB] = useState<GroupState>(() => createInitialGroup());

  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [searchResultsA, setSearchResultsA] = useState("");
  const [searchResultsB, setSearchResultsB] = useState("");

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (window.Tesseract) return;

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const updateGroupCell = (
    groupId: "A" | "B",
    rowIdx: number,
    colIdx: number,
    value: string
  ) => {
    const setter = groupId === "A" ? setGroupA : setGroupB;
    const parsed = value.trim() === "" ? null : Number.parseInt(value, 10);
    const safeNum = Number.isNaN(parsed as number) ? null : parsed;

    setter((prev) => {
      const nextManualRows = cloneRows(prev.manualRows, Math.max(prev.columns.length, colIdx + 1));
      nextManualRows[rowIdx][colIdx] = safeNum;
      return recomputeGroup(nextManualRows, prev.columns);
    });
  };

  const handlePaste = (
    e: ClipboardEvent<HTMLInputElement>,
    groupId: "A" | "B",
    startRow: number,
    startCol: number
  ) => {
    e.preventDefault();

    const text = e.clipboardData.getData("text");
    const matrix = text
      .split(/\r\n|\n|\r/)
      .map((row) => row.split(/\t+/));

    const setter = groupId === "A" ? setGroupA : setGroupB;

    setter((prev) => {
      let neededCols = prev.columns.length;
      matrix.forEach((row) => {
        neededCols = Math.max(neededCols, startCol + row.length);
      });

      const nextManualRows = cloneRows(prev.manualRows, neededCols);

      matrix.forEach((row, rIndex) => {
        row.forEach((cellValue, cIndex) => {
          const targetRow = startRow + rIndex;
          const targetCol = startCol + cIndex;

          if (targetRow >= NUM_ROWS || targetCol >= neededCols) return;

          const parsed = Number.parseInt(cellValue.trim(), 10);
          if (!Number.isNaN(parsed)) {
            nextManualRows[targetRow][targetCol] = parsed;
          }
        });
      });

      return recomputeGroup(nextManualRows, prev.columns);
    });
  };

  const handleSearch = (groupId: "A" | "B", digit: string) => {
    const group = groupId === "A" ? groupA : groupB;
    const setResult = groupId === "A" ? setSearchResultsA : setSearchResultsB;

    if (!digit || digit < "1" || digit > "9") {
      setResult("");
      return;
    }

    const targetPairs = digitGroups[digit];
    const foundPairs = new Set<string>();

    group.pastedNumbers.forEach((num) => {
      const numStr = String(num).padStart(3, "0");
      const d0 = numStr[0];
      const d1 = numStr[1];
      const d2 = numStr[2];

      const combinations = [
        d0 + d1,
        d1 + d2,
        d0 + d2,
      ];

      combinations.forEach((combo) => {
        if (targetPairs.includes(combo)) {
          foundPairs.add(combo);
          foundPairs.add(combo[1] + combo[0]);
        }
      });
    });

    if (foundPairs.size > 0) {
      setResult("Found: " + Array.from(foundPairs).sort().join(", "));
    } else {
      setResult("No matching pairs found.");
    }
  };

  const addColumn = (groupId: "A" | "B") => {
    const setter = groupId === "A" ? setGroupA : setGroupB;
    setter((prev) => {
      const newColNum = Math.max(...prev.columns) + 1;
      const nextColumns = [...prev.columns, newColNum];
      const nextManualRows = cloneRows(prev.manualRows, nextColumns.length);
      return recomputeGroup(nextManualRows, nextColumns);
    });
  };

  const clearGroup = (groupId: "A" | "B") => {
    const setter = groupId === "A" ? setGroupA : setGroupB;

    setter(createInitialGroup());

    if (groupId === "A") {
      setSearchA("");
      setSearchResultsA("");
    } else {
      setSearchB("");
      setSearchResultsB("");
    }

    toast.success(`Group ${groupId} cleared`);
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    setIsProcessing(true);

    try {
      if (!window.Tesseract) {
        toast.error("Tesseract.js is loading. Please try again in a moment.");
        return;
      }

      const {
        data: { text },
      } = await window.Tesseract.recognize(file, "eng");

      const numbers = text.match(/\d+/g)?.map(Number) || [];
      const lotteryNumbers = numbers.filter((n) => n >= 100 && n <= 999);

      if (lotteryNumbers.length === 0) {
        toast.error("No valid 3-digit numbers found in the image");
        return;
      }

      const midpoint = Math.ceil(lotteryNumbers.length / 2);
      const groupANumbers = lotteryNumbers.slice(0, midpoint);
      const groupBNumbers = lotteryNumbers.slice(midpoint);

      const fillNumbers = (prev: GroupState, nums: number[]) => {
        let neededCols = prev.columns.length;
        nums.forEach((_, index) => {
          neededCols = Math.max(neededCols, Math.floor(index / NUM_ROWS) + 1);
        });

        const nextManualRows = cloneRows(prev.manualRows, neededCols);

        nums.forEach((num, index) => {
          const rowIdx = index % NUM_ROWS;
          const colIdx = Math.floor(index / NUM_ROWS);
          nextManualRows[rowIdx][colIdx] = num;
        });

        return recomputeGroup(nextManualRows, prev.columns);
      };

      setGroupA((prev) => fillNumbers(prev, groupANumbers));
      setGroupB((prev) => fillNumbers(prev, groupBNumbers));

      toast.success(`Extracted ${lotteryNumbers.length} numbers from the image!`);
    } catch (error) {
      console.error("OCR Error:", error);
      toast.error("Error processing image. Please try again.");
    } finally {
      setIsProcessing(false);
      e.target.value = "";
    }
  };

  const renderGroupTable = (
    group: GroupState,
    groupId: "A" | "B",
    search: string,
    searchResults: string
  ) => {
    return (
      <div className="mb-8">
        <div className="bg-red-800 text-white p-3 rounded-t-lg font-bold text-lg">
          Group {groupId}
        </div>

        <Card className="p-4 bg-white rounded-b-lg mb-4">
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Search (1-9):
              </label>
              <Input
                type="text"
                placeholder="Enter digit"
                value={search}
                onChange={(e) => {
                  if (groupId === "A") {
                    setSearchA(e.target.value);
                    handleSearch("A", e.target.value);
                  } else {
                    setSearchB(e.target.value);
                    handleSearch("B", e.target.value);
                  }
                }}
                maxLength={1}
              />
            </div>

            <Button
              onClick={() => clearGroup(groupId)}
              variant="destructive"
              className="mt-6"
            >
              Clear All Group {groupId}
            </Button>

            <Button
              onClick={() => addColumn(groupId)}
              variant="outline"
              className="mt-6"
            >
              <Plus size={16} className="mr-2" />
              Add Column
            </Button>
          </div>

          {searchResults && (
            <div className="text-sm text-slate-700 bg-slate-100 p-2 rounded">
              {searchResults}
            </div>
          )}
        </Card>

        <Card className="p-4 bg-white overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-red-700 text-white">
                <th className="border border-gray-300 p-2 text-center font-semibold">
                  No
                </th>
                {group.columns.map((col) => (
                  <th
                    key={col}
                    className="border border-gray-300 p-2 text-center font-semibold min-w-[88px]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {group.rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={rowIdx % 2 === 0 ? "bg-pink-100" : "bg-pink-50"}
                >
                  <td className="border border-gray-300 p-2 text-center font-semibold bg-pink-200">
                    {rowIdx + 1}
                  </td>

                  {row.map((value, colIdx) => {
                    const key = `${rowIdx}-${colIdx}`;
                    const isPredicted = group.autoFilled.has(key);

                    return (
                      <td key={key} className="border border-gray-300 p-1 text-center">
                        <input
                          type="number"
                          value={value === null ? "" : value}
                          onChange={(e) =>
                            updateGroupCell(groupId, rowIdx, colIdx, e.target.value)
                          }
                          onPaste={(e) => handlePaste(e, groupId, rowIdx, colIdx)}
                          className={`w-full h-8 text-center text-sm font-semibold rounded ${
                            isPredicted
                              ? "bg-cyan-200 text-slate-900"
                              : value !== null && value > 10
                              ? "bg-slate-400 text-white"
                              : value !== null
                              ? "bg-orange-500 text-white"
                              : "bg-white border border-gray-200"
                          }`}
                          placeholder=""
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-2 text-center">
          Prediction Calculator
        </h1>
        <p className="text-slate-600 text-center mb-8">
          Analyze number patterns with dynamic columns and gap visualization
        </p>

        <Card className="p-6 bg-white mb-8">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <label className="text-sm font-medium text-slate-700 block mb-2">
                Upload Lottery Table Image:
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={isProcessing}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
            </div>

            {isProcessing && (
              <div className="text-sm text-slate-600">Processing image...</div>
            )}
          </div>

          {uploadedImage && (
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">
                Uploaded Image:
              </p>
              <img
                src={uploadedImage}
                alt="Uploaded lottery table"
                className="max-w-md max-h-96 border border-gray-300 rounded"
              />
            </div>
          )}
        </Card>

        {renderGroupTable(groupA, "A", searchA, searchResultsA)}
        {renderGroupTable(groupB, "B", searchB, searchResultsB)}

        <div className="flex justify-center mt-8 mb-4">
          <Button
            onClick={() => {
              setGroupA(createInitialGroup());
              setGroupB(createInitialGroup());
              setSearchA("");
              setSearchB("");
              setSearchResultsA("");
              setSearchResultsB("");
              setUploadedImage(null);
              toast.success("Reset complete");
            }}
            variant="outline"
            className="flex items-center gap-2 px-6 py-2"
          >
            <ArrowLeft size={18} />
            Back / Reset
          </Button>
        </div>
      </div>
    </div>
  );
}