import { useState, useEffect, useMemo } from 'react';
import { FiPlus, FiSearch, FiTrash2, FiEdit, FiCheckCircle, FiXCircle, FiTool, FiFilter, FiLayers } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useServiceStore } from '../../../../shared/store/serviceStore';
import { getAllServiceCategories } from '../../services/adminService';
import ServiceFormModal from '../../components/Services/ServiceFormModal';
import Pagination from '../../components/Pagination';
import AnimatedSelect from '../../components/AnimatedSelect';

const ServicesMaster = () => {
  const {
    services,
    isLoading,
    fetchServices,
    toggleStatus,
    deleteService,
  } = useServiceStore();

  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPricingType, setSelectedPricingType] = useState('all');

  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchServices();
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
    return (services || []).filter((service) => {
      const matchesSearch =
        !searchQuery ||
        service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (service.description && service.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (service.shortDescription && service.shortDescription.toLowerCase().includes(searchQuery.toLowerCase()));

      const catId = typeof service.categoryId === 'object' ? service.categoryId?._id || service.categoryId?.id : service.categoryId;
      const matchesCategory = selectedCategory === 'all' || String(catId) === String(selectedCategory);

      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'active' && service.isActive) ||
        (selectedStatus === 'inactive' && !service.isActive);

      const matchesPricing =
        selectedPricingType === 'all' || service.pricingType === selectedPricingType;

      return matchesSearch && matchesCategory && matchesStatus && matchesPricing;
    });
  }, [services, searchQuery, selectedCategory, selectedStatus, selectedPricingType]);

  const paginatedServices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredServices.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredServices, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredServices.length / itemsPerPage) || 1;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedStatus, selectedPricingType]);

  const handleCreate = () => {
    setEditingService(null);
    setShowModal(true);
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setShowModal(true);
  };

  const handleToggleStatus = (service) => {
    toggleStatus(service.id || service._id, service.isActive);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this fire safety service?')) {
      deleteService(id);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingService(null);
  };

  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Uncategorized';
    if (typeof categoryId === 'object' && categoryId.name) return categoryId.name;
    const found = categories.find((c) => String(c._id || c.id) === String(categoryId));
    return found ? found.name : 'Unknown Category';
  };

  const formatPricingType = (type) => {
    switch (type) {
      case 'FIXED': return 'Fixed Price';
      case 'PER_UNIT': return 'Per Unit';
      case 'SIZE_BASED': return 'Size Based';
      case 'CUSTOM_QUOTE': return 'Custom Quote';
      default: return type || 'Fixed';
    }
  };

  const formatBookingType = (type) => {
    switch (type) {
      case 'INSTANT': return 'Instant';
      case 'SCHEDULED': return 'Scheduled';
      case 'SITE_VISIT': return 'Site Visit';
      case 'CUSTOM_QUOTE': return 'Quotation';
      default: return type || 'Scheduled';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 p-4 sm:p-6"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center gap-3">
            <FiTool className="text-primary-600" />
            Fire Safety Services Master
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Create and manage platform services, pricing models, and dynamic customer booking fields
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2.5 gradient-green text-white rounded-xl hover:shadow-glow-green transition-all font-semibold text-sm shadow-md"
        >
          <FiPlus className="text-lg" />
          <span>Add Service</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search services by name, description..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
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
              className="w-full sm:w-44"
            />

            <AnimatedSelect
              value={selectedPricingType}
              onChange={(e) => setSelectedPricingType(e.target.value)}
              options={[
                { value: 'all', label: 'All Pricing Models' },
                { value: 'FIXED', label: 'Fixed Price' },
                { value: 'PER_UNIT', label: 'Per Unit' },
                { value: 'SIZE_BASED', label: 'Size Based' },
                { value: 'CUSTOM_QUOTE', label: 'Custom Quote' },
              ]}
              className="w-full sm:w-44"
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

      {/* Services Listing Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent mb-3"></div>
            <p className="text-gray-500 text-sm">Loading services master...</p>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="text-center py-16 px-4">
            <FiTool className="mx-auto text-5xl text-gray-300 mb-3" />
            <h3 className="text-lg font-bold text-gray-700">No services found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              {searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all'
                ? 'Try adjusting your filters or search terms.'
                : 'Click "Add Service" above to create your first fire safety service master.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Service</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Pricing Model</th>
                    <th className="px-6 py-4">Booking Type</th>
                    <th className="px-6 py-4">Custom Fields</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {paginatedServices.map((service) => (
                    <tr key={service.id || service._id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {service.image ? (
                            <img
                              src={service.image}
                              alt={service.name}
                              className="w-11 h-11 object-cover rounded-xl border border-gray-200 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold text-base border border-amber-100 flex-shrink-0">
                              {service.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-gray-800">{service.name}</p>
                            {service.shortDescription && (
                              <p className="text-xs text-gray-500 line-clamp-1 max-w-xs">{service.shortDescription}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-semibold border border-primary-100">
                          <FiLayers className="text-[11px]" />
                          {getCategoryName(service.categoryId)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">
                          {formatPricingType(service.pricingType)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100">
                          {formatBookingType(service.bookingType)}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-xs font-semibold text-gray-600">
                        {service.serviceFields?.length || 0} fields
                      </td>

                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleStatus(service)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                            service.isActive
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                          }`}
                          title="Click to toggle status"
                        >
                          {service.isActive ? (
                            <>
                              <FiCheckCircle className="text-emerald-600" />
                              <span>ACTIVE</span>
                            </>
                          ) : (
                            <>
                              <FiXCircle className="text-gray-400" />
                              <span>INACTIVE</span>
                            </>
                          )}
                        </button>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(service)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Service"
                          >
                            <FiEdit className="text-base" />
                          </button>
                          <button
                            onClick={() => handleDelete(service.id || service._id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Service"
                          >
                            <FiTrash2 className="text-base" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      </div>

      {showModal && (
        <ServiceFormModal
          service={editingService}
          onClose={handleModalClose}
          onSave={() => {
            fetchServices();
            handleModalClose();
          }}
        />
      )}
    </motion.div>
  );
};

export default ServicesMaster;
