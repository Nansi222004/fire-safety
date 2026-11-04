import React from "react";
import { Link } from "react-router-dom";
import {
  FiFacebook,
  FiInstagram,
  FiTwitter,
  FiArrowRight,
} from "react-icons/fi";
import { FaApple, FaGooglePlay } from "react-icons/fa";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
// Light variant of the logo (white lettering) for the dark footer.
import footerLogo from "../../../../assets/logo-firesafety-light.png";

const DesktopFooter = () => {
  const { settings } = useSettingsStore();
  const general = settings?.general || {};
  const appLinks = general.appLinks || {};
  const hasAppLinks = appLinks.googlePlay || appLinks.appStore;

  return (
    <footer className="hidden lg:block bg-slate-900 text-slate-300 border-t border-slate-800 pt-16 pb-8 w-full mt-auto">
      <div className="max-w-[1440px] mx-auto px-8 lg:px-16 xl:px-20 grid grid-cols-2 lg:grid-cols-12 gap-x-8 gap-y-10">
        {/* Brand Column */}
        <div className="col-span-2 lg:col-span-3 space-y-6">
          <Link to="/" className="inline-flex items-center">
            <img
              src={footerLogo}
              alt={general.storeName || "Fire Safety Shop"}
              className="h-12 w-auto object-contain"
            />
          </Link>
          <p className="text-sm text-slate-400 font-medium leading-relaxed">
            {general.storeDescription || "Safety Today, Secure Tomorrow — Your trusted online store for fire protection and safety products."}
          </p>
          {(general.contactEmail || general.contactPhone || general.address) && (
            <div className="text-xs space-y-1.5 text-slate-400 font-medium pt-1">
              {general.contactEmail && (
                <p className="break-all">Email: <a href={`mailto:${general.contactEmail}`} className="hover:text-white transition-colors">{general.contactEmail}</a></p>
              )}
              {general.contactPhone && (
                <p>Phone: <a href={`tel:${general.contactPhone}`} className="hover:text-white transition-colors">{general.contactPhone}</a></p>
              )}
              {general.address && (
                <p>Address: <span className="text-slate-400">{general.address}</span></p>
              )}
            </div>
          )}
          <div className="flex gap-4">
            {[
              { icon: FiFacebook, link: general.socialMedia?.facebook || "#" },
              { icon: FiInstagram, link: general.socialMedia?.instagram || "#" },
              { icon: FiTwitter, link: general.socialMedia?.twitter || "#" },
            ].map((social, idx) => (
              <a
                key={idx}
                href={social.link}
                target={social.link !== "#" ? "_blank" : undefined}
                rel={social.link !== "#" ? "noopener noreferrer" : undefined}
                className="w-10 h-10 rounded-full border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-white transition-all duration-300"
              >
                <social.icon className="text-lg" />
              </a>
            ))}
          </div>
        </div>

        {/* Categories Column */}
        <div className="lg:col-span-2 space-y-6">
          <h4 className="text-sm font-bold uppercase text-white tracking-widest">
            Fire Protection Categories
          </h4>
          <ul className="space-y-3 text-sm font-medium">
            {[
              { name: "ABC Extinguishers", path: "/categories" },
              { name: "CO₂ Extinguishers", path: "/categories" },
              { name: "Foam Extinguishers", path: "/categories" },
              { name: "Fire Blankets & Equipment", path: "/categories" },
              { name: "Safety Accessories", path: "/categories" },
            ].map((link, idx) => (
              <li key={idx}>
                <Link
                  to={link.path}
                  className="hover:text-white hover:underline transition-all"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Support Column */}
        <div className="lg:col-span-2 space-y-6">
          <h4 className="text-sm font-bold uppercase text-white tracking-widest">
            Support & Partner Care
          </h4>
          <ul className="space-y-3 text-sm font-medium">
            {[
              { name: "24x7 Customer Care", path: "/customer-care" },
              { name: "Vendor & Merchant Support", path: "/vendor/support" },
              { name: "Delivery Partner Support", path: "/delivery/support" },
              { name: "Help Center", path: "/policy/faq" },
              { name: "Returns & Refund Policy", path: "/policy/refund-policy" },
            ].map((link, idx) => (
              <li key={idx}>
                <Link
                  to={link.path}
                  className="hover:text-white hover:underline transition-all"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal Column */}
        <div className="lg:col-span-2 space-y-6">
          <h4 className="text-sm font-bold uppercase text-white tracking-widest">
            Legal
          </h4>
          <ul className="space-y-3 text-sm font-medium">
            {[
              { name: "Privacy Policy", path: "/policy/privacy-policy" },
              { name: "Terms & Conditions", path: "/policy/terms-conditions" },
              { name: "Seller Terms & Conditions", path: "/policy/seller-terms" },
            ].map((link, idx) => (
              <li key={idx}>
                <Link
                  to={link.path}
                  className="hover:text-white hover:underline transition-all"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Newsletter + App Downloads Column */}
        <div className="col-span-2 lg:col-span-3 space-y-8">
          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase text-white tracking-widest">
              Join Our Newsletter
            </h4>
            <p className="text-sm text-slate-400 font-medium">
              Subscribe to get notifications about new releases, special sales,
              and vendor events.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Your email address"
                aria-label="Email address"
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white transition-all"
              />
              <button
                type="button"
                aria-label="Subscribe"
                className="flex-shrink-0 px-4 py-2.5 bg-[#E31E24] hover:bg-[#C8191E] text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center"
              >
                <FiArrowRight />
              </button>
            </div>
          </div>

          {hasAppLinks && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase text-white tracking-widest">
              Get the App
            </h4>
            <div className="flex flex-wrap gap-3">
              {appLinks.googlePlay && (
                <a
                  href={appLinks.googlePlay}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Get it on Google Play"
                  className="flex items-center gap-3 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-white hover:border-white transition-colors"
                >
                  <FaGooglePlay className="text-xl" />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[10px] text-slate-300">GET IT ON</span>
                    <span className="text-sm font-semibold">Google Play</span>
                  </span>
                </a>
              )}
              {appLinks.appStore && (
                <a
                  href={appLinks.appStore}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Download on the App Store"
                  className="flex items-center gap-3 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-white hover:border-white transition-colors"
                >
                  <FaApple className="text-2xl" />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[10px] text-slate-300">Download on the</span>
                    <span className="text-sm font-semibold">App Store</span>
                  </span>
                </a>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="max-w-[1440px] mx-auto px-8 lg:px-16 xl:px-20 mt-16 pt-8 border-t border-slate-800 flex flex-col lg:flex-row items-center justify-between gap-6">
        <p className="text-xs text-slate-500 font-semibold text-center lg:text-left">
          © {new Date().getFullYear()} Fire Safety Shop Marketplace. All rights
          reserved. Developed with ❤️.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-slate-500 font-bold uppercase tracking-wider">
          <Link to="/policy/privacy-policy" className="hover:text-white transition-colors">
            Privacy Policy
          </Link>
          <Link to="/policy/terms-conditions" className="hover:text-white transition-colors">
            Terms & Conditions
          </Link>
          <Link to="/policy/refund-policy" className="hover:text-white transition-colors">
            Refund Policy
          </Link>
          <Link to="/policy/seller-terms" className="hover:text-white transition-colors">
            Seller Terms & Conditions
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default DesktopFooter;
