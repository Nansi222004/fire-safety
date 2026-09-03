import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  FiShield,
  FiAlertCircle,
  FiCheckCircle,
  FiXCircle,
  FiBookOpen,
  FiInfo,
  FiArrowRight,
} from "react-icons/fi";
import DesktopHeader from "../components/Layout/DesktopHeader";
import DesktopFooter from "../components/Layout/DesktopFooter";
import MobileHeader from "../components/Layout/MobileHeader";
import MobileBottomNav from "../components/Layout/MobileBottomNav";
import PageTransition from "../../../shared/components/PageTransition";

const SafetyCenter = () => {
  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <DesktopHeader />
        <MobileHeader />

        <main className="flex-1 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-16 py-8 w-full">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-red-700 via-red-600 to-slate-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl mb-10 relative overflow-hidden">
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider mb-4">
                <FiShield className="text-sm" />
                <span>Fire Safety Information & Guidance</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-4">
                Fire Safety Center
              </h1>
              <p className="text-red-100 text-sm sm:text-base leading-relaxed mb-6 font-medium">
                Learn how to operate fire extinguishers effectively, perform routine safety checks, and protect your home or workplace from fire hazards.
              </p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="#pass-technique"
                  className="px-6 py-3 bg-white text-red-600 font-bold rounded-xl text-xs sm:text-sm hover:bg-red-50 transition-all shadow-md"
                >
                  P.A.S.S. Operating Guide
                </a>
                <a
                  href="#extinguisher-types"
                  className="px-6 py-3 bg-red-800/80 text-white border border-red-400/40 font-bold rounded-xl text-xs sm:text-sm hover:bg-red-800 transition-all"
                >
                  Extinguisher Selection Guide
                </a>
              </div>
            </div>
          </div>

          {/* Section 1: P.A.S.S. Operating Technique */}
          <div id="pass-technique" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center font-black">
                <FiBookOpen className="text-xl" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                  How to Use a Fire Extinguisher (P.A.S.S. Technique)
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  Remember this 4-step technique whenever operating a fire extinguisher in an emergency.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  step: "P",
                  title: "PULL the Pin",
                  description:
                    "Pull the safety pin located at the top of the extinguisher to break the tamper seal.",
                },
                {
                  step: "A",
                  title: "AIM at the Base",
                  description:
                    "Stand back at a safe distance (6-8 feet) and aim the nozzle low at the base of the fire.",
                },
                {
                  step: "S",
                  title: "SQUEEZE the Lever",
                  description:
                    "Squeeze the operating lever slowly and evenly to discharge the extinguishing agent.",
                },
                {
                  step: "S",
                  title: "SWEEP Side-to-Side",
                  description:
                    "Sweep the nozzle from side to side across the base of the fire until flames are extinguished.",
                },
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  whileHover={{ y: -4 }}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative"
                >
                  <span className="text-4xl font-black text-red-600/20 absolute top-4 right-4">
                    {item.step}
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-lg mb-4 border border-red-100">
                    {idx + 1}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    {item.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Section 2: Extinguisher Type Selection Guide */}
          <div id="extinguisher-types" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black">
                <FiShield className="text-xl" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                  Extinguisher Selection Guide
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  Understand which fire extinguisher type matches specific fire classes.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px] tracking-wider">
                      <th className="p-4">Type</th>
                      <th className="p-4">Fire Class</th>
                      <th className="p-4">Suitable For</th>
                      <th className="p-4">Do NOT Use On</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    <tr>
                      <td className="p-4 font-bold text-red-600">ABC Dry Powder</td>
                      <td className="p-4">Class A, B, C</td>
                      <td className="p-4">Wood, paper, flammable liquids, electrical risks</td>
                      <td className="p-4">Deep fat cooking fires (Class F)</td>
                    </tr>
                    <tr className="bg-slate-50/50">
                      <td className="p-4 font-bold text-slate-900">CO₂ (Carbon Dioxide)</td>
                      <td className="p-4">Class B & Electrical</td>
                      <td className="p-4">Electrical panels, server rooms, flammable liquids</td>
                      <td className="p-4">Paper/wood fires in open air</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-bold text-orange-600">AFFF Foam</td>
                      <td className="p-4">Class A & B</td>
                      <td className="p-4">Petrol, oils, paints, wood, textiles</td>
                      <td className="p-4">Live electrical equipment</td>
                    </tr>
                    <tr className="bg-slate-50/50">
                      <td className="p-4 font-bold text-blue-600">Water-Based</td>
                      <td className="p-4">Class A</td>
                      <td className="p-4">Combustibles: paper, wood, cloth, trash</td>
                      <td className="p-4">Electrical or liquid fires</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 3: Do's & Don'ts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* Do's */}
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-3xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <FiCheckCircle className="text-2xl text-emerald-600" />
                <h3 className="text-lg font-extrabold text-slate-900">
                  Fire Safety Do's
                </h3>
              </div>
              <ul className="space-y-3 text-xs sm:text-sm text-slate-700 font-medium">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">•</span>
                  Install smoke detectors on every level of your home or office.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">•</span>
                  Inspect pressure gauges monthly to ensure indicators remain in the green zone.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">•</span>
                  Keep fire extinguishers mounted in clear, easily accessible locations.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">•</span>
                  Know emergency escape routes and establish a designated family assembly point.
                </li>
              </ul>
            </div>

            {/* Don'ts */}
            <div className="bg-red-50/50 border border-red-200 rounded-3xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <FiXCircle className="text-2xl text-red-600" />
                <h3 className="text-lg font-extrabold text-slate-900">
                  Fire Safety Don'ts
                </h3>
              </div>
              <ul className="space-y-3 text-xs sm:text-sm text-slate-700 font-medium">
                <li className="flex items-start gap-2">
                  <span className="text-red-600 font-bold">•</span>
                  Never use water on electrical or grease fires.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-600 font-bold">•</span>
                  Don't block emergency exit doors or fire extinguisher stations.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-600 font-bold">•</span>
                  Never attempt to fight large, spreading fires beyond your capability.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-600 font-bold">•</span>
                  Don't ignore expired or depleted fire extinguishers.
                </li>
              </ul>
            </div>
          </div>

          {/* CTA Footer Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <FiShield className="text-2xl" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 mb-2">
              Equip Your Space With Certified Safety Products
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mb-6 font-medium">
              Browse our complete catalog of fire extinguishers, alarms, safety blankets, and emergency gear.
            </p>
            <Link
              to="/shop"
              className="px-8 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-red-500/20 flex items-center gap-2"
            >
              <span>Explore Products</span>
              <FiArrowRight />
            </Link>
          </div>
        </main>

        <DesktopFooter />
        <MobileBottomNav />
      </div>
    </PageTransition>
  );
};

export default SafetyCenter;
