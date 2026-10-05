import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FiArrowLeft, FiBriefcase, FiLock, FiSearch, FiTrash2 } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import api from "../../../shared/utils/api";
import { useAddressStore } from "../../../shared/store/addressStore";
import { useAuthStore } from "../../../shared/store/authStore";
import { formatPrice } from "../../../shared/utils/helpers";

// Wholesale / B2B storefront. Visibility, pricing, MOQ and the final amount are all
// enforced by the backend — this page only displays what the server returns.
const Wholesale = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { addresses, fetchAddresses } = useAddressStore();

  const [access, setAccess] = useState({ checked: false, allowed: false, businessName: null });
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState({});
  const [cart, setCart] = useState([]); // [{ product, quantity }]
  const [addressId, setAddressId] = useState("");
  const [isPlacing, setIsPlacing] = useState(false);

  useEffect(() => {
    api
      .get("/user/wholesale/access")
      .then((data) => setAccess({ checked: true, allowed: data?.wholesaleAccess === true, businessName: data?.businessName }))
      .catch(() => setAccess({ checked: true, allowed: false, businessName: null }));
  }, []);

  useEffect(() => {
    if (!access.allowed) {
      setIsLoading(false);
      return undefined;
    }
    const handle = setTimeout(() => {
      setIsLoading(true);
      api
        .get("/user/wholesale/products", { params: { search, limit: 60 } })
        .then((data) => setProducts(data?.products ?? []))
        .catch(() => setProducts([]))
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [access.allowed, search]);

  useEffect(() => {
    if (access.allowed) fetchAddresses().catch(() => {});
  }, [access.allowed, fetchAddresses]);

  useEffect(() => {
    if (!addressId && addresses.length) {
      const preferred = addresses.find((a) => a.isDefault) || addresses[0];
      setAddressId(preferred.id || preferred._id);
    }
  }, [addresses, addressId]);

  const getQty = (product) => quantities[product._id] ?? product.moq;

  const addToWholesaleCart = (product) => {
    const quantity = Number(getQty(product));
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

  const estimatedSubtotal = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.product.wholesalePrice || 0) * line.quantity, 0),
    [cart]
  );

  const placeOrder = async () => {
    const address = addresses.find((a) => (a.id || a._id) === addressId);
    if (!cart.length) return toast.error("Add at least one product.");
    if (!address) return toast.error("Please select a delivery address.");

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
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Failed to place wholesale order.");
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false}>
        <div className="w-full max-w-6xl mx-auto px-4 lg:px-0 py-6 pb-24 space-y-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="w-11 h-11 bg-white border border-gray-100 hover:bg-gray-50 rounded-2xl flex items-center justify-center text-slate-700 shadow-sm">
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
                Businesses can register as a SafeFire vendor and apply for Wholesale/B2B. Once approved, sign in here with the same credentials.
              </p>
              <Link to="/vendor/register" className="inline-block text-sm font-semibold text-[#E31E24] hover:underline">
                Register your business
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search wholesale products..."
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {isLoading ? (
                  <p className="text-sm text-slate-500">Loading wholesale catalog…</p>
                ) : products.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center">
                    No wholesale products available right now.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {products.map((product) => {
                      const outOfStock = product.stock === "out_of_stock" || Number(product.stockQuantity || 0) < product.moq;
                      return (
                        <div key={product._id} className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-4">
                          <img
                            src={product.image || "https://via.placeholder.com/96?text=Product"}
                            alt={product.name}
                            className="w-20 h-20 rounded-xl object-cover bg-slate-50 border border-slate-100 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <p className="font-bold text-slate-900 text-sm line-clamp-2">{product.name}</p>
                            <p className="text-xs text-slate-500 truncate">{product.vendor?.storeName}</p>
                            <div className="flex items-baseline gap-2">
                              <span className="text-base font-black text-sky-700">{formatPrice(product.wholesalePrice)}</span>
                              <span className="text-xs text-slate-500">/ {product.unit || "unit"}</span>
                              {product.retailPrice != null && (
                                <span className="text-xs text-slate-400 line-through">{formatPrice(product.retailPrice)}</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600">
                              MOQ <span className="font-bold">{product.moq}</span> · {product.stockQuantity} in stock
                            </p>
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                type="number"
                                min={product.moq}
                                step="1"
                                aria-label={`Quantity for ${product.name}`}
                                value={getQty(product)}
                                onChange={(e) => setQuantities((prev) => ({ ...prev, [product._id]: e.target.value }))}
                                className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                              />
                              <button
                                type="button"
                                disabled={outOfStock}
                                onClick={() => addToWholesaleCart(product)}
                                className="flex-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 text-white rounded-lg text-xs font-bold">
                                {outOfStock ? "Insufficient stock" : "Add to order"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <aside className="bg-white border border-slate-200 rounded-2xl p-5 h-fit space-y-4 lg:sticky lg:top-24">
                <h2 className="font-bold text-slate-900">Wholesale Order</h2>
                {cart.length === 0 ? (
                  <p className="text-sm text-slate-500">No items yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {cart.map((line) => (
                      <li key={line.product._id} className="flex items-start gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{line.product.name}</p>
                          <p className="text-xs text-slate-500">
                            {line.quantity} × {formatPrice(line.product.wholesalePrice)}
                          </p>
                        </div>
                        <span className="font-semibold text-slate-800">
                          {formatPrice(line.quantity * Number(line.product.wholesalePrice || 0))}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${line.product.name}`}
                          onClick={() => setCart((prev) => prev.filter((l) => l.product._id !== line.product._id))}
                          className="p-1 text-slate-400 hover:text-red-600">
                          <FiTrash2 />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="border-t border-slate-100 pt-3 flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal (estimate)</span>
                  <span className="font-bold text-slate-900">{formatPrice(estimatedSubtotal)}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tax and shipping are added at checkout. The final amount is calculated and validated by SafeFire.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Delivery address</label>
                  {addresses.length === 0 ? (
                    <Link to="/addresses" className="text-sm font-semibold text-[#E31E24] hover:underline">
                      Add a delivery address
                    </Link>
                  ) : (
                    <select
                      value={addressId}
                      onChange={(e) => setAddressId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                      {addresses.map((a) => (
                        <option key={a.id || a._id} value={a.id || a._id}>
                          {a.name ? `${a.name} — ` : ""}{a.address}, {a.city}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <p className="text-xs text-slate-600">Payment: <span className="font-semibold">Cash on Delivery</span></p>

                <button
                  type="button"
                  onClick={placeOrder}
                  disabled={isPlacing || cart.length === 0 || !addressId}
                  className="w-full py-3 bg-[#E31E24] hover:bg-[#C8191F] disabled:opacity-50 text-white rounded-xl text-sm font-bold">
                  {isPlacing ? "Placing order…" : "Place Wholesale Order"}
                </button>
              </aside>
            </div>
          )}
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default Wholesale;
