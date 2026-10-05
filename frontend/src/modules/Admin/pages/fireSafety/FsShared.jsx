import { useEffect, useState } from 'react';
import { FiX, FiSearch } from 'react-icons/fi';
import api from '../../../../shared/utils/api';

export const inputClass =
  'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
export const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold';
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold';

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
      {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 ${className}`}>{children}</div>
);

export const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-gray-700 mb-1">{label}</span>
    {children}
  </label>
);

export const Modal = ({ title, onClose, children, wide = false }) => (
  <div className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-4 overflow-y-auto">
    <div className="fixed inset-0 bg-black/50" onClick={onClose} />
    <div className={`relative bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-8`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"><FiX /></button>
      </div>
      <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

export const EmptyRow = ({ loading, colSpan, text = 'Nothing here yet.' }) => (
  <tr><td colSpan={colSpan} className="py-10 text-center text-sm text-gray-500">{loading ? 'Loading…' : text}</td></tr>
);

/** Searches existing customers (User accounts). */
export const CustomerPicker = ({ value, onChange }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (value) return undefined;
    const handle = setTimeout(() => {
      api.get('/admin/fire-safety/customers', { params: { search } })
        .then((d) => setResults(d?.customers || []))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [search, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="text-sm min-w-0">
          <p className="font-semibold text-gray-800 truncate">{value.name}</p>
          <p className="text-xs text-gray-500 truncate">{value.email}{value.phone ? ` · ${value.phone}` : ''}</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-primary-600">Change</button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer by name, email or phone" className={`${inputClass} pl-9`} />
      </div>
      <ul className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
        {results.map((c) => (
          <li key={c._id}>
            <button type="button" onClick={() => onChange(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50">
              <p className="text-sm font-semibold text-gray-800">{c.name}</p>
              <p className="text-xs text-gray-500">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">No customers found.</li>}
      </ul>
    </div>
  );
};

const RECOMMENDATION_SOURCES = {
  service: { url: '/admin/services', key: 'services', label: (s) => s.name },
  product: { url: '/admin/products', key: 'products', label: (p) => `${p.name}${p.price != null ? ` — ₹${p.price}` : ''}` },
  vendor: { url: '/admin/vendors', key: 'vendors', label: (v) => v.storeName || v.name, params: { status: 'approved' } },
};

/** Picks an existing Service / Product / Vendor using existing admin list APIs. */
export const RecommendationTargetPicker = ({ kind, onPick }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const source = RECOMMENDATION_SOURCES[kind];

  useEffect(() => {
    const handle = setTimeout(() => {
      api.get(source.url, { params: { ...(source.params || {}), ...(search ? { search } : {}), limit: 20 } })
        .then((d) => setResults(Array.isArray(d) ? d : d?.[source.key] || d?.items || []))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [search, kind, source]);

  return (
    <div className="space-y-2">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${kind}s…`} className={inputClass} />
      <ul className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
        {results.map((r) => (
          <li key={r._id || r.id}>
            <button type="button" onClick={() => onPick({ _id: r._id || r.id, label: source.label(r) })} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
              {source.label(r)}
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">No results.</li>}
      </ul>
    </div>
  );
};
