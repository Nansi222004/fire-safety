import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { FiSearch, FiSave } from "react-icons/fi";
import { getWholesalerProducts, updateWholesalerPricing } from "../services/wholesalerService";

const toDraft = (product) => ({
  wholesalePrice: product?.wholesale?.price ?? "",
  moq: product?.wholesale?.moq ?? 1,
  stockQuantity: product?.stockQuantity ?? 0,
});

// text-base on phones keeps iOS from zooming into the field on focus.
const numberInputClass =
  "px-2 py-2 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#E31E24]/40 disabled:opacity-50";

const saveButtonClass =
  "inline-flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 bg-[#E31E24] hover:bg-[#C8191E] disabled:bg-slate-200 disabled:text-slate-500 text-white rounded-lg text-xs font-semibold";

/** Draft state, validation and saving for one product's price / MOQ / stock. */
const usePricingDraft = (product, onSaved) => {
  const [draft, setDraft] = useState(() => toDraft(product));
  const [isSaving, setIsSaving] = useState(false);
  const original = useMemo(() => toDraft(product), [product]);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(original);
  // Variant products keep stock per variant, edited from the product form.
  const hasVariantStock = Object.keys(product?.variants?.stockMap || {}).length > 0;

  const setField = (field) => (e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }));

  const save = async () => {
    if (draft.wholesalePrice === "" || Number(draft.wholesalePrice) <= 0) {
      toast.error("Wholesale price must be greater than 0.");
      return;
    }
    if (!Number.isInteger(Number(draft.moq)) || Number(draft.moq) < 1) {
      toast.error("MOQ must be a whole number of at least 1.");
      return;
    }
    if (!Number.isFinite(Number(draft.stockQuantity)) || Number(draft.stockQuantity) < 0) {
      toast.error("Stock cannot be negative.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = { wholesalePrice: Number(draft.wholesalePrice), moq: Number(draft.moq) };
      if (!hasVariantStock && Number(draft.stockQuantity) !== Number(original.stockQuantity)) {
        payload.stockQuantity = Number(draft.stockQuantity);
      }
      const updated = await updateWholesalerPricing(product._id, payload);
      onSaved(updated);
      toast.success(`Saved ${product.name}.`);
    } catch (err) {
      if (!err?.toastShown) toast.error(err.message || "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  return { draft, setField, isDirty, isSaving, hasVariantStock, save };
};

const PriceInput = ({ product, value, onChange, className }) => (
  <input
    type="number"
    inputMode="decimal"
    min="0"
    step="0.01"
    aria-label={`Wholesale price for ${product.name}`}
    value={value}
    onChange={onChange}
    placeholder="₹"
    className={`${numberInputClass} ${className}`}
  />
);

const MoqInput = ({ product, value, onChange, className }) => (
  <input
    type="number"
    inputMode="numeric"
    min="1"
    step="1"
    aria-label={`Minimum order quantity for ${product.name}`}
    value={value}
    onChange={onChange}
    className={`${numberInputClass} ${className}`}
  />
);

const StockInput = ({ product, value, onChange, disabled, className }) => (
  <input
    type="number"
    inputMode="numeric"
    min="0"
    step="1"
    aria-label={`Stock for ${product.name}`}
    value={value}
    disabled={disabled}
    title={disabled ? "Variant stock is edited from the product form" : undefined}
    onChange={onChange}
    className={`${numberInputClass} ${className}`}
  />
);

// Tablet & desktop
const PricingRow = ({ product, highlighted, onSaved }) => {
  const { draft, setField, isDirty, isSaving, hasVariantStock, save } = usePricingDraft(product, onSaved);
  return (
    <tr className={`border-b border-slate-100 last:border-0 ${highlighted ? "bg-[#FEF2F2]/60" : ""}`}>
      <td className="py-3 pr-3">
        <p className="font-semibold text-slate-800 truncate min-w-[180px]">{product.name}</p>
        {!product.isActive && <p className="text-[11px] text-slate-500">Hidden from buyers</p>}
      </td>
      <td className="py-3 px-3">
        <PriceInput product={product} value={draft.wholesalePrice} onChange={setField("wholesalePrice")} className="w-28" />
      </td>
      <td className="py-3 px-3">
        <MoqInput product={product} value={draft.moq} onChange={setField("moq")} className="w-20" />
      </td>
      <td className="py-3 px-3">
        <StockInput product={product} value={draft.stockQuantity} onChange={setField("stockQuantity")} disabled={hasVariantStock} className="w-24" />
      </td>
      <td className="py-3 pl-3 text-right">
        <button type="button" onClick={save} disabled={!isDirty || isSaving} className={saveButtonClass}>
          <FiSave /> {isSaving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
};

// Phone
const PricingCard = ({ product, highlighted, onSaved }) => {
  const { draft, setField, isDirty, isSaving, hasVariantStock, save } = usePricingDraft(product, onSaved);
  return (
    <li id={`pricing-${product._id}`} className={`py-3 ${highlighted ? "bg-[#FEF2F2]/60 -mx-3 px-3" : ""}`}>
      <div className="flex items-center gap-3 mb-2.5">
        <img
          src={product.image || product.images?.[0] || "https://via.placeholder.com/40?text=P"}
          alt=""
          className="w-10 h-10 rounded-lg object-cover border border-slate-100 bg-slate-50 flex-shrink-0"
        />
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{product.name}</p>
          {!product.isActive && <p className="text-[11px] text-slate-500">Hidden from buyers</p>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] font-semibold text-slate-500">
          Price (₹)
          <PriceInput product={product} value={draft.wholesalePrice} onChange={setField("wholesalePrice")} className="w-full mt-1" />
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          MOQ
          <MoqInput product={product} value={draft.moq} onChange={setField("moq")} className="w-full mt-1" />
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Stock
          <StockInput product={product} value={draft.stockQuantity} onChange={setField("stockQuantity")} disabled={hasVariantStock} className="w-full mt-1" />
        </label>
      </div>
      {isDirty && (
        <button type="button" onClick={save} disabled={isSaving} className={`${saveButtonClass} w-full mt-2.5`}>
          <FiSave /> {isSaving ? "Saving…" : "Save changes"}
        </button>
      )}
    </li>
  );
};

const WholesalerPricing = () => {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("product");
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => {
      setIsLoading(true);
      getWholesalerProducts({ search, limit: 100 })
        .then((data) => setProducts(data?.products ?? []))
        .catch(() => setProducts([]))
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Opened from a product's "Price & stock" shortcut: bring that product into view.
  useEffect(() => {
    if (isLoading || !highlightId) return;
    document.getElementById(`pricing-${highlightId}`)?.scrollIntoView({ block: "center" });
  }, [isLoading, highlightId]);

  const handleSaved = (updated) => {
    if (!updated?._id) return;
    setProducts((prev) => prev.map((p) => (p._id === updated._id ? { ...p, ...updated, categoryId: p.categoryId } : p)));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="hidden lg:block text-3xl font-bold text-slate-900 mb-1">Pricing & Stock</h1>
        <p className="text-sm text-slate-500">Update wholesale price, minimum order quantity (MOQ) and stock in one place.</p>
      </div>

      <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-slate-200">
        <div className="relative mb-2 md:mb-4">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31E24]/40 text-base sm:text-sm"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No products found.</p>
        ) : (
          <>
            <ul className="md:hidden divide-y divide-slate-100">
              {products.map((product) => (
                <PricingCard
                  key={`${product._id}-${product.updatedAt || ""}`}
                  product={product}
                  highlighted={highlightId === product._id}
                  onSaved={handleSaved}
                />
              ))}
            </ul>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-3 pr-3">Product</th>
                    <th className="py-3 px-3">Wholesale Price</th>
                    <th className="py-3 px-3">MOQ</th>
                    <th className="py-3 px-3">Stock</th>
                    <th className="py-3 pl-3" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <PricingRow
                      key={`${product._id}-${product.updatedAt || ""}`}
                      product={product}
                      highlighted={highlightId === product._id}
                      onSaved={handleSaved}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default WholesalerPricing;
