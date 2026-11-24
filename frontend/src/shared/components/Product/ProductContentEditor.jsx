import { useEffect, useMemo, useRef, useState } from "react";
import { FiPlus, FiTrash2, FiList, FiGrid } from "react-icons/fi";
import api from "../../utils/api";

// Same limits as the backend (backend/src/utils/productContent.js).
export const PRODUCT_CONTENT_LIMITS = Object.freeze({
  maxHighlights: 20,
  highlightLength: 300,
  maxSpecifications: 40,
  specLabelLength: 60,
  specValueLength: 200,
});
const L = PRODUCT_CONTENT_LIMITS;

/** Clean payload values (empty rows dropped) — the backend applies the same rules. */
export const cleanHighlights = (list) =>
  (Array.isArray(list) ? list : []).map((h) => String(h || "").trim()).filter(Boolean).slice(0, L.maxHighlights);
export const cleanSpecifications = (list) =>
  (Array.isArray(list) ? list : [])
    .map((r) => ({ label: String(r?.label || "").trim(), value: String(r?.value || "").trim() }))
    .filter((r) => r.label && r.value)
    .slice(0, L.maxSpecifications);

const inputClass =
  "w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm";

/**
 * Key highlights (bullet points) + specifications (name/value rows) for a product.
 * Specification names are free text; suggestions come from names already used in the same category
 * (nothing is hardcoded per category).
 *
 * @param {object} props
 * @param {string[]} props.highlights
 * @param {{label:string,value:string}[]} props.specifications
 * @param {(patch: {highlights?: string[], specifications?: object[]}) => void} props.onChange
 * @param {string|null} props.categoryId     selected (sub)category, used for name suggestions
 * @param {'vendor'|'admin'} [props.scope]
 */
const ProductContentEditor = ({ highlights = [], specifications = [], onChange, categoryId, scope = "vendor" }) => {
  const [suggestions, setSuggestions] = useState([]);
  const listId = useMemo(() => `spec-names-${Math.random().toString(36).slice(2, 8)}`, []);
  // Enter / "Add point" moves the cursor into the new row (otherwise typing continues in the old one).
  const pointRefs = useRef([]);
  const [focusPoint, setFocusPoint] = useState(null);
  useEffect(() => {
    if (focusPoint === null) return;
    pointRefs.current[focusPoint]?.focus();
    setFocusPoint(null);
  }, [focusPoint, highlights]);

  useEffect(() => {
    let active = true;
    if (!categoryId) {
      setSuggestions([]);
      return undefined;
    }
    const base = scope === "admin" ? "/admin" : "/vendor";
    api
      .get(`${base}/products/specification-suggestions`, { params: { categoryId }, skipErrorToast: true })
      .then((res) => {
        const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        if (active) setSuggestions(list);
      })
      .catch(() => active && setSuggestions([]));
    return () => {
      active = false;
    };
  }, [categoryId, scope]);

  const points = highlights.length ? highlights : [""];
  const rows = specifications.length ? specifications : [{ label: "", value: "" }];
  const usedLabels = new Set(specifications.map((r) => String(r.label || "").trim().toLowerCase()).filter(Boolean));
  const unusedSuggestions = suggestions.filter((s) => !usedLabels.has(String(s).toLowerCase())).slice(0, 12);

  // ── Highlights ──
  const setPoints = (next) => onChange({ highlights: next.slice(0, L.maxHighlights) });
  const updatePoint = (index, value) => {
    const next = [...points];
    next[index] = value.slice(0, L.highlightLength);
    setPoints(next);
  };
  const addPoint = (afterIndex = points.length - 1) => {
    if (points.length >= L.maxHighlights) return;
    const next = [...points];
    next.splice(afterIndex + 1, 0, "");
    setPoints(next);
    setFocusPoint(afterIndex + 1);
  };
  const removePoint = (index) => setPoints(points.filter((_, i) => i !== index));
  // Pasting several lines (e.g. copied from a datasheet) creates one point per line.
  const pastePoints = (index, event) => {
    const text = event.clipboardData?.getData("text") || "";
    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•●▪◦]|\d+[.)])\s+/, "").trim()).filter(Boolean);
    if (lines.length < 2) return;
    event.preventDefault();
    const next = [...points];
    const pasted = lines.map((l) => l.slice(0, L.highlightLength));
    // Into an empty row: replace it. Into a filled row: keep it and add the pasted points after it.
    if (next[index]) next.splice(index + 1, 0, ...pasted);
    else next.splice(index, 1, ...pasted);
    setPoints(next);
  };

  // ── Specifications ──
  const setRows = (next) => onChange({ specifications: next.slice(0, L.maxSpecifications) });
  const updateRow = (index, field, value) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [field]: value.slice(0, field === "label" ? L.specLabelLength : L.specValueLength) } : r));
    setRows(next);
  };
  const addRow = (label = "") => {
    if (rows.length >= L.maxSpecifications) return;
    const emptyIndex = rows.findIndex((r) => !r.label && !r.value);
    if (label && emptyIndex >= 0) {
      setRows(rows.map((r, i) => (i === emptyIndex ? { ...r, label } : r)));
      return;
    }
    setRows([...rows, { label, value: "" }]);
  };
  const removeRow = (index) => setRows(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-5">
      {/* Highlights */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <FiList className="text-primary-600" /> Key highlights
          </label>
          <span className="text-[11px] text-gray-400">{cleanHighlights(highlights).length}/{L.maxHighlights}</span>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">
          Shown as bullet points on the product page. One point per row — press Enter for the next point, or paste a list.
        </p>
        <div className="space-y-2">
          {points.map((point, index) => (
            <div key={`hl-${index}`} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" aria-hidden="true" />
              <input
                ref={(el) => { pointRefs.current[index] = el; }}
                type="text"
                value={point}
                maxLength={L.highlightLength}
                onChange={(e) => updatePoint(index, e.target.value)}
                onPaste={(e) => pastePoints(index, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPoint(index);
                  }
                }}
                placeholder={index === 0 ? "e.g. Safe for use on live electrical equipment" : "Next point"}
                aria-label={`Highlight ${index + 1}`}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removePoint(index)}
                disabled={points.length === 1 && !point}
                className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 flex-shrink-0"
                aria-label={`Remove highlight ${index + 1}`}
              >
                <FiTrash2 />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => addPoint()}
          disabled={points.length >= L.maxHighlights}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-40"
        >
          <FiPlus /> Add point
        </button>
      </div>

      {/* Specifications */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <FiGrid className="text-primary-600" /> Specifications
          </label>
          <span className="text-[11px] text-gray-400">{cleanSpecifications(specifications).length}/{L.maxSpecifications}</span>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">
          Shown as a table on the product page (e.g. Capacity → 6 kg). Rows without both a name and a value are not saved.
        </p>
        {unusedSuggestions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Names used in this category">
            <span className="text-[11px] text-gray-500 mr-1 self-center">Used in this category:</span>
            {unusedSuggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => addRow(name)}
                className="px-2 py-1 rounded-full border border-gray-200 bg-gray-50 hover:bg-primary-50 hover:border-primary-200 text-[11px] text-gray-700"
              >
                + {name}
              </button>
            ))}
          </div>
        )}
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`spec-${index}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2 items-start rounded-lg sm:rounded-none border sm:border-0 border-gray-100 p-2 sm:p-0">
              <input
                type="text"
                list={listId}
                value={row.label}
                maxLength={L.specLabelLength}
                onChange={(e) => updateRow(index, "label", e.target.value)}
                placeholder="Name (e.g. Capacity)"
                aria-label={`Specification ${index + 1} name`}
                className={`${inputClass} font-medium`}
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                disabled={rows.length === 1 && !row.label && !row.value}
                className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 sm:order-last"
                aria-label={`Remove specification ${index + 1}`}
              >
                <FiTrash2 />
              </button>
              <input
                type="text"
                value={row.value}
                maxLength={L.specValueLength}
                onChange={(e) => updateRow(index, "value", e.target.value)}
                placeholder="Value (e.g. 6 kg)"
                aria-label={`Specification ${index + 1} value`}
                className={`${inputClass} col-span-2 sm:col-span-1`}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => addRow()}
          disabled={rows.length >= L.maxSpecifications}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-40"
        >
          <FiPlus /> Add specification
        </button>
      </div>
    </div>
  );
};

export default ProductContentEditor;
