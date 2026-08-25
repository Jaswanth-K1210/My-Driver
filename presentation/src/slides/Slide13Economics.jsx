import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';

export default function Slide13Economics() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />

      <div className="relative z-10 w-full max-w-[1600px] mx-auto h-full flex flex-col justify-between py-2">
        {/* Header */}
        <motion.div className="mb-6 text-left" initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="clean-badge mb-3">
            <TrendingUp size={16} className="text-brand-600" />
            <span>Unit Economics</span>
          </div>
          <h2 className="text-5xl lg:text-6xl font-black text-white tracking-tight mb-2">Unit Economics & Pricing</h2>
          <p className="text-xl text-slate-600 max-w-3xl leading-relaxed font-medium">
            Match DriveU on base fare, win on the safety layer.
          </p>
        </motion.div>

        {/* 2 Open Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 my-auto pt-6 border-t border-slate-200">
          {/* Phase 1 economics */}
          <motion.div className="py-2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <h3 className="font-black text-white text-3xl mb-1">Phase 1 Unit Trip Breakdown</h3>
            <p className="text-base text-slate-500 mb-6 font-medium">Sample 3-hour night trip economics</p>
            
            <div className="space-y-3 text-lg divide-y divide-slate-200 font-medium">
              <div className="flex justify-between py-2.5"><span className="text-slate-600">Driver Fare (₹129/hr x 3)</span><span className="text-white font-bold">₹387</span></div>
              <div className="flex justify-between py-2.5"><span className="text-slate-600">Night Surcharge</span><span className="text-white font-bold">₹150</span></div>
              <div className="flex justify-between py-2.5"><span className="text-slate-600">Guardian Safety Fee</span><span className="text-slate-900 font-bold">₹49</span></div>
              <div className="flex justify-between py-2.5 font-black text-xl"><span className="text-white">Customer Pays</span><span className="text-white">₹586</span></div>
              <div className="flex justify-between py-2.5"><span className="text-slate-500">Driver Payout (78%)</span><span className="text-slate-500">- ₹419</span></div>
              <div className="flex justify-between py-3 font-black text-2xl text-brand-600 pt-4 border-t-2 border-brand-300"><span className="text-brand-600">Contribution per Trip</span><span className="text-brand-600">₹126</span></div>
            </div>
          </motion.div>

          {/* Pricing Architecture */}
          <motion.div className="py-2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <h3 className="font-black text-white text-3xl mb-1">Pricing Architecture</h3>
            <p className="text-base text-slate-500 mb-6 font-medium">Transparent modular pricing model</p>

            <div className="space-y-3 text-lg font-medium">
              <div className="flex justify-between py-3 border-b border-slate-200"><span className="text-slate-900">Hourly Base Fare</span><span className="text-white font-extrabold">₹129/hr (min 2 hrs)</span></div>
              <div className="flex justify-between py-3 border-b border-slate-200"><span className="text-slate-900">Night Surcharge (10 PM - 5 AM)</span><span className="text-white font-extrabold">+ ₹150 flat</span></div>
              <div className="flex justify-between py-3 border-b border-slate-200"><span className="text-slate-900">Guardian Safety Fee</span><span className="text-slate-900 font-extrabold">₹49 (P1) / ₹99 (P2)</span></div>
              <div className="flex justify-between py-3 border-b border-slate-200"><span className="text-slate-900">Airport Empty-Car Drop</span><span className="text-white font-extrabold">₹349 flat</span></div>
              <div className="flex justify-between py-3"><span className="text-slate-900">Driver Subscription (Pro)</span><span className="text-white font-extrabold">₹499 / month</span></div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
