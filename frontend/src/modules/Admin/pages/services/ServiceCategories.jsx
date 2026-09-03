import { useState, useEffect, useMemo } from 'react';
import { FiPlus, FiSearch, FiTrash2, FiEdit, FiCheckCircle, FiXCircle, FiLayers } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useServiceCategoryStore } from '../../../../shared/store/serviceCategoryStore';
import ServiceCategoryForm from '../../components/Services/ServiceCategoryForm';
import Pagination from '../../components/Pagination';
import AnimatedSelect from '../../components/AnimatedSelect';

const ServiceCategories = () => {
  const {
    categories,
    isLoading,
    total,
    page,
    pages,
    fetchCategories,
    toggleStatus,
    deleteCategory,
  } = useServiceCategoryStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchCategories();
  }, []);

  const filteredCategories = useMemo(() => {
    return (categories || []).filter((category) => {
      const matchesSearch =
        !searchQuery ||
        category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (category.description &&
          category.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'active' && category.isActive) ||
        (selectedStatus === 'inactive' && !category.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [categories, searchQuery, selectedStatus]);

  const paginatedCategories = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCategories.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCategories, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage) || 1;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStatus]);

  const handleCreate = () => {
    setEditingCategory(null);
    setShowForm(true);
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setShowForm(true);
  };

  const handleToggleStatus = (category) => {
    toggleStatus(category.id || category._id, category.isActive);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this service category?')) {
      deleteCategory(id);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingCategory(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
            <FiLayers className="text-primary-600" />
            Service Categories
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Manage service categories for the fire safety services module
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2.5 gradient-green text-white rounded-xl hover:shadow-glow-green transition-all font-semibold text-sm shadow-md"
        >
          <FiPlus className="text-lg" />
          <span>Add Service Category</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search service categories by name or description..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'active', label: 'Active Only' },
              { value: 'inactive', label: 'Inactive Only' },
            ]}
            className="w-full sm:w-48"
          />
        </div>
      </div>

      {/* Category List Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent mb-3"></div>
            <p className="text-gray-500 text-sm">Loading service categories...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="text-center py-16 px-4">
            <FiLayers className="mx-auto text-5xl text-gray-300 mb-3" />
            <h3 className="text-lg font-bold text-gray-700">No service categories found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              {searchQuery || selectedStatus !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'Click "Add Service Category" above to create your first category.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Slug</th>
                    <th className="px-6 py-4">Sort Order</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Created Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {paginatedCategories.map((category) => (
                    <tr key={category.id || category._id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {category.image ? (
                            <img
                              src={category.image}
                              alt={category.name}
                              className="w-11 h-11 object-cover rounded-xl border border-gray-200 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center font-bold text-base border border-primary-100 flex-shrink-0">
                              {category.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-gray-800">{category.name}</p>
                            {category.description && (
                              <p className="text-xs text-gray-500 line-clamp-1 max-w-xs">{category.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-gray-600 font-mono text-xs">
                        {category.slug}
                      </td>

                      <td className="px-6 py-4 font-semibold text-gray-700">
                        {category.sortOrder !== undefined ? category.sortOrder : (category.order || 0)}
                      </td>

                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleStatus(category)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                            category.isActive
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                          }`}
                          title="Click to toggle status"
                        >
                          {category.isActive ? (
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

                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {formatDate(category.createdAt)}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(category)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Category"
                          >
                            <FiEdit className="text-base" />
                          </button>
                          <button
                            onClick={() => handleDelete(category.id || category._id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Category"
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

            {filteredCategories.length > itemsPerPage && (
              <div className="p-4 border-t border-gray-200">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredCategories.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <ServiceCategoryForm
          category={editingCategory}
          onClose={handleFormClose}
          onSave={() => {
            fetchCategories();
            handleFormClose();
          }}
        />
      )}
    </motion.div>
  );
};

export default ServiceCategories;
