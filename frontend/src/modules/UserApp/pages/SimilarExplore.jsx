import React, { useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { FiChevronLeft, FiSearch, FiFilter, FiHeart, FiStar } from "react-icons/fi";
import { getSimilarProducts, getProductById } from "../data/catalogData";
import { formatPrice } from "../../../shared/utils/helpers";
import PageTransition from "../../../shared/components/PageTransition";
import MobileLayout from "../components/Layout/MobileLayout";

const FlipkartCompactCard = ({ product }) => {
  const navigate = useNavigate();
  return (
    <div 
      onClick={() => navigate(`/product/${product.id}`)}
      className="bg-white rounded-xl border border-gray-100 overflow-hidden active:scale-95 transition-transform h-full"
    >
      <div className="relative aspect-square bg-gray-50 flex items-center justify-center">
        <button className="absolute top-2 right-2 p-1.5 bg-white/80 backdrop-blur-md rounded-full shadow-sm z-10">
          <FiHeart className="text-xs text-gray-400" />
        </button>
        <img src={product.image} className="w-full h-full object-cover" alt={product.name} />
      </div>
      
      <div className="p-2 space-y-1">
        <div className="inline-block bg-blue-50 text-blue-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
          BESTSELLER
        </div>
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase leading-none">{product.brandName || "Brand"}</div>
          <div className="text-[11px] font-bold text-gray-800 line-clamp-1 leading-tight">{product.name}</div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-black text-gray-900">{formatPrice(product.price)}</span>
          {product.originalPrice && (
            <>
              <span className="text-[9px] text-gray-400 line-through font-medium">{formatPrice(product.originalPrice)}</span>
              <span className="text-[9px] text-green-600 font-bold">
                {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% Off
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 pt-0.5">
          <div className="flex items-center gap-0.5">
            {[...Array(5)].map((_, i) => (
              <FiStar 
                key={i} 
                className={`text-[9px] ${i < Math.floor(product.rating || 4.5) ? 'text-gray-500 fill-gray-500' : 'text-gray-200'}`} 
              />
            ))}
          </div>
          <span className="text-[9px] text-gray-400 font-bold">({product.reviewCount || "47"})</span>
        </div>
      </div>
    </div>
  );
};

const SimilarExplore = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const pageTitle = searchParams.get("title") || "Similar Products";
  
  const currentProduct = useMemo(() => getProductById(id), [id]);
  const products = useMemo(() => getSimilarProducts(id, 20), [id]);

  return (
    <PageTransition>
      <MobileLayout hideFooter={true}>
        <div className="min-h-screen bg-white">
          {/* Sticky Header */}
          <div className="sticky top-0 z-50 bg-white border-b border-gray-100 flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate(-1)}
                className="p-1.5 rounded-full active:bg-gray-100 transition-colors"
              >
                <FiChevronLeft className="text-2xl text-slate-800" />
              </button>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-none">{pageTitle}</h1>
                <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-tight">
                  Based on {currentProduct?.name || "your selection"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FiSearch className="text-xl text-slate-600" />
              <FiFilter className="text-xl text-slate-600" />
            </div>
          </div>

          {/* Product Grid */}
          <div className="p-3 bg-gray-50/50 min-h-[calc(100vh-60px)]">
            <div className="grid grid-cols-2 gap-2 pb-20">
              {products.map((product) => (
                <FlipkartCompactCard key={product.id} product={product} />
              ))}
            </div>

            {products.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <FiSearch className="text-3xl text-gray-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">No Similar Items Found</h3>
                <p className="text-sm text-slate-500 max-w-[240px] mt-1">
                  Try hearting items you like to see better recommendations.
                </p>
              </div>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default SimilarExplore;
