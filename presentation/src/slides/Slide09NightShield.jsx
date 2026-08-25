import { motion } from 'framer-motion';
import { Moon, ShieldCheck, Headphones } from 'lucide-react';

export default function Slide09NightShield() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />

      <div className="relative z-10 w-full max-w-[1600px] mx-auto flex flex-col justify-start gap-8">
        {/* Header */}
        <motion.div className="text-left" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="clean-badge mb-3">
            <Moon size={16} className="text-purple-400" />
            <span>Night Protocol (10 PM – 5 AM)</span>
          </div>

          <h2 className="text-5xl lg:text-6xl font-black text-white tracking-tight mb-2">
            Night Shield Protocol
          </h2>

          <p className="text-xl text-slate-600 max-w-3xl leading-relaxed font-medium">
            A hard operating protocol, not a feature toggle. Ensures complete human oversight for every late-night ride without requiring camera hardware.
          </p>
        </motion.div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pt-6 border-t border-slate-200">
          {/* Left Column: Features (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col justify-start gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-extrabold text-purple-300 text-2xl mb-4 flex items-center gap-2">
                  <ShieldCheck size={24} /> Driver Qualification
                </h3>
                <ul className="space-y-3 text-lg text-slate-900 font-medium">
                  <li className="flex items-start gap-2">• 6+ months tenure & score ≥ 85</li>
                  <li className="flex items-start gap-2">• Re-verified every 90 days</li>
                  <li className="flex items-start gap-2">• Shift-start liveness + reaction test</li>
                </ul>
              </div>

              <div>
                <h3 className="font-extrabold text-white text-2xl mb-4 flex items-center gap-2">
                  <Headphones size={24} className="text-slate-900" /> Live Safety Desk Oversight
                </h3>
                <ul className="space-y-3 text-lg text-slate-900 font-medium">
                  <li className="flex items-start gap-2">• Real-time live board monitoring</li>
                  <li className="flex items-start gap-2">• Triple volume-button silent SOS</li>
                  <li className="flex items-start gap-2">• 10-min post-drop check-in call</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column: Image (5 Cols) */}
          <motion.div className="lg:col-span-5 relative" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
            <div className="border border-slate-200 rounded-2xl overflow-hidden relative group">
              <img
                src="/assets/safety_desk.jpg"
                alt="24x7 Safety Desk Command Center"
                className="w-full h-[360px] object-cover rounded-xl transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-slate-600 font-mono">
                <span className="bg-slate-50 px-3 py-1 rounded border border-slate-200 backdrop-blur-md">COMMAND DESK: ACTIVE</span>
                <span className="bg-purple-950/80 text-purple-300 px-3 py-1 rounded border border-purple-800/40 backdrop-blur-md">24/7 LIVE BOARD</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
