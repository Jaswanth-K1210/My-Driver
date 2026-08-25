import { motion } from 'framer-motion';
import { Camera, UserCheck } from 'lucide-react';

export default function Slide08TrustInfra() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />

      <div className="relative z-10 w-full max-w-[1600px] mx-auto h-full flex flex-col justify-between py-2">
        {/* Header */}
        <motion.div className="mb-6 text-left" initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="clean-badge mb-3">Verification Stack</div>
          <h2 className="text-5xl lg:text-6xl font-black text-white tracking-tight mb-2">Pickup Handshake & Condition Capture</h2>
          <p className="text-xl text-slate-600 max-w-3xl leading-relaxed font-medium">
            Stopping account substitution and protecting customer, driver, and platform from damage disputes.
          </p>
        </motion.div>

        {/* 2 Open Columns - No Inner Boxes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto pt-6 border-t border-slate-200">
          {/* Pickup Handshake (6 Cols) */}
          <motion.div className="lg:col-span-6 flex flex-col justify-between" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div>
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
                <UserCheck size={28} className="text-brand-600" />
                <h3 className="font-extrabold text-white text-2xl">Pickup Handshake (Identity Lock)</h3>
              </div>
              <p className="text-base text-slate-600 mb-6 leading-relaxed font-medium">
                Prevents a verified driver account from being operated by an unverified substitute (friend/brother).
              </p>
              <ol className="space-y-4 text-lg text-slate-900 font-semibold list-decimal list-inside">
                <li className="py-2 border-b border-slate-200">Driver takes live selfie in-app (liveness check)</li>
                <li className="py-2 border-b border-slate-200">Face-matched against onboarding profile record</li>
                <li className="py-2 border-b border-slate-200">Customer confirms 4-digit OTP with driver</li>
                <li className="py-2 text-brand-600 font-extrabold">Trip cannot start until both verification gates pass</li>
              </ol>
            </div>
          </motion.div>

          {/* Condition Capture (6 Cols) */}
          <motion.div className="lg:col-span-6 flex flex-col justify-between" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div>
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
                <Camera size={28} className="text-slate-900" />
                <h3 className="font-extrabold text-white text-2xl">8-Point Car Condition Capture</h3>
              </div>
              <p className="text-base text-slate-600 mb-6 leading-relaxed font-medium">
                Mandatory before pickup and after drop-off. Timestamped, geotagged, non-gallery photos.
              </p>
              <div className="grid grid-cols-4 gap-4 text-base font-bold text-slate-900 mb-6 text-center">
                <div className="py-3 border border-slate-200 rounded-lg">1. Front</div>
                <div className="py-3 border border-slate-200 rounded-lg">2. Rear</div>
                <div className="py-3 border border-slate-200 rounded-lg">3. Left Side</div>
                <div className="py-3 border border-slate-200 rounded-lg">4. Right Side</div>
                <div className="py-3 border border-slate-200 rounded-lg">5. Dashboard</div>
                <div className="py-3 border border-slate-200 rounded-lg">6. Odometer</div>
                <div className="py-3 border border-slate-200 rounded-lg">7. Seats</div>
                <div className="py-3 border border-slate-200 rounded-lg">8. Boot</div>
              </div>
              <p className="text-base font-medium text-slate-500">Protects customer from pre-existing damage claims, driver from false accusation, and platform from disputes.</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
