// Per-category-type pricing for a provider. Category types are defined by Admin on the service;
// an empty price falls back to the provider's base price.

export const getActiveVariants = (serviceMaster) =>
  (Array.isArray(serviceMaster?.variants) ? serviceMaster.variants : [])
    .filter((v) => v && v.isActive !== false && v.key)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

export const toVariantPriceState = (raw) => {
  if (!raw) return {};
  const entries = raw instanceof Map ? Array.from(raw.entries()) : Object.entries(raw);
  return Object.fromEntries(entries.map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));
};

/** Only numeric, non-negative prices are sent; blanks mean "use base price". */
export const toVariantPricePayload = (state, variants) =>
  Object.fromEntries(
    variants
      .map((v) => [v.key, state[v.key]])
      .filter(([, value]) => value !== '' && value !== undefined && Number(value) >= 0)
      .map(([key, value]) => [key, Number(value)])
  );

const VariantPriceEditor = ({ serviceMaster, value, onChange, basePrice }) => {
  const variants = getActiveVariants(serviceMaster);
  if (!variants.length) return null;
  const label = serviceMaster?.variantConfig?.label || 'Category Type';

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-800">Price per {label} (₹)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {variants.map((v) => (
          <label key={v.key} className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-white">
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-semibold text-slate-800 truncate">{v.label}</span>
              {v.description && <span className="block text-[10px] text-slate-500 truncate">{v.description}</span>}
            </span>
            <input
              type="number"
              min="0"
              value={value[v.key] ?? ''}
              onChange={(e) => onChange({ ...value, [v.key]: e.target.value })}
              placeholder={basePrice !== undefined && basePrice !== '' ? String(basePrice) : 'Base price'}
              className="w-24 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-right focus:outline-none focus:border-[#E31E24]"
            />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">Leave blank to charge your base price for that option.</p>
    </div>
  );
};

export default VariantPriceEditor;
