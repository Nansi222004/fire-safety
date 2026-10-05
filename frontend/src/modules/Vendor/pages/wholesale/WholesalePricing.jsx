import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { FiSearch, FiSave } from "react-icons/fi";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { getVendorCapabilities } from "../../utils/vendorCapabilities";
import { getWholesaleProducts, updateWholesalePricing } from "../../services/vendorService";
import { formatPrice } from "../../../../shared/utils/helpers";
import { ChannelBadge } from "./WholesaleProducts";

const toDraft = (product) => ({
  wholesaleEnabled: product?.wholesale?.enabled === true,
  wholesalePrice: product?.wholesale?.price ?? "",
  moq: product?.wholesale?.moq ?? 1,
  b2cAvailable: product?.b2cAvailable !== false,
});

const PricingRow = ({ product, canSellRetail, highlighted, onSaved }) => {
  const [draft, setDraft] = useState(() => toDraft(product));
  const [isSaving, setIsSaving] = useState(false);
  const original = useMemo(() => toDraft(product), [product]);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(original);

  const handleSave = async () => {
    if (draft.wholesaleEnabled && (draft.wholesalePrice === "" || Number(draft.wholesalePrice) < 0)) {
      toast.error("Enter a valid wholesale price.");
      return;
    }
    if (!Number.isInteger(Number(draft.moq)) || Number(draft.moq) < 1) {
      toast.error("MOQ must be a whole number of at least 1.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        wholesaleEnabled: draft.wholesaleEnabled,
        moq: Number(draft.moq),
        b2cAvailable: draft.b2cAvailable,
      };
      if (draft.wholesalePrice !== "") payload.wholesalePrice = Number(draft.wholesalePrice);
      const updated = await updateWholesalePricing(product._id, payload);
      onSaved(updated);
      toast.success(`Wholesale pricing saved for ${product.name}.`);
    } catch (err) {
      toast.error(err.message || "Failed to save wholesale pricing.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <tr className={`border-b border-gray-100 last:border-0 ${highlighted ? "bg-sky-50/60" : ""}`}>
      <td className="py-3 pr-3">
        <div className="min-w-[180px]">
          <p className="font-semibold text-gray-800 truncate">{product.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <ChannelBadge product={product} />
            {product.b2cAvailable !== false && (
              <span className="text-xs text-gray-500">Retail {formatPrice(product.price)}</span>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-3 text-center">
        <input
          type="checkbox"
          aria-label="Available for B2B / wholesale"
          checked={draft.wholesaleEnabled}
          onChange={(e) => setDraft({ ...draft, wholesaleEnabled: e.target.checked })}
          className="w-4 h-4 accent-sky-600"
        />
      </td>
      <td className="py-3 px-3">
        <input
          type="number"
          min="0"
          step="0.01"
          value={draft.wholesalePrice}
          onChange={(e) => setDraft({ ...draft, wholesalePrice: e.target.value })}
          placeholder="₹"
          className="w-28 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </td>
      <td className="py-3 px-3">
        <input
          type="number"
          min="1"
          step="1"
          value={draft.moq}
          onChange={(e) => setDraft({ ...draft, moq: e.target.value })}
          className="w-20 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </td>
      <td className="py-3 px-3 text-center">
        <input
          type="checkbox"
          aria-label="Available for B2C / retail"
          checked={draft.b2cAvailable}
          disabled={!canSellRetail && !draft.b2cAvailable}
          onChange={(e) => setDraft({ ...draft, b2cAvailable: e.target.checked })}
          className="w-4 h-4 accent-primary-600 disabled:opacity-40"
        />
      </td>
      <td className="py-3 pl-3 text-right">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-lg text-xs font-semibold">
          <FiSave /> {isSaving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
};

const WholesalePricing = () => {
  const { vendor } = useVendorAuthStore();
  const { sellsProducts } = getVendorCapabilities(vendor);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("product");
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => {
      setIsLoading(true);
      getWholesaleProducts({ scope: "all", search, limit: 100 })
        .then((data) => setProducts(data?.products ?? []))
        .catch(() => setProducts([]))
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const handleSaved = (updated) => {
    if (!updated?._id) return;
    setProducts((prev) => prev.map((p) => (p._id === updated._id ? { ...p, ...updated, categoryId: p.categoryId } : p)));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">Wholesale Pricing</h1>
        <p className="text-sm sm:text-base text-gray-600">
          Set wholesale price, MOQ and sales channel (B2C, B2B or both) for your products. Retail prices are not changed here.
        </p>
      </div>

      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
        <div className="relative mb-5">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No products found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-3 pr-3">Product</th>
                  <th className="py-3 px-3 text-center">B2B</th>
                  <th className="py-3 px-3">Wholesale Price</th>
                  <th className="py-3 px-3">MOQ</th>
                  <th className="py-3 px-3 text-center">B2C</th>
                  <th className="py-3 pl-3" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <PricingRow
                    key={`${product._id}-${product.updatedAt || ""}`}
                    product={product}
                    canSellRetail={sellsProducts}
                    highlighted={highlightId === product._id}
                    onSaved={handleSaved}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default WholesalePricing;
