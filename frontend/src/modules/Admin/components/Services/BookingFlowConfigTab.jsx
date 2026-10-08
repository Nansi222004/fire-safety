import { FiPlus, FiTrash2, FiArrowUp, FiArrowDown } from "react-icons/fi";

/**
 * Admin configuration for the customer booking wizard:
 * category types, quantity rules, schedule window and price extras.
 */
export const DEFAULT_BOOKING_FLOW = {
  variantConfig: { label: "Category Type", description: "" },
  variants: [],
  quantityConfig: { label: "Quantity", unitLabel: "unit", min: 1, max: 100 },
  bookingConfig: { slotDurationMinutes: 60, advanceBookingDays: 30, minLeadMinutes: 0 },
  pricingConfig: { visitCharge: 0, taxRate: 0, priceNote: "" },
};

export const bookingFlowFromService = (service = {}) => ({
  variantConfig: { ...DEFAULT_BOOKING_FLOW.variantConfig, ...(service.variantConfig || {}) },
  variants: (service.variants || []).map((v) => ({
    key: v.key || "",
    label: v.label || "",
    description: v.description || "",
    isActive: v.isActive !== false,
  })),
  quantityConfig: { ...DEFAULT_BOOKING_FLOW.quantityConfig, ...(service.quantityConfig || {}) },
  bookingConfig: { ...DEFAULT_BOOKING_FLOW.bookingConfig, ...(service.bookingConfig || {}) },
  pricingConfig: { ...DEFAULT_BOOKING_FLOW.pricingConfig, ...(service.pricingConfig || {}) },
});

/** Converts form state to the API payload (numbers coerced, order preserved). */
export const bookingFlowToPayload = (form) => ({
  variantConfig: form.variantConfig,
  variants: form.variants
    .filter((v) => v.label.trim())
    .map((v, i) => ({ ...(v.key ? { key: v.key } : {}), label: v.label.trim(), description: v.description.trim(), isActive: v.isActive, sortOrder: i })),
  quantityConfig: { ...form.quantityConfig, min: Number(form.quantityConfig.min) || 1, max: Number(form.quantityConfig.max) || 1 },
  bookingConfig: {
    slotDurationMinutes: Number(form.bookingConfig.slotDurationMinutes) || 60,
    advanceBookingDays: Number(form.bookingConfig.advanceBookingDays) || 30,
    minLeadMinutes: Number(form.bookingConfig.minLeadMinutes) || 0,
  },
  pricingConfig: {
    visitCharge: Number(form.pricingConfig.visitCharge) || 0,
    taxRate: Number(form.pricingConfig.taxRate) || 0,
    priceNote: form.pricingConfig.priceNote || "",
  },
});

const inputCls =
  "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const Section = ({ title, hint, children }) => (
  <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
    <div>
      <h4 className="text-sm font-bold text-gray-800">{title}</h4>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
    {children}
  </div>
);

const Num = ({ label, value, onChange, min = 0, max, step = 1 }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-gray-700 mb-1">{label}</span>
    <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
  </label>
);

const BookingFlowConfigTab = ({ value, onChange, requiresQuantity, onToggleQuantity }) => {
  const set = (section, patch) => onChange({ ...value, [section]: { ...value[section], ...patch } });
  const setVariants = (variants) => onChange({ ...value, variants });
  const moveVariant = (idx, dir) => {
    const next = [...value.variants];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setVariants(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        Customer booking steps: Pincode → Provider → {value.variants.length ? value.variantConfig.label || "Category Type" : <s>Category Type</s>} →{" "}
        {requiresQuantity ? value.quantityConfig.label || "Quantity" : <s>Quantity</s>} → Price → Address → Schedule → Payment. Steps that are
        not configured are skipped automatically.
      </p>

      <Section
        title="Category Types"
        hint="Options the customer chooses from (e.g. CO2 / ABC / DCP, or 2 KG / 4 KG / 9 KG). Each provider sets their own price per option.">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Step title</span>
            <input value={value.variantConfig.label} onChange={(e) => set("variantConfig", { label: e.target.value })} placeholder="Extinguisher Type" className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Helper text</span>
            <input value={value.variantConfig.description} onChange={(e) => set("variantConfig", { description: e.target.value })} placeholder="Choose the type mentioned on your cylinder label" className={inputCls} />
          </label>
        </div>
        <ul className="space-y-2">
          {value.variants.map((v, idx) => (
            <li key={idx} className="flex flex-col sm:flex-row gap-2 sm:items-center p-2 rounded-lg bg-gray-50 border border-gray-100">
              <input value={v.label} onChange={(e) => setVariants(value.variants.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} placeholder="Option name, e.g. CO2" className={`${inputCls} sm:w-48`} />
              <input value={v.description} onChange={(e) => setVariants(value.variants.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))} placeholder="Short description (optional)" className={`${inputCls} flex-1`} />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 whitespace-nowrap">
                <input type="checkbox" checked={v.isActive} onChange={(e) => setVariants(value.variants.map((x, i) => (i === idx ? { ...x, isActive: e.target.checked } : x)))} /> Active
              </label>
              <div className="flex gap-1">
                <button type="button" aria-label="Move up" onClick={() => moveVariant(idx, -1)} className="p-1.5 text-gray-500 hover:text-gray-800"><FiArrowUp /></button>
                <button type="button" aria-label="Move down" onClick={() => moveVariant(idx, 1)} className="p-1.5 text-gray-500 hover:text-gray-800"><FiArrowDown /></button>
                <button type="button" aria-label="Remove option" onClick={() => setVariants(value.variants.filter((_, i) => i !== idx))} className="p-1.5 text-red-500 hover:text-red-700"><FiTrash2 /></button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setVariants([...value.variants, { key: "", label: "", description: "", isActive: true }])} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600">
          <FiPlus /> Add option
        </button>
      </Section>

      <Section title="Quantity" hint="Ask the customer how many units need service. Price is multiplied by quantity.">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <input type="checkbox" checked={requiresQuantity} onChange={(e) => onToggleQuantity(e.target.checked)} /> Ask customer for quantity
        </label>
        {requiresQuantity && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Step title</span>
              <input value={value.quantityConfig.label} onChange={(e) => set("quantityConfig", { label: e.target.value })} placeholder="Number of cylinders" className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Unit name</span>
              <input value={value.quantityConfig.unitLabel} onChange={(e) => set("quantityConfig", { unitLabel: e.target.value })} placeholder="cylinder" className={inputCls} />
            </label>
            <Num label="Minimum" min={1} value={value.quantityConfig.min} onChange={(v) => set("quantityConfig", { min: v })} />
            <Num label="Maximum" min={1} value={value.quantityConfig.max} onChange={(v) => set("quantityConfig", { max: v })} />
          </div>
        )}
      </Section>

      <Section title="Price Extras" hint="Added on top of the provider's price in the Price step.">
        <div className="grid sm:grid-cols-3 gap-3">
          <Num label="Visit charge (₹)" step="0.01" value={value.pricingConfig.visitCharge} onChange={(v) => set("pricingConfig", { visitCharge: v })} />
          <Num label="Tax rate (%)" max={100} step="0.01" value={value.pricingConfig.taxRate} onChange={(v) => set("pricingConfig", { taxRate: v })} />
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Price note for customer</span>
            <input value={value.pricingConfig.priceNote} onChange={(e) => set("pricingConfig", { priceNote: e.target.value })} placeholder="Spare parts billed separately" className={inputCls} />
          </label>
        </div>
      </Section>

      <Section title="Schedule" hint="Time slots are generated from each provider's weekly working hours and daily capacity.">
        <div className="grid sm:grid-cols-3 gap-3">
          <Num label="Slot length (minutes)" min={15} max={480} value={value.bookingConfig.slotDurationMinutes} onChange={(v) => set("bookingConfig", { slotDurationMinutes: v })} />
          <Num label="Bookable days ahead" min={1} max={180} value={value.bookingConfig.advanceBookingDays} onChange={(v) => set("bookingConfig", { advanceBookingDays: v })} />
          <Num label="Minimum notice (minutes)" min={0} value={value.bookingConfig.minLeadMinutes} onChange={(v) => set("bookingConfig", { minLeadMinutes: v })} />
        </div>
      </Section>
    </div>
  );
};

export default BookingFlowConfigTab;
