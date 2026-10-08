import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiSearch, FiPlus, FiBriefcase, FiEdit2 } from "react-icons/fi";
import { getWholesaleProducts } from "../../services/vendorService";
import { formatPrice } from "../../../../shared/utils/helpers";

export const ChannelBadge = ({ product }) => {
  const b2c = product?.b2cAvailable !== false;
  const b2b = product?.wholesale?.enabled === true;
  const label = b2c && b2b ? "B2C + B2B" : b2b ? "B2B only" : "B2C only";
  const tone = b2c && b2b
    ? "bg-purple-50 text-purple-700 border-purple-200"
    : b2b
    ? "bg-sky-50 text-sky-700 border-sky-200"
    : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${tone}`}>
      {label}
    </span>
  );
};

const WholesaleProducts = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => {
      setIsLoading(true);
      getWholesaleProducts({ scope: "wholesale", search })
        .then((data) => setProducts(data?.products ?? []))
        .catch(() => setProducts([]))
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">Wholesale Products</h1>
          <p className="text-sm sm:text-base text-gray-600">Products offered to approved B2B buyers with wholesale pricing and MOQ.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/vendor/products/add-product?channel=b2b&from=wholesale")}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold">
          <FiPlus /> Add Wholesale Product
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
        <div className="relative mb-5">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search wholesale products..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
        ) : products.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <FiBriefcase className="mx-auto text-3xl text-gray-300" />
            <p className="text-sm text-gray-500">No wholesale products yet.</p>
            <p className="text-xs text-gray-400">
              Add a new wholesale product, or enable wholesale on an existing product from Wholesale Pricing.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-3 pr-3">Product</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3 text-right">Retail Price</th>
                  <th className="py-3 px-3 text-right">Wholesale Price</th>
                  <th className="py-3 px-3 text-right">MOQ</th>
                  <th className="py-3 px-3 text-right">Stock</th>
                  <th className="py-3 pl-3" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product._id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <img
                          src={product.image || product.images?.[0] || "https://via.placeholder.com/48?text=P"}
                          alt={product.name}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100 bg-gray-50"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 truncate">{product.name}</p>
                          <p className="text-xs text-gray-500 truncate">{product.categoryId?.name || ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3"><ChannelBadge product={product} /></td>
                    <td className="py-3 px-3 text-right text-gray-600">
                      {product.b2cAvailable === false ? "—" : formatPrice(product.price)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-gray-800">{formatPrice(product.wholesale?.price)}</td>
                    <td className="py-3 px-3 text-right">{product.wholesale?.moq || 1}</td>
                    <td className="py-3 px-3 text-right">{product.stockQuantity ?? 0}</td>
                    <td className="py-3 pl-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => navigate(`/vendor/products/${product._id}?from=wholesale`)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 mr-3">
                        <FiEdit2 /> Product
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/vendor/wholesale/pricing?product=${product._id}`)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                        <FiEdit2 /> Pricing
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default WholesaleProducts;
