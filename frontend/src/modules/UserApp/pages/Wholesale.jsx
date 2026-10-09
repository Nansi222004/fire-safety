import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { FiArrowLeft, FiBriefcase, FiLock, FiSearch, FiTrash2, FiX, FiInfo } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import api from "../../../shared/utils/api";
import { useAddressStore } from "../../../shared/store/addressStore";
import { useAuthStore } from "../../../shared/store/authStore";
import { formatPrice } from "../../../shared/utils/helpers";

// Wholesale / B2B storefront. Eligibility, visibility, pricing, MOQ, stock and the final amount are all
// enforced by the backend — this page only displays and submits what the server returns.

const PAGE_SIZE = 24;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name" },
];

// Wholesale cart is remembered per account (refresh-safe; never shared between accounts).
const cartKey = (userId) => (userId ? `safefire_wholesale_cart:${userId}` : null);
const loadCart = (userId) => {
  try {
    const raw = cartKey(userId) && localStorage.getItem(cartKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l?.product?._id && Number.isInteger(l.quantity)) : [];
  } catch {
    return [];
  }
};

const ProductDetail = ({ productId, onClose, onAdd }) => {
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [qty, setQty] = useState("");
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    api.get(`/user/wholesale/products/${productId}`)
      .then((data) => {
        setProduct(data);
        setQty(String(data?.moq || 1));
      })
      .catch((err) => setError(err?.message || "Product not available."));
  }, [productId]);

  const images = product?.images?.length ? product.images : product?.image ? [product.image] : [];

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-600">
          <FiX />
        </button>
        {error ? (
          <p className="p-8 text-sm text-slate-600">{error}</p>
        ) : !product ? (
          <p className="p-8 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-5 p-5">
            <div className="space-y-2">
              <img src={images[activeImage] || "https://via.placeholder.com/400?text=Product"} alt={product.name} className="w-full aspect-square object-cover rounded-2xl bg-slate-50 border border-slate-100" />
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {images.map((src, idx) => (
                    <button type="button" key={src} onClick={() => setActiveImage(idx)} className={`w-14 h-14 rounded-lg overflow-hidden border-2 flex-shrink-0 ${idx === activeImage ? "border-sky-500" : "border-transparent"}`}>
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <p className="text-xs text-slate-500">{product.vendor?.storeName}{product.categoryId?.name ? ` · ${product.categoryId.name}` : ""}</p>
              <h2 className="text-lg font-black text-slate-900">{product.name}</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-sky-700">{formatPrice(product.wholesalePrice)}</span>
                <span className="text-xs text-slate-500">/ {product.unit || "unit"} · wholesale</span>
              </div>
              {product.retailPrice != null && <p className="text-xs text-slate-400">Retail price {formatPrice(product.retailPrice)}</p>}
              <p className="text-sm text-slate-700">Minimum order quantity: <span className="font-bold">{product.moq}</span></p>
              <p className={`text-sm font-semibold ${product.stockQuantity >= product.moq ? "text-emerald-700" : "text-red-600"}`}>
                {product.stockQuantity >= product.moq ? `${product.stockQuantity} in stock` : "Insufficient stock for the minimum order"}
              </p>
              {product.description && <p className="text-sm text-slate-600 whitespace-pre-line">{product.description}</p>}
              <div className="flex items-center gap-2 pt-2">
                <input type="number" min={product.moq} step="1" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                <button
                  type="button"
                  disabled={product.stockQuantity < product.moq}
                  onClick={() => onAdd(product, Number(qty))}
                  className="flex-1 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 text-white rounded-xl text-sm font-bold">
                  Add to wholesale order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Wholesale = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const userId = user?.id || user?._id;
  const { addresses, fetchAddresses } = useAddressStore();

  const [access, setAccess] = useState({ checked: false, allowed: false, businessName: null });
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1, categories: [], ownProductsHidden: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [quantities, setQuantities] = useState({});
  const [cart, setCart] = useState(() => loadCart(userId));
  const [cartCheck, setCartCheck] = useState(null);
  const [addressId, setAddressId] = useState("");
  const [isPlacing, setIsPlacing] = useState(false);

  // Catalog state lives in the URL so refresh / back keep the same search, category and sort.
  const search = searchParams.get("q") || "";
  const categoryId = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "newest";
  const detailId = searchParams.get("product") || "";
  const [searchInput, setSearchInput] = useState(search);
  const setParam = useCallback((key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    api.get("/user/wholesale/access")
      .then((data) => setAccess({ checked: true, allowed: data?.wholesaleAccess === true, businessName: data?.businessName }))
      .catch(() => setAccess({ checked: true, allowed: false, businessName: null }));
  }, [userId]);

  // Debounced search → URL
  useEffect(() => {
    const handle = setTimeout(() => { if (searchInput !== search) setParam("q", searchInput.trim()); }, 350);
    return () => clearTimeout(handle);
  }, [searchInput, search, setParam]);

  const fetchPage = useCallback(async (page) => {
    const data = await api.get("/user/wholesale/products", {
      params: { search, page, limit: PAGE_SIZE, sort, ...(categoryId ? { categoryId } : {}) },
    });
    return data || {};
  }, [search, categoryId, sort]);

  useEffect(() => {
    if (!access.allowed) {
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    fetchPage(1)
      .then((data) => {
        if (!active) return;
        setProducts(data.products || []);
        setMeta({ total: data.total || 0, page: data.page || 1, pages: data.pages || 1, categories: data.categories || [], ownProductsHidden: data.ownProductsHidden || 0 });
      })
      .catch(() => active && setProducts([]))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [access.allowed, fetchPage]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const data = await fetchPage(meta.page + 1);
      setProducts((prev) => [...prev, ...(data.products || [])]);
      setMeta((prev) => ({ ...prev, page: data.page || prev.page + 1, pages: data.pages || prev.pages }));
    } catch {
      // toast shown by API client
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (access.allowed) fetchAddresses().catch(() => {});
  }, [access.allowed, fetchAddresses]);

  useEffect(() => {
    if (!addressId && addresses.length) {
      const preferred = addresses.find((a) => a.isDefault) || addresses[0];
      setAddressId(preferred.id || preferred._id);
    }
  }, [addresses, addressId]);

  // Reload the per-account cart if the account changes; persist on every change.
  const loadedFor = useRef(userId);
  useEffect(() => {
    if (loadedFor.current !== userId) {
      loadedFor.current = userId;
      setCart(loadCart(userId));
    }
  }, [userId]);
  useEffect(() => {
    const key = cartKey(userId);
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(cart)); } catch { /* storage unavailable */ }
  }, [cart, userId]);

  // Server is authoritative for price, MOQ, stock and eligibility of every cart line.
  useEffect(() => {
    if (!access.allowed || cart.length === 0) {
      setCartCheck(null);
      return undefined;
    }
    const handle = setTimeout(() => {
      api.post("/user/wholesale/cart/validate", { items: cart.map((l) => ({ productId: l.product._id, quantity: l.quantity })) })
        .then(setCartCheck)
        .catch(() => setCartCheck(null));
    }, 250);
    return () => clearTimeout(handle);
  }, [cart, access.allowed]);
  const lineCheck = useMemo(() => Object.fromEntries((cartCheck?.lines || []).map((l) => [l.productId, l])), [cartCheck]);

  const getQty = (product) => quantities[product._id] ?? product.moq;

  const addToWholesaleCart = (product, rawQty) => {
    const quantity = Number(rawQty);
    if (!Number.isInteger(quantity) || quantity < product.moq) {
      toast.error(`Minimum order quantity for ${product.name} is ${product.moq}.`);
      return;
    }
    if (quantity > Number(product.stockQuantity || 0)) {
      toast.error(`Only ${product.stockQuantity} units available.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((line) => line.product._id === product._id);
      if (existing) return prev.map((line) => (line.product._id === product._id ? { ...line, quantity } : line));
      return [...prev, { product, quantity }];
    });
    toast.success(`${product.name} added to wholesale order.`);
  };

  const placeOrder = async () => {
    const address = addresses.find((a) => (a.id || a._id) === addressId);
    if (!cart.length) return toast.error("Add at least one product.");
    if (!address) return toast.error("Please select a delivery address.");
    if (cartCheck && !cartCheck.valid) return toast.error("Please fix the highlighted items in your wholesale order.");

    setIsPlacing(true);
    try {
      const data = await api.post("/user/payment/initialize", {
        orderType: "b2b",
        paymentMethod: "cod",
        items: cart.map((line) => ({ productId: line.product._id, quantity: line.quantity })),
        shippingAddress: {
          name: String(address.fullName || address.name || user?.name || "").trim(),
          email: String(user?.email || "").trim().toLowerCase(),
          phone: String(address.phone || "").replace(/\D/g, "").slice(-10),
          address: String(address.address || "").trim(),
          city: String(address.city || "").trim(),
          state: String(address.state || "").trim(),
          zipCode: String(address.zipCode || "").trim(),
          country: String(address.country || "India").trim(),
        },
        shippingOption: "standard",
      });
      const payload = data?.data ?? data;
      setCart([]);
      toast.success(`Wholesale order placed. Total ${formatPrice(payload.total)}.`, { id: "wholesale-order-placed" });
      navigate(`/order-confirmation/${payload.orderId}`, { state: { orderPlaced: true } });
    } catch {
      // API client shows the error toast
    } finally {
      setIsPlacing(false);
    }
  };

  const serverSubtotal = cartCheck?.subtotal;

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false}>
        <div className="w-full max-w-6xl mx-auto px-4 lg:px-0 py-6 pb-24 space-y-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 bg-white border border-gray-100 hover:bg-gray-50 rounded-2xl flex items-center justify-center text-slate-700 shadow-sm">
              <FiArrowLeft />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <FiBriefcase className="text-sky-600" /> Wholesale / B2B
              </h1>
              {access.businessName && <p className="text-sm text-slate-500">Buying as {access.businessName}</p>}
            </div>
          </div>

          {!access.checked ? (
            <p className="text-sm text-slate-500">Checking wholesale access…</p>
          ) : !access.allowed ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
              <FiLock className="mx-auto text-3xl text-slate-300" />
              <h2 className="font-bold text-slate-800">Wholesale access is for approved B2B accounts</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Approved wholesale vendors can shop here by signing in on SafeFire with the same email and password as their vendor account.
              </p>
              <Link to="/vendor/register" className="inline-block text-sm font-semibold text-[#E31E24] hover:underline">Register your business</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search wholesale products..." className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                  <select value={sort} onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)} aria-label="Sort" className="px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm">
                    {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {meta.categories.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <button type="button" onClick={() => setParam("category", "")} className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${!categoryId ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-200"}`}>All</button>
                    {meta.categories.map((c) => (
                      <button type="button" key={c._id} onClick={() => setParam("category", c._id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${categoryId === c._id ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-200"}`}>{c.name}</button>
                    ))}
                  </div>
                )}

                {meta.ownProductsHidden > 0 && (
                  <p className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <FiInfo className="flex-shrink-0 mt-0.5 text-sky-600" />
                    {meta.ownProductsHidden} of your own wholesale product{meta.ownProductsHidden > 1 ? "s are" : " is"} hidden here — you can't place a wholesale order with your own store. Other buyers see {meta.ownProductsHidden > 1 ? "them" : "it"}.
                  </p>
                )}

                {isLoading ? (
                  <p className="text-sm text-slate-500">Loading wholesale catalog…</p>
                ) : products.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center">
                    {search || categoryId ? "No wholesale products match your filters." : "No wholesale products from other sellers are available right now."}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">{meta.total} product{meta.total === 1 ? "" : "s"}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {products.map((product) => {
                        const outOfStock = product.stock === "out_of_stock" || Number(product.stockQuantity || 0) < product.moq;
                        return (
                          <div key={product._id} className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-4">
                            <button type="button" onClick={() => setParam("product", product._id)} className="flex-shrink-0" aria-label={`View ${product.name}`}>
                              <img src={product.image || "https://via.placeholder.com/96?text=Product"} alt={product.name} className="w-20 h-20 rounded-xl object-cover bg-slate-50 border border-slate-100" />
                            </button>
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <button type="button" onClick={() => setParam("product", product._id)} className="text-left font-bold text-slate-900 text-sm line-clamp-2 hover:text-sky-700">{product.name}</button>
                              <p className="text-xs text-slate-500 truncate">{product.vendor?.storeName}</p>
                              <div className="flex items-baseline gap-2">
                                <span className="text-base font-black text-sky-700">{formatPrice(product.wholesalePrice)}</span>
                                <span className="text-xs text-slate-500">/ {product.unit || "unit"}</span>
                                {product.retailPrice != null && <span className="text-xs text-slate-400 line-through">{formatPrice(product.retailPrice)}</span>}
                              </div>
                              <p className="text-xs text-slate-600">MOQ <span className="font-bold">{product.moq}</span> · {product.stockQuantity} in stock</p>
                              <div className="flex items-center gap-2 pt-1">
                                <input type="number" min={product.moq} step="1" aria-label={`Quantity for ${product.name}`} value={getQty(product)} onChange={(e) => setQuantities((prev) => ({ ...prev, [product._id]: e.target.value }))} className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                                <button type="button" disabled={outOfStock} onClick={() => addToWholesaleCart(product, getQty(product))} className="flex-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 text-white rounded-lg text-xs font-bold">
                                  {outOfStock ? "Insufficient stock" : "Add to order"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {meta.page < meta.pages && (
                      <button type="button" onClick={loadMore} disabled={isLoadingMore} className="w-full py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 disabled:opacity-60">
                        {isLoadingMore ? "Loading…" : "Load more"}
                      </button>
                    )}
                  </>
                )}
              </div>

              <aside className="bg-white border border-slate-200 rounded-2xl p-5 h-fit space-y-4 lg:sticky lg:top-24">
                <h2 className="font-bold text-slate-900">Wholesale Order</h2>
                {cart.length === 0 ? (
                  <p className="text-sm text-slate-500">No items yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {cart.map((line) => {
                      const check = lineCheck[line.product._id];
                      return (
                        <li key={line.product._id} className="text-sm">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 truncate">{line.product.name}</p>
                              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                                <input
                                  type="number"
                                  min={line.product.moq}
                                  value={line.quantity}
                                  aria-label={`Quantity for ${line.product.name}`}
                                  onChange={(e) => {
                                    const q = parseInt(e.target.value, 10);
                                    setCart((prev) => prev.map((l) => (l.product._id === line.product._id ? { ...l, quantity: Number.isNaN(q) ? 0 : q } : l)));
                                  }}
                                  className="w-16 px-1.5 py-0.5 border border-slate-200 rounded"
                                />
                                × {formatPrice(check?.unitPrice ?? line.product.wholesalePrice)}
                              </div>
                            </div>
                            <span className="font-semibold text-slate-800">{formatPrice(check?.lineTotal ?? line.quantity * Number(line.product.wholesalePrice || 0))}</span>
                            <button type="button" aria-label={`Remove ${line.product.name}`} onClick={() => setCart((prev) => prev.filter((l) => l.product._id !== line.product._id))} className="p-1 text-slate-400 hover:text-red-600">
                              <FiTrash2 />
                            </button>
                          </div>
                          {check && !check.valid && <p className="text-[11px] text-red-600 mt-1">{check.error}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="border-t border-slate-100 pt-3 flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-bold text-slate-900">{formatPrice(serverSubtotal ?? 0)}</span>
                </div>
                <p className="text-[11px] text-slate-500">Prices, MOQ and stock are verified by SafeFire. Tax and shipping are added at checkout.</p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Delivery address</label>
                  {addresses.length === 0 ? (
                    <Link to="/addresses" className="text-sm font-semibold text-[#E31E24] hover:underline">Add a delivery address</Link>
                  ) : (
                    <select value={addressId} onChange={(e) => setAddressId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                      {addresses.map((a) => (
                        <option key={a.id || a._id} value={a.id || a._id}>{a.name ? `${a.name} — ` : ""}{a.address}, {a.city}</option>
                      ))}
                    </select>
                  )}
                </div>

                <p className="text-xs text-slate-600">Payment: <span className="font-semibold">Cash on Delivery</span></p>

                <button
                  type="button"
                  onClick={placeOrder}
                  disabled={isPlacing || cart.length === 0 || !addressId || (cartCheck && !cartCheck.valid)}
                  className="w-full py-3 bg-[#E31E24] hover:bg-[#C8191F] disabled:opacity-50 text-white rounded-xl text-sm font-bold">
                  {isPlacing ? "Placing order…" : "Place Wholesale Order"}
                </button>
              </aside>
            </div>
          )}
        </div>

        {access.allowed && detailId && (
          <ProductDetail
            key={detailId}
            productId={detailId}
            onClose={() => setParam("product", "")}
            onAdd={(product, q) => {
              addToWholesaleCart(product, q);
              if (Number.isInteger(q) && q >= product.moq && q <= product.stockQuantity) setParam("product", "");
            }}
          />
        )}
      </MobileLayout>
    </PageTransition>
  );
};

export default Wholesale;
