import { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiSliders, FiTrash2, FiCheckCircle, FiXCircle, FiTool, FiMapPin, FiClock, FiDollarSign, FiLayers } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorServiceStore } from '../../../../shared/store/vendorServiceStore';
import { getAllServiceCategories } from '../../../Admin/services/adminService';
import VendorServiceConfigModal from '../../components/Services/VendorServiceConfigModal';
import Pagination from '../../../Admin/components/Pagination';
import AnimatedSelect from '../../../Admin/components/AnimatedSelect';

const MyVendorServices = () => {
  const {
    myServices,
    isLoading,
    fetchMyServices,
    toggleStatus,
    disableService,
  } = useVendorServiceStore();

  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const [editingVs, setEditingVs] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  useEffect(() => {
    fetchMyServices();
    const loadCategories = async () => {
      try {
        const res = await getAllServiceCategories();
        const list = Array.isArray(res?.data?.categories)
          ? res.data.categories
          : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
          ? res
          : [];
        setCategories(list);
      } catch (err) {
        // Handled silently
      }
    };
    loadCategories();
  }, []);

  const filteredServices = useMemo(() => {
    return (myServices || []).filter((vs) => {
      const serviceMaster = vs.serviceId || {};
      const matchesSearch =
        !searchQuery ||
        (serviceMaster.name && serviceMaster.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (serviceMaster.description && serviceMaster.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const catId = typeof serviceMaster.categoryId === 'object' ? serviceMaster.categoryId?._id || serviceMaster.categoryId?.id : serviceMaster.categoryId;
      const matchesCategory = selectedCategory === 'all' || String(catId) === String(selectedCategory);

      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'active' && vs.isActive) ||
        (selectedStatus === 'inactive' && !vs.isActive);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [myServices, searchQuery, selectedCategory, selectedStatus]);

  const paginatedServices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredServices.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredServices, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredServices.length / itemsPerPage) || 1;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedStatus]);

  const handleToggleStatus = (vs) => {
    toggleStatus(vs.id || vs._id, vs.isActive);
  };

  const handleDisable = (id) => {
    if (window.confirm('Are you sure you want to disable and remove this service from your store?')) {
      disableService(id);
    }
  };

  const formatPriceDisplay = (vs) => {
    const pricingType = vs.serviceId?.pricingType;
    if (pricingType === 'CUSTOM_QUOTE') {
      return vs.price > 0 ? `₹${vs.price} (Inspection Fee)` : 'Custom Quotation';
    }
    if (pricingType === 'PER_UNIT') {
      return `₹${vs.price || 0} / Unit`;
    }
    if (pricingType === 'SIZE_BASED') {
      return vs.price > 0 ? `From ₹${vs.price}` : 'Size-based Pricing';
    }
    return `₹${vs.price || 0}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 p-4 sm:p-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 flex items-center gap-3">
          <FiTool className="text-primary-500" />
          My Store Services
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage services enabled for your store, configure custom prices, and service areas
        </p>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-2xl p-4 shadow-md border border-slate-700 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 text-lg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search enabled services..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-slate-200"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <AnimatedSelect
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={[
                { value: 'all', label: 'All Categories' },
                ...categories.map((c) => ({
                  value: String(c._id || c.id),
                  label: c.name,
                })),
              ]}
              className="w-full sm:w-48"
            />

            <AnimatedSelect
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active Only' },
                { value: 'inactive', label: 'Inactive Only' },
              ]}
              className="w-full sm:w-36"
            />
          </div>
        </div>
      </div>

      {/* My Services Grid */}
      {isLoading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent mb-3"></div>
          <p className="text-slate-400 text-sm">Loading your store services...</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="text-center py-16 px-4 bg-slate-800/60 rounded-2xl border border-slate-700">
          <FiTool className="mx-auto text-5xl text-slate-600 mb-3" />
          <h3 className="text-lg font-bold text-slate-300">You haven't enabled any services yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all'
              ? 'Try clearing your search or filters.'
              : 'Go to "Available Services" tab to enable fire safety services for your store.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedServices.map((vs) => {
              const serviceMaster = vs.serviceId || {};
              return (
                <div
                  key={vs.id || vs._id}
                  className="bg-slate-800 rounded-2xl border border-slate-700 p-5 flex flex-col justify-between hover:border-slate-600 transition-all shadow-md">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {serviceMaster.image ? (
                          <img
                            src={serviceMaster.image}
                            alt={serviceMaster.name}
                            className="w-12 h-12 object-cover rounded-xl border border-slate-700 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-primary-500/20 text-primary-400 rounded-xl flex items-center justify-center font-bold text-lg border border-primary-500/30 flex-shrink-0">
                            {(serviceMaster.name || 'S').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold text-white text-base line-clamp-1">
                            {serviceMaster.name || 'Service Master'}
                          </h3>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-400">
                            <FiLayers className="text-[10px]" />
                            {serviceMaster.categoryId?.name || 'Fire Safety'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleStatus(vs)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                          vs.isActive
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-slate-700 text-slate-400 border border-slate-600'
                        }`}
                        title="Click to toggle store availability">
                        {vs.isActive ? <FiCheckCircle /> : <FiXCircle />}
                        <span>{vs.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                      </button>
                    </div>

                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-700/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Store Rate:</span>
                        <span className="font-bold text-white text-sm">{formatPriceDisplay(vs)}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <FiMapPin className="text-slate-500" />
                          Areas:
                        </span>
                        <span className="text-slate-300 font-medium">
                          {vs.serviceAreas?.length ? `${vs.serviceAreas.length} pincodes` : 'All Areas'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <FiClock className="text-slate-500" />
                          Hours:
                        </span>
                        <span className="text-slate-300 font-medium">
                          {vs.workingHours?.start || '09:00'} - {vs.workingHours?.end || '18:00'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-700 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setEditingVs(vs)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition-colors text-xs font-semibold">
                      <FiSliders />
                      <span>Configure</span>
                    </button>

                    <button
                      onClick={() => handleDisable(vs.id || vs._id)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/30"
                      title="Disable Service">
                      <FiTrash2 className="text-base" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredServices.length > itemsPerPage && (
            <div className="p-4 border-t border-slate-700">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredServices.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}

      {editingVs && (
        <VendorServiceConfigModal
          vendorService={editingVs}
          onClose={() => setEditingVs(null)}
          onSave={() => {
            fetchMyServices();
            setEditingVs(null);
          }}
        />
      )}
    </motion.div>
  );
};

export default MyVendorServices;
