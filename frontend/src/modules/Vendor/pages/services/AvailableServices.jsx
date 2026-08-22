import { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiCheck, FiPlus, FiLayers, FiClock, FiDollarSign, FiCalendar, FiTool, FiSliders, FiHelpCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useVendorServiceStore } from '../../../../shared/store/vendorServiceStore';
import { getPublicServiceCategories } from '../../services/vendorService';
import ServiceConfigModal from '../../components/ServiceConfigModal';
import Pagination from '../../../Admin/components/Pagination';
import AnimatedSelect from '../../../Admin/components/AnimatedSelect';
import toast from 'react-hot-toast';

const AvailableServices = () => {
  const navigate = useNavigate();
  const {
    availableServices,
    isLoading,
    fetchAvailableServices,
    enableService,
    updateServiceConfig,
  } = useVendorServiceStore();

  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [enablingId, setEnablingId] = useState(null);
  const [activeConfigService, setActiveConfigService] = useState(null);
  const [activeVendorService, setActiveVendorService] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  useEffect(() => {
    fetchAvailableServices();
    const loadCategories = async () => {
      try {
        const res = await getPublicServiceCategories();
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
    return (availableServices || []).filter((service) => {
      const matchesSearch =
        !searchQuery ||
        service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (service.description && service.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (service.shortDescription && service.shortDescription.toLowerCase().includes(searchQuery.toLowerCase()));

      const catId = typeof service.categoryId === 'object' ? service.categoryId?._id || service.categoryId?.id : service.categoryId;
      const matchesCategory = selectedCategory === 'all' || String(catId) === String(selectedCategory);

      return matchesSearch && matchesCategory;
    });
  }, [availableServices, searchQuery, selectedCategory]);

  const paginatedServices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredServices.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredServices, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredServices.length / itemsPerPage) || 1;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  const handleOpenEnableConfig = (service) => {
    setActiveConfigService(service);
    setActiveVendorService(null);
  };

  const handleSaveConfig = async (payload) => {
    if (!activeConfigService) return;

    setEnablingId(activeConfigService._id || activeConfigService.id);
    try {
      // 1. Enable service for vendor
      const res = await enableService(activeConfigService._id || activeConfigService.id);
      const vsDoc = res?.data || res;
      const vsId = vsDoc?._id || vsDoc?.id;

      if (vsId) {
        // 2. Update config with price, serviceAreas, dailyCapacity, workingHours
        await updateServiceConfig(vsId, payload);
      }
      fetchAvailableServices();
      toast.success('Service enabled and configured successfully!');
    } catch (err) {
      console.error('Failed to enable service:', err);
    } finally {
      setEnablingId(null);
      setActiveConfigService(null);
    }
  };

  const formatPricingType = (type) => {
    switch (type) {
      case 'FIXED': return 'Fixed Price';
      case 'PER_UNIT': return 'Per Unit Rate';
      case 'SIZE_BASED': return 'Size Based';
      case 'CUSTOM_QUOTE': return 'Custom Quote';
      default: return type || 'Fixed';
    }
  };

  const formatBookingType = (type) => {
    switch (type) {
      case 'INSTANT': return 'Instant Booking';
      case 'SCHEDULED': return 'Scheduled';
      case 'SITE_VISIT': return 'Site Visit First';
      case 'CUSTOM_QUOTE': return 'Quotation Flow';
      default: return type || 'Scheduled';
    }
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
          Available Fire Safety Services
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Select and enable certified fire safety services for your store. Set custom pricing, service pincodes, and capacity.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search available services by name, description..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E31E24] text-sm text-gray-800 placeholder-gray-400"
            />
          </div>

          <AnimatedSelect
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            options={[
              { value: 'all', label: 'All Service Categories' },
              ...categories.map((c) => ({
                value: String(c._id || c.id),
                label: c.name,
              })),
            ]}
            className="w-full sm:w-56"
          />
        </div>
      </div>

      {/* Grid Listing */}
      {isLoading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#E31E24] border-t-transparent mb-3"></div>
          <p className="text-gray-500 text-sm">Loading available services...</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <FiTool className="mx-auto text-5xl text-gray-300 mb-3" />
          <h3 className="text-lg font-bold text-gray-800">No services currently available</h3>
          <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
            {searchQuery || selectedCategory !== 'all'
              ? 'Try clearing your filters or search terms.'
              : 'You have enabled all available platform services, or no active services exist.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedServices.map((service) => (
              <div
                key={service.id || service._id}
                className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col justify-between hover:border-red-300 hover:shadow-md transition-all">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {service.image ? (
                        <img
                          src={service.image}
                          alt={service.name}
                          className="w-12 h-12 object-cover rounded-xl border border-gray-200 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-red-50 text-[#E31E24] rounded-xl flex items-center justify-center font-bold text-lg border border-red-100 flex-shrink-0">
                          <FiTool />
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-gray-900 text-base line-clamp-1">{service.name}</h3>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E31E24]">
                          <FiLayers className="text-[10px]" />
                          {service.categoryId?.name || 'Fire Safety'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {service.shortDescription && (
                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                      {service.shortDescription}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                    <span className="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-lg text-[11px] font-medium text-gray-700">
                      {formatPricingType(service.pricingType)}
                    </span>
                    <span className="px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-[11px] font-medium text-[#E31E24]">
                      {formatBookingType(service.bookingType)}
                    </span>
                    {service.estimatedDuration && (
                      <span className="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-lg text-[11px] text-gray-600 flex items-center gap-1">
                        <FiClock className="text-[10px]" />
                        {service.estimatedDuration}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">
                    {service.serviceFields?.length || 0} required fields
                  </span>
                  <button
                    onClick={() => handleOpenEnableConfig(service)}
                    disabled={enablingId === (service.id || service._id)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#E31E24] hover:bg-[#c6151b] text-white rounded-xl transition-all font-bold text-xs shadow-sm shadow-[#E31E24]/20 disabled:opacity-50">
                    {enablingId === (service.id || service._id) ? (
                      <span>Enabling...</span>
                    ) : (
                      <>
                        <FiPlus />
                        <span>Enable & Configure</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
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

      {/* Bottom CTA Card: Request New Service */}
      <div className="mt-8 bg-slate-900 text-white rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center justify-center text-red-400 text-lg">
            <FiHelpCircle />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm sm:text-base">Can't find the service you provide?</h3>
            <p className="text-xs text-slate-300">Submit a new fire safety service request for Admin review and catalog listing.</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/vendor/services/request-new')}
          className="px-4 py-2.5 bg-[#E31E24] hover:bg-[#c6151b] text-white font-bold rounded-xl text-xs transition-all shadow-sm shadow-[#E31E24]/20 whitespace-nowrap"
        >
          Request New Service
        </button>
      </div>

      {/* Modal Configuration */}
      {activeConfigService && (
        <ServiceConfigModal
          isOpen={!!activeConfigService}
          onClose={() => setActiveConfigService(null)}
          serviceMaster={activeConfigService}
          onSave={handleSaveConfig}
        />
      )}
    </motion.div>
  );
};

export default AvailableServices;

