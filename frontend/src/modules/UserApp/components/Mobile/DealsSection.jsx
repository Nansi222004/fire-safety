import React from 'react';
import { Link } from 'react-router-dom';
import heroBanner1 from '../../../../assets/banners/hero_slide_1.png';
import heroBanner2 from '../../../../assets/banners/hero_slide_2.png';

const getButtonStyleClasses = (style = "primary") => {
  const base = "inline-flex items-center justify-center gap-1 font-bold py-1.5 px-3.5 rounded-xl transition-all duration-300 shadow-sm cursor-pointer select-none text-[10px] active:scale-95 mt-2 self-start whitespace-nowrap";
  switch (style) {
    case "secondary":
      return `${base} bg-slate-800 hover:bg-slate-700 text-white hover:scale-[1.02]`;
    case "outline":
      return `${base} bg-transparent border border-red-500 text-red-400 hover:bg-red-500/10 hover:scale-[1.02]`;
    case "primary":
    default:
      return `${base} bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-sm shadow-red-600/30 hover:scale-[1.02]`;
  }
};

const DealsSection = ({ items }) => {
  const defaultDeals = [
    { 
      brand: 'Demo Safety Equipment', 
      offer: 'Up To 25% OFF', 
      image: heroBanner1, 
      link: '/shop?category=abc-fire-extinguishers',
      altText: 'ABC Fire Extinguishers'
    },
    { 
      brand: 'FireShield Pro', 
      offer: 'Up To 30% OFF', 
      image: heroBanner2, 
      link: '/shop?category=co2-fire-extinguishers',
      altText: 'CO2 Extinguishers'
    },
    { 
      brand: 'FlameSafe Tech', 
      offer: 'Flat 20% OFF', 
      image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=400&q=80', 
      link: '/shop?category=smoke-fire-alarms',
      altText: 'Smoke & Fire Alarms'
    },
    { 
      brand: 'Safeguard Armor', 
      offer: 'Up To 40% OFF', 
      image: heroBanner1, 
      link: '/shop?category=fire-blankets-equipment',
      altText: 'Fire Blankets & PPE'
    },
    { 
      brand: 'HydraFlow Safety', 
      offer: 'Up To 15% OFF', 
      image: heroBanner2, 
      link: '/shop?category=fire-hoses-hose-reels',
      altText: 'Hose Reels & Hydrants'
    },
    { 
      brand: 'LuminoExit', 
      offer: 'Flat 10% OFF', 
      image: 'https://images.unsplash.com/photo-1599481238640-4c1288750d7a?auto=format&fit=crop&w=400&q=80', 
      link: '/shop?category=emergency-exit-signs',
      altText: 'Emergency Exit Signs'
    },
  ];

  const deals = items && items.length > 0 ? items : defaultDeals;

  const handleDealClick = (deal, e) => {
    const target = String(deal.link || "/search").trim();
    if (deal.openInNewTab || /^https?:\/\//i.test(target)) {
      e.preventDefault();
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="py-7 bg-gradient-to-br from-slate-900 via-slate-900 to-red-950/40 border border-slate-800/90 shadow-xl my-5 rounded-3xl p-4 md:p-8 relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute -top-12 -left-12 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="px-2 mb-6 flex justify-between items-center max-w-[1440px] mx-auto w-full relative z-10">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full bg-red-600/20 text-red-500 flex items-center justify-center text-sm font-bold border border-red-500/30">
            🔥
          </span>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight text-left">
              Trending Safety Deals
            </h2>
            <p className="text-[10px] md:text-xs text-slate-400 font-medium text-left">
              Certified protection gear at promotional rates
            </p>
          </div>
        </div>
        <Link 
          to="/offers" 
          className="text-xs md:text-sm text-red-400 font-extrabold uppercase tracking-wider hover:text-red-300 transition-colors flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-full"
        >
          <span>View All</span>
          <span>&rarr;</span>
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-2 max-w-[1440px] mx-auto w-full relative z-10">
        {deals.map((deal, index) => (
          <Link
            key={index}
            to={deal.link || "/search"}
            onClick={(e) => handleDealClick(deal, e)}
            className="min-w-[160px] w-[160px] md:min-w-[230px] md:w-[230px] flex-shrink-0 flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-md hover:shadow-2xl hover:border-red-500/60 hover:-translate-y-1 transition-all duration-300 group"
          >
            <div className="w-full h-36 md:h-44 overflow-hidden bg-slate-950/60 relative select-none">
              <picture className="w-full h-full object-cover">
                {deal.mobileImage && <source media="(max-width: 640px)" srcSet={deal.mobileImage} />}
                <img 
                  src={deal.image || (index % 2 === 0 ? heroBanner1 : heroBanner2)} 
                  alt={deal.altText || deal.brand || "Safety Deal"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none select-none"
                  loading="lazy"
                  onError={(e) => {
                    e.target.src = index % 2 === 0 ? heroBanner1 : heroBanner2;
                  }}
                />
              </picture>
              <div className="absolute top-2 left-2 bg-red-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full shadow-sm">
                DEAL
              </div>
            </div>
            
            <div className="p-3 md:p-4 flex flex-col justify-between text-left flex-1 min-h-[95px] md:min-h-[120px]">
              <div>
                <p className="text-[9px] md:text-[10px] font-extrabold tracking-widest text-slate-400 uppercase">
                  Safety Equipment
                </p>
                <p className="text-xs md:text-sm font-bold text-white mt-0.5 leading-tight truncate group-hover:text-red-400 transition-colors">
                  {deal.brand}
                </p>
              </div>
              <div className="mt-2 flex flex-col justify-between flex-1">
                <p className="text-xs md:text-sm font-extrabold text-amber-400 leading-tight">
                  {deal.offer}
                </p>
                {deal.showButton !== false && (
                  <span className={getButtonStyleClasses(deal.buttonStyle)}>
                    {deal.buttonText || "Shop Deal"}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default DealsSection;
