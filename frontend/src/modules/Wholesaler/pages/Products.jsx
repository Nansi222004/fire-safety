import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiSearch, FiPlus, FiPackage, FiEdit2, FiTag } from "react-icons/fi";
import { getWholesalerProducts } from "../services/wholesalerService";
import { formatPrice } from "../../../shared/utils/helpers";

const STOCK_TONES = {
  in_stock: "text-emerald-700",
  low_stock: "text-amber-700",
  out_of_stock: "text-red-600",
};

const WholesalerProducts = () => {
  const navigate = useNavigate();
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

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-5">
      {/* Page heading on larger screens; on phones the app bar shows the title and a floating button adds products. */}
      <div className="hidden md:flex md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">Wholesale Products</h1>
          <p className="text-sm text-slate-500">Your catalog for verified business buyers, with wholesale price and minimum order quantity.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/wholesaler/products/add-product")}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#E31E24] hover:bg-[#C8191E] text-white rounded-lg text-sm font-semibold"
        >
          <FiPlus /> Add Product
        </button>
      </div>

      <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-slate-200">
        <div className="relative mb-4">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31E24]/40 text-sm"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
        ) : products.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <FiPackage className="mx-auto text-3xl text-slate-300" />
            <p className="text-sm text-slate-500">{search ? "No products match your search." : "No wholesale products yet."}</p>
          </div>
        ) : (
          <>
          {/* Phone: card list */}
          <ul className="md:hidden divide-y divide-slate-100 -mx-1">
            {products.map((product) => (
              <li key={product._id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/wholesaler/products/${product._id}`)}
                  className="flex-1 min-w-0 flex items-center gap-3 px-1 py-3 text-left active:bg-slate-50 rounded-lg"
                >
                  <img
                    src={product.image || product.images?.[0] || "https://via.placeholder.com/56?text=P"}
                    alt={product.name}
                    className="w-14 h-14 rounded-xl object-cover border border-slate-100 bg-slate-50 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{product.name}</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                      {formatPrice(product.wholesale?.price)}
                      <span className="text-xs font-medium text-slate-500"> · MOQ {product.wholesale?.moq || 1}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px]">
                      <span className={`px-1.5 py-0.5 rounded-full font-bold border ${
                        product.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"
                      }`}>
                        {product.isActive ? "Active" : "Hidden"}
                      </span>
                      <span className={`font-semibold ${STOCK_TONES[product.stock] || "text-slate-600"}`}>
                        Stock {product.stockQuantity ?? 0}
                      </span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/wholesaler/pricing?product=${product._id}`)}
                  className="flex-shrink-0 p-3 mr-1 rounded-full text-[#E31E24] bg-[#FEF2F2] active:bg-red-100"
                  aria-label={`Price and stock for ${product.name}`}
                >
                  <FiTag />
                </button>
              </li>
            ))}
          </ul>

          {/* Tablet & desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-3 pr-3">Product</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Wholesale Price</th>
                  <th className="py-3 px-3 text-right">MOQ</th>
                  <th className="py-3 px-3 text-right">Stock</th>
                  <th className="py-3 pl-3" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product._id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <img
                          src={product.image || product.images?.[0] || "https://via.placeholder.com/48?text=P"}
                          alt={product.name}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-100 bg-slate-50"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{product.name}</p>
                          <p className="text-xs text-slate-500 truncate">{product.categoryId?.name || ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                        product.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"
                      }`}>
                        {product.isActive ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-800">{formatPrice(product.wholesale?.price)}</td>
                    <td className="py-3 px-3 text-right">{product.wholesale?.moq || 1}</td>
                    <td className={`py-3 px-3 text-right font-medium ${STOCK_TONES[product.stock] || "text-slate-700"}`}>{product.stockQuantity ?? 0}</td>
                    <td className="py-3 pl-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => navigate(`/wholesaler/products/${product._id}`)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 mr-3"
                      >
                        <FiEdit2 /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/wholesaler/pricing?product=${product._id}`)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#E31E24] hover:text-[#C8191E]"
                      >
                        <FiTag /> Price & stock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Phone: floating add button above the tab bar */}
      <button
        type="button"
        onClick={() => navigate("/wholesaler/products/add-product")}
        aria-label="Add product"
        className="md:hidden fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 w-14 h-14 rounded-full bg-[#E31E24] active:bg-[#C8191E] text-white shadow-lg shadow-red-500/30 flex items-center justify-center"
      >
        <FiPlus className="text-2xl" />
      </button>
    </motion.div>
  );
};

export default WholesalerProducts;
