import { Link, useNavigate } from "react-router-dom";
import { FaWhatsapp } from "react-icons/fa";
import {
  FiArrowLeft,
  FiChevronRight,
  FiClock,
  FiFileText,
  FiHeadphones,
  FiHelpCircle,
  FiMail,
  FiPackage,
  FiPhoneCall,
  FiRotateCcw,
  FiTool,
  FiAlertTriangle,
} from "react-icons/fi";
import PageTransition from "../../../shared/components/PageTransition";
import MobileLayout from "../components/Layout/MobileLayout";
import useCustomerCare from "../../../shared/hooks/useCustomerCare";

const QUICK_HELP = [
  { label: "Track my orders", description: "Order status and delivery updates", icon: FiPackage, path: "/orders" },
  { label: "Returns & refunds", description: "Return window and refund timelines", icon: FiRotateCcw, path: "/policy/refund-policy" },
  { label: "My service bookings", description: "Installation and maintenance visits", icon: FiTool, path: "/my-service-bookings" },
  { label: "Help center / FAQ", description: "Answers to common questions", icon: FiHelpCircle, path: "/policy/faq" },
];

const ContactCard = ({ href, external, icon: Icon, iconClass, title, detail, action }) => (
  <a
    href={href}
    target={external ? "_blank" : undefined}
    rel={external ? "noopener noreferrer" : undefined}
    className="group flex items-center gap-4 bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-red-200 transition-all"
  >
    <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl ${iconClass}`}>
      <Icon />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-bold text-gray-900">{title}</span>
      <span className="block text-sm text-gray-500 truncate">{detail}</span>
    </span>
    <span className="hidden sm:inline text-sm font-bold text-[#E31E24] group-hover:underline">{action}</span>
    <FiChevronRight className="sm:hidden text-gray-400" />
  </a>
);

const CustomerCare = () => {
  const navigate = useNavigate();
  const { phone, email, hours, phoneHref, whatsappHref, emailHref } = useCustomerCare();

  return (
    <PageTransition>
      <MobileLayout showCartBar={false}>
        <div className="min-h-screen bg-gray-50 pb-24 lg:pb-12">
          {/* Phone app bar */}
          <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-30 px-4 py-3 flex items-center gap-3 shadow-sm">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiArrowLeft className="text-xl" />
            </button>
            <h1 className="text-lg font-bold text-gray-800">Customer Care</h1>
          </div>

          <div className="max-w-4xl mx-auto px-4 lg:px-6 pt-4 lg:pt-10 space-y-6">
            {/* Hero */}
            <div className="rounded-2xl bg-gradient-to-br from-[#E31E24] to-[#B3151A] text-white p-5 sm:p-8 flex items-center gap-4 sm:gap-6">
              <span className="hidden sm:flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 text-3xl">
                <FiHeadphones />
              </span>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-3xl font-bold">24x7 Customer Care</h2>
                <p className="text-sm sm:text-base text-white/85 mt-1">
                  Questions about an order, a product or a service visit? We're here to help.
                </p>
                <p className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-white/15 text-xs sm:text-sm font-semibold">
                  <FiClock /> {hours}
                </p>
              </div>
            </div>

            {/* Contact options */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Contact us</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {phoneHref && (
                  <ContactCard
                    href={phoneHref}
                    icon={FiPhoneCall}
                    iconClass="bg-red-50 text-[#E31E24]"
                    title="Call us"
                    detail={phone}
                    action="Call now"
                  />
                )}
                {whatsappHref && (
                  <ContactCard
                    href={whatsappHref}
                    external
                    icon={FaWhatsapp}
                    iconClass="bg-green-50 text-[#25D366]"
                    title="Chat on WhatsApp"
                    detail="Quick replies on chat"
                    action="Start chat"
                  />
                )}
                {emailHref && (
                  <ContactCard
                    href={emailHref}
                    icon={FiMail}
                    iconClass="bg-blue-50 text-blue-600"
                    title="Email us"
                    detail={email}
                    action="Send email"
                  />
                )}
                <Link
                  to="/support"
                  className="group flex items-center gap-4 bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-red-200 transition-all"
                >
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl bg-amber-50 text-amber-600">
                    <FiFileText />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-gray-900">Raise a ticket</span>
                    <span className="block text-sm text-gray-500 truncate">Track your request and replies</span>
                  </span>
                  <span className="hidden sm:inline text-sm font-bold text-[#E31E24] group-hover:underline">Open</span>
                  <FiChevronRight className="sm:hidden text-gray-400" />
                </Link>
              </div>
            </section>

            {/* Quick help */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Quick help</h3>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 md:grid md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-gray-100 overflow-hidden">
                {QUICK_HELP.map(({ label, description, icon: Icon, path }) => (
                  <Link
                    key={path}
                    to={path}
                    className="flex items-center gap-3 bg-white px-4 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <Icon className="text-xl text-gray-500 flex-shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-800">{label}</span>
                      <span className="block text-xs text-gray-500 truncate">{description}</span>
                    </span>
                    <FiChevronRight className="text-gray-400" />
                  </Link>
                ))}
              </div>
            </section>

            {/* Emergency note */}
            <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <FiAlertTriangle className="text-lg flex-shrink-0 mt-0.5" />
              <p>
                <span className="font-bold">In a fire emergency</span>, leave the building and call the fire service
                on <a href="tel:101" className="font-bold underline">101</a> or{" "}
                <a href="tel:112" className="font-bold underline">112</a>. Customer care cannot dispatch emergency help.
              </p>
            </div>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default CustomerCare;
