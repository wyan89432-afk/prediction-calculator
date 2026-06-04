import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, ArrowLeft, Upload } from "lucide-react";
import { toast } from "sonner";

interface PredictionData {
  occurrences: Array<{ row: number; col: number }>;
  predictions: Array<{ row: number; col: number; value: number }>;
}

interface GroupState {
  columns: number[];
  rows: (number | null)[][];
  data: Record<number, PredictionData>;
  pastedNumbers: number[];
}

const NUM_ROWS = 24;
const INITIAL_COLUMNS = [24, 25, 26];

// 2-digit digit groups for search
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

// Dynamically load Tesseract.js
declare global {
  interface Window {
    Tesseract: any;
  }
}

export default function Home() {
  const [groupA, setGroupA] = useState<GroupState>({
    columns: INITIAL_COLUMNS,
    rows: Array(NUM_ROWS).fill(null).map(() => Array(3).fill(null)),
    data: {},
    pastedNumbers: [],
  });

  const [groupB, setGroupB] = useState<GroupState>({
    columns: INITIAL_COLUMNS,
    rows: Array(NUM_ROWS).fill(null).map(() => Array(3).fill(null)),
    data: {},
    pastedNumbers: [],
  });

  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [searchResultsA, setSearchResultsA] = useState("");
  const [searchResultsB, setSearchResultsB] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load Tesseract.js
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Predict pattern based on gap
  const predictPattern = useCallback(
    (groupState: GroupState, number: number): Array<{ row: number; col: number; value: number }> => {
      const data = groupState.data[number];
      if (!data || data.occurrences.length < 2) {
        return [];
      }

      const predictions: Array<{ row: number; col: number; value: number }> = [];
      const sortedOccurrences = [...data.occurrences].sort((a, b) => {
        const posA = a.col * NUM_ROWS + a.row;
        const posB = b.col * NUM_ROWS + b.row;
        return posA - posB;
      });

      const firstOcc = sortedOccurrences[0];
      const secondOcc = sortedOccurrences[1];
      const posFirst = firstOcc.col * NUM_ROWS + firstOcc.row;
      const posSecond = secondOcc.col * NUM_ROWS + secondOcc.row;
      const gap = posSecond - posFirst;

      if (gap <= 0) return [];

      let lastOcc = sortedOccurrences[sortedOccurrences.length - 1];
      let currentPos = lastOcc.col * NUM_ROWS + lastOcc.row;

      const maxPos = groupState.columns.length * NUM_ROWS;
      while (true) {
        currentPos += gap;
        if (currentPos > maxPos) break;

        const predictedCol = Math.floor((currentPos - 1) / NUM_ROWS);
        const predictedRow = ((currentPos - 1) % NUM_ROWS) + 1;

        const isExistingInput = data.occurrences.some(
          (occ) => occ.row === predictedRow && occ.col === predictedCol
        );
        if (!isExistingInput) {
          predictions.push({ row: predictedRow, col: predictedCol, value: number });
        }
      }

      return predictions;
    },
    []
  );

  // Handle cell value change
  const handleCellChange = (
    groupId: "A" | "B",
    rowIdx: number,
    colIdx: number,
    value: string
  ) => {
    const num = value === "" ? null : parseInt(value, 10);
    const setter = groupId === "A" ? setGroupA : setGroupB;
    const group = groupId === "A" ? groupA : groupB;

    setter((prev) => {
      const newRows = prev.rows.map((r) => [...r]);
      if (!newRows[rowIdx]) newRows[rowIdx] = Array(prev.columns.length).fill(null);
      newRows[rowIdx][colIdx] = num;

      const newData = { ...prev.data };
      const newPastedNumbers = [...prev.pastedNumbers];

      // Update data tracking
      if (num !== null && num >= 100 && num <= 999) {
        if (!newPastedNumbers.includes(num)) {
          newPastedNumbers.push(num);
        }
      }

      // Update occurrences for all numbers
      for (const n in newData) {
        newData[n].occurrences = newData[n].occurrences.filter(
          (occ) => !(occ.row === rowIdx + 1 && occ.col === colIdx)
        );
      }

      if (num !== null) {
        if (!newData[num]) {
          newData[num] = { occurrences: [], predictions: [] };
        }
        newData[num].occurrences.push({ row: rowIdx + 1, col: colIdx });
        newData[num].occurrences.sort((a, b) => {
          if (a.col !== b.col) return a.col - b.col;
          return a.row - b.row;
        });
      }

      // Recalculate predictions
      for (const n in newData) {
        newData[n].predictions = predictPattern(
          { ...prev, data: newData },
          parseInt(n)
        );
      }

      return {
        ...prev,
        rows: newRows,
        data: newData,
        pastedNumbers: newPastedNumbers,
      };
    });
  };

  // Handle paste
  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    groupId: "A" | "B",
    startRow: number,
    startCol: number
  ) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text");
    const rows = pasteData.split(/\r\n|\n|\r/).map((row) => row.split(/\t|\s+/));

    rows.forEach((colData, rIndex) => {
      colData.forEach((cellValue, cIndex) => {
        const targetRow = startRow + rIndex;
        const targetCol = startCol + cIndex;
        const group = groupId === "A" ? groupA : groupB;

        if (targetRow < NUM_ROWS && targetCol < group.columns.length) {
          const parsedValue = parseInt(cellValue.trim(), 10);
          if (!isNaN(parsedValue)) {
            handleCellChange(groupId, targetRow, targetCol, String(parsedValue));
          }
        }
      });
    });
  };

  // Handle search
  const handleSearch = (groupId: "A" | "B", digit: string) => {
    const group = groupId === "A" ? groupA : groupB;
    const setSetter = groupId === "A" ? setSearchResultsA : setSearchResultsB;

    if (!digit || digit < "1" || digit > "9") {
      setSetter("");
      return;
    }

    const targetPairs = digitGroups[digit];
    const foundPairs = new Set<string>();

    group.pastedNumbers.forEach((num) => {
      const numStr = String(num).padStart(3, "0");
      const d0 = numStr[0];
      const d1 = numStr[1];
      const d2 = numStr[2];

      const combinations = [d0 + d1, d1 + d2, d0 + d2];

      combinations.forEach((combo) => {
        if (targetPairs.includes(combo)) {
          foundPairs.add(combo);
          const reverse = combo[1] + combo[0];
          foundPairs.add(reverse);
        }
      });
    });

    if (foundPairs.size > 0) {
      const sortedPairs = Array.from(foundPairs).sort();
      setSetter("Found: " + sortedPairs.join(", "));
    } else {
      setSetter("No matching pairs found.");
    }
  };

  // Add column
  const addColumn = (groupId: "A" | "B") => {
    const setter = groupId === "A" ? setGroupA : setGroupB;
    setter((prev) => {
      const newColNum = Math.max(...prev.columns) + 1;
      const newColumns = [...prev.columns, newColNum];
      const newRows = prev.rows.map((row) => [...row, null]);
      return { ...prev, columns: newColumns, rows: newRows };
    });
  };

  // Clear group
  const clearGroup = (groupId: "A" | "B") => {
    const setter = groupId === "A" ? setGroupA : setGroupB;
    setter({
      columns: INITIAL_COLUMNS,
      rows: Array(NUM_ROWS).fill(null).map(() => Array(3).fill(null)),
      data: {},
      pastedNumbers: [],
    });
    if (groupId === "A") {
      setSearchA("");
      setSearchResultsA("");
    } else {
      setSearchB("");
      setSearchResultsB("");
    }
    toast.success(`Group ${groupId} cleared`);
  };

  // Handle image upload and OCR
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Display image
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Process with OCR
    setIsProcessing(true);
    try {
      if (!window.Tesseract) {
        toast.error("Tesseract.js is loading. Please try again in a moment.");
        setIsProcessing(false);
        return;
      }

      const { data: { text } } = await window.Tesseract.recognize(file, "eng");
      
      // Parse the extracted text to find numbers
      const numbers = text.match(/\d+/g)?.map(Number) || [];
      
      if (numbers.length === 0) {
        toast.error("No numbers found in the image");
        setIsProcessing(false);
        return;
      }

      // Filter 3-digit numbers (lottery numbers)
      const lotteryNumbers = numbers.filter(n => n >= 100 && n <= 999);
      
      if (lotteryNumbers.length === 0) {
        toast.error("No valid lottery numbers (100-999) found in the image");
        setIsProcessing(false);
        return;
      }

      // Split numbers into Group A and Group B
      // Using simple logic: first half to A, second half to B
      const midpoint = Math.ceil(lotteryNumbers.length / 2);
      const groupANumbers = lotteryNumbers.slice(0, midpoint);
      const groupBNumbers = lotteryNumbers.slice(midpoint);

      // Auto-fill Group A
      groupANumbers.forEach((num, index) => {
        const rowIdx = index;
        const colIdx = 0; // Start from first column
        if (rowIdx < NUM_ROWS) {
          handleCellChange("A", rowIdx, colIdx, String(num));
        }
      });

      // Auto-fill Group B
      groupBNumbers.forEach((num, index) => {
        const rowIdx = index;
        const colIdx = 0; // Start from first column
        if (rowIdx < NUM_ROWS) {
          handleCellChange("B", rowIdx, colIdx, String(num));
        }
      });

      toast.success(`Extracted ${lotteryNumbers.length} numbers from the image!`);
    } catch (error) {
      console.error("OCR Error:", error);
      toast.error("Error processing image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Render group table
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
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
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
                className="w-full"
              />
            </div>
            <Button
              onClick={() => clearGroup(groupId)}
              variant="destructive"
              className="mt-6"
            >
              Clear All Group {groupId}
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
                <th className="border border-gray-300 p-2 text-center font-semibold">No</th>
                {group.columns.map((col) => (
                  <th key={col} className="border border-gray-300 p-2 text-center font-semibold">
                    {col}
                  </th>
                ))}
                <th className="border border-gray-300 p-2 text-center">
                  <Button
                    onClick={() => addColumn(groupId)}
                    size="sm"
                    variant="outline"
                    className="h-6 w-6 p-0"
                  >
                    <Plus size={14} />
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className={rowIdx % 2 === 0 ? "bg-pink-100" : "bg-pink-50"}>
                  <td className="border border-gray-300 p-2 text-center font-semibold bg-pink-200">
                    {rowIdx + 1}
                  </td>
                  {row.map((value, colIdx) => {
                    const isPredicted = value !== null && group.data[value]?.predictions.some(
                      (p: { row: number; col: number; value: number }) => p.row === rowIdx + 1 && p.col === colIdx
                    );

                    return (
                      <td
                        key={`${rowIdx}-${colIdx}`}
                        className="border border-gray-300 p-1 text-center"
                      >
                        <input
                          type="number"
                          value={value || ""}
                          onChange={(e) =>
                            handleCellChange(groupId, rowIdx, colIdx, e.target.value)
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
                  <td className="border border-gray-300 p-1 text-center"></td>
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

        {/* Image Upload Section */}
        <Card className="p-6 bg-white mb-8">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
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
              <div className="text-sm text-slate-600">
                Processing image...
              </div>
            )}
          </div>

          {uploadedImage && (
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Uploaded Image:</p>
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

        {/* Back Button */}
        <div className="flex justify-center mt-8 mb-4">
          <Button
            onClick={() => {
              setGroupA({
                columns: INITIAL_COLUMNS,
                rows: Array(NUM_ROWS).fill(null).map(() => Array(3).fill(null)),
                data: {},
                pastedNumbers: [],
              });
              setGroupB({
                columns: INITIAL_COLUMNS,
                rows: Array(NUM_ROWS).fill(null).map(() => Array(3).fill(null)),
                data: {},
                pastedNumbers: [],
              });
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
