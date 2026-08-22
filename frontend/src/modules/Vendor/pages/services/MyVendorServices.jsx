import { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiSliders, FiTrash2, FiCheckCircle, FiXCircle, FiTool, FiMapPin, FiClock, FiDollarSign, FiLayers } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorServiceStore } from '../../../../shared/store/vendorServiceStore';
import { getAllServiceCategories } from '../../../Admin/services/adminService';
import ServiceConfigModal from '../../components/ServiceConfigModal';
import Pagination from '../../../Admin/components/Pagination';
import AnimatedSelect from '../../../Admin/components/AnimatedSelect';
import toast from 'react-hot-toast';

const MyVendorServices = () => {
  const {
    myServices,
    isLoading,
    fetchMyServices,
    toggleStatus,
    disableService,
    updateServiceConfig,
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

  const handleSaveConfig = async (payload) => {
    if (!editingVs) return;
    const id = editingVs._id || editingVs.id;
    try {
      await updateServiceConfig(id, payload);
      fetchMyServices();
      setEditingVs(null);
      toast.success('Service configuration updated successfully!');
    } catch (err) {
      console.error('Failed to update service config:', err);
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
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <FiTool className="text-[#E31E24]" />
          My Store Services
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage services enabled for your store, configure custom prices, service area pincodes, and daily capacity
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search enabled services..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E31E24] text-sm text-gray-800 placeholder-gray-400"
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
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#E31E24] border-t-transparent mb-3"></div>
          <p className="text-gray-500 text-sm">Loading your store services...</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <FiTool className="mx-auto text-5xl text-gray-300 mb-3" />
          <h3 className="text-lg font-bold text-gray-800">You haven't enabled any services yet</h3>
          <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
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
                  className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col justify-between hover:border-red-300 hover:shadow-md transition-all">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {serviceMaster.image ? (
                          <img
                            src={serviceMaster.image}
                            alt={serviceMaster.name}
                            className="w-12 h-12 object-cover rounded-xl border border-gray-200 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-red-50 text-[#E31E24] rounded-xl flex items-center justify-center font-bold text-lg border border-red-100 flex-shrink-0">
                            <FiTool />
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold text-gray-900 text-base line-clamp-1">
                            {serviceMaster.name || 'Service Master'}
                          </h3>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E31E24]">
                            <FiLayers className="text-[10px]" />
                            {serviceMaster.categoryId?.name || 'Fire Safety'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleStatus(vs)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                          vs.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                        title="Click to toggle store availability">
                        {vs.isActive ? <FiCheckCircle /> : <FiXCircle />}
                        <span>{vs.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                      </button>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Store Rate:</span>
                        <span className="font-bold text-gray-900 text-sm">{formatPriceDisplay(vs)}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <FiMapPin className="text-gray-400" />
                          Areas:
                        </span>
                        <span className="text-gray-700 font-medium truncate max-w-[140px]">
                          {vs.serviceAreas?.length ? vs.serviceAreas.join(', ') : 'No areas added'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <FiClock className="text-gray-400" />
                          Hours / Limit:
                        </span>
                        <span className="text-gray-700 font-medium">
                          {vs.workingHours?.start || '09:00'} - {vs.workingHours?.end || '18:00'} ({vs.dailyCapacity || 10}/day)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setEditingVs(vs)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition-colors text-xs font-semibold">
                      <FiSliders />
                      <span>Edit Configuration</span>
                    </button>

                    <button
                      onClick={() => handleDisable(vs.id || vs._id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-200"
                      title="Disable Service">
                      <FiTrash2 className="text-base" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredServices.length > itemsPerPage && (
            <div className="p-4 border-t border-gray-200">
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
        <ServiceConfigModal
          isOpen={!!editingVs}
          onClose={() => setEditingVs(null)}
          vendorService={editingVs}
          serviceMaster={editingVs.serviceId}
          onSave={handleSaveConfig}
        />
      )}
    </motion.div>
  );
};

export default MyVendorServices;

