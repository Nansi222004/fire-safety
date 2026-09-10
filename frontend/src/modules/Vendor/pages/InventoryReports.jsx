import { useEffect, useMemo, useState } from "react";
import {
  FiBarChart,
  FiAlertTriangle,
  FiPackage,
  FiTrendingUp,
  FiShoppingBag,
  FiSearch,
  FiFilter,
} from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../Admin/components/DataTable";
import ExportButton from "../../Admin/components/ExportButton";
import Badge from "../../../shared/components/Badge";
import { formatPrice } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { getVendorInventoryReport } from "../services/vendorService";

const InventoryReports = () => {
  const { vendor } = useVendorAuthStore();
  const [inventoryData, setInventoryData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [summary, setSummary] = useState({
    totalProducts: 0,
    totalStockValue: 0,
    totalUnitsSold: 0,
    lowStockItems: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const vendorId = vendor?.id || vendor?._id;

  useEffect(() => {
    if (!vendorId) {
      setInventoryData([]);
      setSummary({
        totalProducts: 0,
        totalStockValue: 0,
        totalUnitsSold: 0,
        lowStockItems: 0,
      });
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await getVendorInventoryReport({ lowStockOnly });
        const data = res?.data ?? res;
        setInventoryData(Array.isArray(data?.rows) ? data.rows : []);
        setSummary({
          totalProducts: data?.summary?.totalProducts ?? 0,
          totalStockValue: data?.summary?.totalStockValue ?? 0,
          totalUnitsSold: data?.summary?.totalUnitsSold ?? 0,
          lowStockItems: data?.summary?.lowStockItems ?? 0,
        });
      } catch {
        setInventoryData([]);
        setSummary({
          totalProducts: 0,
          totalStockValue: 0,
          totalUnitsSold: 0,
          lowStockItems: 0,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [vendorId, lowStockOnly]);

  // Client-side search filter
  const displayedData = useMemo(() => {
    if (!searchQuery.trim()) return inventoryData;
    const query = searchQuery.toLowerCase();
    return inventoryData.filter(
      (item) =>
        item.name?.toLowerCase().includes(query) ||
        String(item.id || "").toLowerCase().includes(query)
    );
  }, [inventoryData, searchQuery]);

  const totalProducts = useMemo(
    () => summary.totalProducts || inventoryData.length,
    [summary.totalProducts, inventoryData.length]
  );
  const totalStockValue = summary.totalStockValue || 0;
  const totalSold = summary.totalUnitsSold || 0;
  const lowStockCount = summary.lowStockItems || 0;

  const columns = [
    { key: "name", label: "Product", sortable: true },
    {
      key: "currentStock",
      label: "Current Stock",
      sortable: true,
      render: (value) => (
        <span className={value < 10 ? "text-red-600 font-semibold" : "text-gray-800"}>
          {value}
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: "stockValue",
      label: "Stock Value",
      sortable: true,
      render: (value) => formatPrice(value),
    },
    { key: "sold", label: "Units Sold", sortable: true },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view reports</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6 pb-6 px-1 sm:px-0"
    >
      {/* Header */}
      <div className="lg:hidden">
        <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-0.5 sm:mb-2 flex items-center gap-2">
          <FiBarChart className="text-primary-600" />
          Inventory Reports
        </h1>
        <p className="text-xs sm:text-base text-gray-500">
          View inventory analysis and stock reports
        </p>
      </div>

      {/* 4-Card Statistics Grid (2x2 on Mobile, 4 columns on Desktop) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white rounded-2xl sm:rounded-xl p-3 sm:p-6 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-[10px] sm:text-sm text-gray-500 font-bold uppercase tracking-wider">Total Products</p>
            <div className="p-1 sm:p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <FiPackage className="text-sm sm:text-lg" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-gray-900 font-mono">{totalProducts}</p>
        </div>

        <div className="bg-white rounded-2xl sm:rounded-xl p-3 sm:p-6 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-[10px] sm:text-sm text-emerald-700 font-bold uppercase tracking-wider">Stock Value</p>
            <div className="p-1 sm:p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <FiTrendingUp className="text-sm sm:text-lg" />
            </div>
          </div>
          <p className="text-base sm:text-2xl font-black text-emerald-600 font-mono truncate">
            {formatPrice(totalStockValue)}
          </p>
        </div>

        <div className="bg-white rounded-2xl sm:rounded-xl p-3 sm:p-6 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-[10px] sm:text-sm text-indigo-700 font-bold uppercase tracking-wider">Units Sold</p>
            <div className="p-1 sm:p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <FiShoppingBag className="text-sm sm:text-lg" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-indigo-600 font-mono">{totalSold}</p>
        </div>

        <div className="bg-white rounded-2xl sm:rounded-xl p-3 sm:p-6 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-[10px] sm:text-sm text-rose-700 font-bold uppercase tracking-wider">Low Stock</p>
            <div className="p-1 sm:p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <FiAlertTriangle className="text-sm sm:text-lg" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-rose-600 font-mono">{lowStockCount}</p>
        </div>
      </div>

      {/* Filter and Export Toolbar */}
      <div className="bg-white rounded-2xl sm:rounded-xl p-3.5 sm:p-4 shadow-xs sm:shadow-sm border border-gray-100 sm:border-gray-200 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 sm:items-center sm:justify-between">
          {/* Mobile Search */}
          <div className="relative flex-1 sm:hidden">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports..."
              className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLowStockOnly((prev) => !prev)}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                lowStockOnly
                  ? "bg-rose-50 text-rose-700 border border-rose-200 shadow-xs"
                  : "bg-gray-50 sm:bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
              }`}
            >
              <FiFilter className="text-xs" />
              <span>{lowStockOnly ? "Showing Low Stock" : "Low Stock Only"}</span>
            </button>

            <div className="flex-1 sm:flex-initial">
              <ExportButton
                data={displayedData}
                headers={[
                  { label: "Product", accessor: (row) => row.name },
                  { label: "Current Stock", accessor: (row) => row.currentStock },
                  { label: "Price", accessor: (row) => formatPrice(row.price) },
                  { label: "Stock Value", accessor: (row) => formatPrice(row.stockValue) },
                  { label: "Units Sold", accessor: (row) => row.sold },
                ]}
                filename="vendor-inventory-report"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Inventory Cards (Hidden on Desktop) */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-gray-100 text-center">
            <p className="text-gray-500 text-xs font-medium">Loading inventory report...</p>
          </div>
        ) : displayedData.length > 0 ? (
          displayedData.map((item) => {
            const isLow = item.currentStock <= (Number(item.lowStockThreshold) || 10);
            const isOut = item.currentStock === 0;

            return (
              <div
                key={item.id || item.name}
                className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-xs leading-snug line-clamp-2">
                      {item.name}
                    </h3>
                    {item.id && (
                      <p className="font-mono text-[10px] text-gray-400 mt-0.5">
                        ID: #{String(item.id).slice(-8).toUpperCase()}
                      </p>
                    )}
                  </div>
                  <Badge variant={isOut ? "error" : isLow ? "warning" : "success"}>
                    {isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-gray-50/80 p-2.5 rounded-xl text-xs">
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                      Price
                    </span>
                    <span className="font-black text-gray-900 font-mono text-xs">
                      {formatPrice(item.price)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                      Current Stock
                    </span>
                    <span
                      className={`font-black font-mono text-xs ${
                        isLow ? "text-rose-600" : "text-gray-900"
                      }`}
                    >
                      {item.currentStock?.toLocaleString() || 0} units
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                      Stock Value
                    </span>
                    <span className="font-black text-emerald-600 font-mono text-xs">
                      {formatPrice(item.stockValue)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                      Units Sold
                    </span>
                    <span className="font-black text-indigo-600 font-mono text-xs">
                      {item.sold?.toLocaleString() || 0} sold
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-gray-100 text-center">
            <p className="text-gray-500 text-xs font-medium">No inventory records found</p>
          </div>
        )}
      </div>

      {/* Desktop DataTable (100% Unchanged) */}
      <div className="hidden sm:block">
        {isLoading ? (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <p className="text-gray-500 text-center">Loading inventory report...</p>
          </div>
        ) : (
          <DataTable
            data={inventoryData}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
          />
        )}
      </div>
    </motion.div>
  );
};

export default InventoryReports;
