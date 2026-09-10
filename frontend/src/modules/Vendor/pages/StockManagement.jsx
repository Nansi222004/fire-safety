import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  FiSearch,
  FiAlertTriangle,
  FiEdit,
  FiPackage,
  FiPlus,
  FiMinus,
  FiTrendingDown,
  FiX,
  FiCheckCircle,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import DataTable from "../../Admin/components/DataTable";
import ExportButton from "../../Admin/components/ExportButton";
import Badge from "../../../shared/components/Badge";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import { formatPrice } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { useVendorProductStore } from "../store/vendorProductStore";
import toast from "react-hot-toast";

const StockManagement = () => {
  const { vendor } = useVendorAuthStore();
  const { products, isLoading, fetchProducts, patchStock } = useVendorProductStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [alertThreshold, setAlertThreshold] = useState(10);
  const [stockModal, setStockModal] = useState({
    isOpen: false,
    product: null,
  });

  const vendorId = vendor?.id;

  useEffect(() => {
    if (vendorId) {
      fetchProducts({ fetchAll: true, limit: 200 });
    }
  }, [vendorId, fetchProducts]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Stock filter (use backend-computed status for consistency)
    if (stockFilter !== "all") {
      filtered = filtered.filter(
        (product) => String(product.stock || "") === stockFilter
      );
    }

    return filtered;
  }, [products, searchQuery, stockFilter]);

  // Stock statistics
  const stockStats = useMemo(() => {
    const totalProducts = products.length;
    const inStock = products.filter((p) => p.stock === "in_stock").length;
    const lowStock = products.filter((p) => p.stock === "low_stock").length;
    const outOfStock = products.filter((p) => p.stock === "out_of_stock").length;
    const totalValue = products.reduce(
      (sum, p) => sum + p.price * (p.stockQuantity || 0),
      0
    );

    return { totalProducts, inStock, lowStock, outOfStock, totalValue };
  }, [products]);

  const handleStockUpdate = async (productId, newQuantity) => {
    const success = await patchStock(productId, newQuantity);
    if (success) {
      setStockModal({ isOpen: false, product: null });
    }
  };

  // Table columns
  const columns = [
    {
      key: "_id",
      label: "ID",
      sortable: true,
      render: (value, row) => String(value ?? row.id ?? "").slice(-8).toUpperCase(),
    },
    {
      key: "name",
      label: "Product Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <img
            src={row.image || row.images?.[0]}
            alt={value}
            className="w-10 h-10 object-cover rounded-lg"
            onError={(e) => {
              e.target.src = "https://via.placeholder.com/50x50?text=Product";
            }}
          />
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: "price",
      label: "Price",
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: "stockQuantity",
      label: "Current Stock",
      sortable: true,
      render: (value) => (
        <span className="font-semibold">{value?.toLocaleString() || 0}</span>
      ),
    },
    {
      key: "stock",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "in_stock"
              ? "success"
              : value === "low_stock"
                ? "warning"
                : "error"
          }>
          {value?.replace("_", " ").toUpperCase() || "N/A"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => setStockModal({ isOpen: true, product: row })}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          <FiEdit />
        </button>
      ),
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to manage stock</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6 pb-6 px-1 sm:px-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        <div className="lg:hidden">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-0.5 sm:mb-2">
            Stock Management
          </h1>
          <p className="text-xs sm:text-base text-gray-500">
            Manage your product inventory and stock levels
          </p>
        </div>
      </div>

      {/* Stock Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white rounded-2xl sm:rounded-xl p-3 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-[10px] sm:text-sm text-gray-500 font-bold uppercase tracking-wider">Total Products</p>
            <div className="p-1 sm:p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <FiPackage className="text-sm sm:text-lg" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-gray-900 font-mono">
            {stockStats.totalProducts}
          </p>
        </div>

        <div className="bg-white rounded-2xl sm:rounded-xl p-3 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-[10px] sm:text-sm text-emerald-700 font-bold uppercase tracking-wider">In Stock</p>
            <div className="p-1 sm:p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <FiCheckCircle className="text-sm sm:text-lg" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-emerald-600 font-mono">
            {stockStats.inStock}
          </p>
        </div>

        <div className="bg-white rounded-2xl sm:rounded-xl p-3 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-[10px] sm:text-sm text-amber-700 font-bold uppercase tracking-wider">Low Stock</p>
            <div className="p-1 sm:p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <FiAlertTriangle className="text-sm sm:text-lg" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-amber-600 font-mono">
            {stockStats.lowStock}
          </p>
        </div>

        <div className="bg-white rounded-2xl sm:rounded-xl p-3 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-[10px] sm:text-sm text-rose-700 font-bold uppercase tracking-wider">Out of Stock</p>
            <div className="p-1 sm:p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <FiTrendingDown className="text-sm sm:text-lg" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-rose-600 font-mono">
            {stockStats.outOfStock}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 shadow-xs sm:shadow-sm border border-gray-100 sm:border-slate-200/80">
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4 mb-4 sm:mb-6">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-4">
            <AnimatedSelect
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              options={[
                { value: "all", label: "All Stock" },
                { value: "in_stock", label: "In Stock" },
                { value: "low_stock", label: "Low Stock" },
                { value: "out_of_stock", label: "Out of Stock" },
              ]}
              className="w-full sm:w-auto min-w-[130px] sm:min-w-[160px]"
            />
            <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-gray-50 sm:bg-transparent px-2.5 py-1.5 sm:p-0 rounded-xl sm:rounded-none border border-gray-200 sm:border-0">
              <label className="text-xs sm:text-sm text-gray-600 font-medium whitespace-nowrap">
                Alert:
              </label>
              <input
                type="number"
                value={alertThreshold}
                onChange={(e) =>
                  setAlertThreshold(parseInt(e.target.value, 10) || 10)
                }
                min="1"
                className="w-14 sm:w-20 px-2 py-1 sm:py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm text-center font-bold"
              />
            </div>
          </div>
          <div className="w-full sm:w-auto pt-1 sm:pt-0">
            <ExportButton
              data={filteredProducts}
              headers={[
                { label: "ID", accessor: (row) => String(row._id ?? row.id ?? "") },
                { label: "Name", accessor: (row) => row.name },
                { label: "Price", accessor: (row) => formatPrice(row.price) },
                { label: "Stock", accessor: (row) => row.stockQuantity || 0 },
                { label: "Status", accessor: (row) => row.stock || "N/A" },
              ]}
              filename="vendor-stock"
            />
          </div>
        </div>

        {/* Mobile Inventory Cards */}
        <div className="sm:hidden space-y-3">
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">Loading products...</p>
            </div>
          ) : filteredProducts.length > 0 ? (
            filteredProducts.map((product) => {
              const stockStatus = product.stock || "in_stock";
              const statusStyles = {
                in_stock: "bg-emerald-50 text-emerald-700 border-emerald-200",
                low_stock: "bg-amber-50 text-amber-700 border-amber-200",
                out_of_stock: "bg-rose-50 text-rose-700 border-rose-200",
              };

              return (
                <div
                  key={product._id ?? product.id}
                  className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={product.image || product.images?.[0]}
                      alt={product.name}
                      className="w-12 h-12 object-cover rounded-xl border border-gray-100 flex-shrink-0"
                      onError={(e) => {
                        e.target.src = "https://via.placeholder.com/50x50?text=Product";
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-gray-900 text-sm truncate">
                          {product.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex-shrink-0 ${
                            statusStyles[stockStatus] || statusStyles.in_stock
                          }`}>
                          {stockStatus.replace("_", " ")}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-gray-400 mt-0.5">
                        ID: #{String(product._id ?? product.id ?? "").slice(-8).toUpperCase()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-gray-50/70 p-2.5 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Price</span>
                      <span className="font-black text-gray-900 font-mono text-xs">
                        {formatPrice(product.price)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Current Stock</span>
                      <span className="font-black text-primary-600 font-mono text-xs">
                        {product.stockQuantity?.toLocaleString() || 0} units
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setStockModal({ isOpen: true, product })}
                    className="w-full py-2 bg-slate-50 hover:bg-primary-50 hover:text-primary-600 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-98">
                    <FiEdit className="text-xs" />
                    <span>Update Stock Level</span>
                  </button>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No products found</p>
            </div>
          )}
        </div>

        {/* Desktop DataTable - 100% Unchanged */}
        <div className="hidden sm:block">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading products...</p>
            </div>
          ) : filteredProducts.length > 0 ? (
            <DataTable
              data={filteredProducts}
              columns={columns}
              pagination={true}
              itemsPerPage={10}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No products found</p>
            </div>
          )}
        </div>
      </div>

      {/* Stock Update Modal */}
      <StockUpdateModal
        isOpen={stockModal.isOpen}
        product={stockModal.product}
        alertThreshold={alertThreshold}
        onClose={() => setStockModal({ isOpen: false, product: null })}
        onUpdate={(newQuantity) => {
          if (stockModal.product) {
            handleStockUpdate(stockModal.product._id ?? stockModal.product.id, newQuantity);
          }
        }}
      />
    </motion.div>
  );
};

// Stock Update Modal Component
const StockUpdateModal = ({
  isOpen,
  product,
  alertThreshold,
  onClose,
  onUpdate,
}) => {
  const [stockQuantity, setStockQuantity] = useState(0);
  const [stockAdjustment, setStockAdjustment] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("set");

  useEffect(() => {
    if (product) {
      setStockQuantity(product.stockQuantity || 0);
      setStockAdjustment("");
      setAdjustmentType("set");
    }
  }, [product]);

  if (!product || !isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    let newQuantity = stockQuantity;
    const adjustment = Math.max(0, parseInt(stockAdjustment, 10) || 0);

    if (adjustmentType === "set") {
      newQuantity = stockQuantity;
    } else if (adjustmentType === "add") {
      newQuantity = (product.stockQuantity || 0) + adjustment;
    } else if (adjustmentType === "subtract") {
      newQuantity = Math.max(0, (product.stockQuantity || 0) - adjustment);
    }

    if (newQuantity < 0) {
      toast.error("Stock quantity cannot be negative");
      return;
    }

    onUpdate(newQuantity);
  };

  const quickAdjust = (amount) => {
    const newQuantity = Math.max(0, stockQuantity + amount);
    setStockQuantity(newQuantity);
  };

  const effectiveThreshold = Number(
    product?.lowStockThreshold ?? alertThreshold ?? 10
  );

  const newStockStatus =
    stockQuantity === 0
      ? "out_of_stock"
      : stockQuantity <= effectiveThreshold
        ? "low_stock"
        : "in_stock";

  const modalJSX = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100000]"
          />
          <div className="fixed inset-0 z-[100001] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden my-auto border border-gray-100">
              <div className="p-4 sm:p-6 border-b border-gray-100 flex-shrink-0 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    Update Stock
                  </h2>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-800 transition-colors">
                    <FiX size={20} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <img
                    src={product.image || product.images?.[0] || "https://via.placeholder.com/100x100?text=Product"}
                    alt={product.name}
                    className="w-14 h-14 object-cover rounded-xl border border-gray-100 flex-shrink-0"
                    onError={(e) => {
                      e.target.src = "https://via.placeholder.com/100x100?text=Product";
                    }}
                  />
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 text-sm truncate">
                      {product.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Current Stock: <span className="font-bold text-primary-600">{product.stockQuantity || 0}</span> units
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Adjustment Type
                    </label>
                    <AnimatedSelect
                      value={adjustmentType}
                      onChange={(e) => setAdjustmentType(e.target.value)}
                      options={[
                        { value: "set", label: "Set Quantity" },
                        { value: "add", label: "Add Stock" },
                        { value: "subtract", label: "Subtract Stock" },
                      ]}
                    />
                  </div>

                  {adjustmentType === "set" ? (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        New Stock Quantity
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => quickAdjust(-10)}
                          className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs active:scale-95 transition-all">
                          <FiMinus />
                        </button>
                        <input
                          type="number"
                          value={stockQuantity}
                          onChange={(e) =>
                            setStockQuantity(
                              Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          min="0"
                          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-center font-mono font-bold text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => quickAdjust(10)}
                          className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs active:scale-95 transition-all">
                          <FiPlus />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        {adjustmentType === "add" ? "Add" : "Subtract"} Quantity
                      </label>
                      <input
                        type="number"
                        value={stockAdjustment}
                        onChange={(e) => setStockAdjustment(e.target.value)}
                        min="0"
                        placeholder="Enter quantity"
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono font-bold"
                      />
                    </div>
                  )}

                  <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-700">
                        New Status Preview
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Threshold: {effectiveThreshold} units
                      </p>
                    </div>
                    <Badge
                      variant={
                        newStockStatus === "in_stock"
                          ? "success"
                          : newStockStatus === "low_stock"
                            ? "warning"
                            : "error"
                      }>
                      {newStockStatus.replace("_", " ").toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 p-4 sm:p-5 border-t border-gray-100 bg-gray-50/70 sm:bg-white flex-shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 bg-white sm:bg-transparent border border-gray-200 sm:border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 text-xs sm:text-sm font-bold transition-all text-center">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md shadow-primary-500/20 text-center active:scale-98">
                    Update Stock
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== "undefined" ? createPortal(modalJSX, document.body) : null;
};

export default StockManagement;
