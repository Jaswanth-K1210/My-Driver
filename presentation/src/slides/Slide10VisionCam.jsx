import { motion } from 'framer-motion';
import { Camera, Eye, Video } from 'lucide-react';
import { useState } from 'react';

const modes = [
  { id: 'R', label: 'Mode R — Road Only (Default)', desc: 'Camera faces forward. Cabin is not captured at all. Used when owner is in the car and wants zero cabin filming.', icon: Camera },
  { id: 'D', label: 'Mode D — Driver Focus', desc: 'Frame tightened strictly to driver\'s seat. Passengers remain outside frame. Used when family rides and wants driver accountability without being filmed.', icon: Eye },
  { id: 'F', label: 'Mode F — Full Cabin', desc: 'Wide interior framing showing whole cabin. Used when car travels empty (airport drop, service run, delivery). Full visibility of interior contents.', icon: Video },
];

export default function Slide10VisionCam() {
  const [selected, setSelected] = useState('R');
  const active = modes.find(m => m.id === selected);

  return (
    <div className="slide">
      <div className="grid-bg-subtle" />

      <div className="relative z-10 w-full max-w-[1600px] mx-auto flex flex-col justify-start gap-8">
        {/* Header */}
        <motion.div className="text-left" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="clean-badge mb-3">
            <Camera size={16} className="text-purple-400" />
            <span>Phase 2 Hardware Integration</span>
          </div>

          <h2 className="text-5xl lg:text-6xl font-black text-white tracking-tight mb-2">
            MyDriver VisionCam
          </h2>

          <p className="text-xl text-slate-600 max-w-3xl leading-relaxed font-medium">
            A single motorized dual-lens unit configured per trip. Portable, self-powered, 4G M2M SIM connected.
          </p>
        </motion.div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pt-6 border-t border-slate-200">
          {/* Left Column: Image (5 Cols) */}
          <motion.div className="lg:col-span-5 relative" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="border border-slate-200 rounded-2xl overflow-hidden relative group">
              <img
                src="/assets/visioncam.jpg"
                alt="MyDriver VisionCam Hardware"
                className="w-full h-[360px] object-cover rounded-xl transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-slate-600 font-mono">
                <span className="bg-slate-50 px-3 py-1 rounded border border-slate-200 backdrop-blur-md">HARDWARE: 4K DUAL LENS</span>
                <span className="bg-purple-950/80 text-purple-300 px-3 py-1 rounded border border-purple-800/40 backdrop-blur-md">ADAPTIVE PIVOT</span>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Modes (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col justify-start gap-6">
            <div className="grid grid-cols-3 gap-4">
              {modes.map((m) => {
                const Icon = m.icon;
                const isSel = m.id === selected;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelected(m.id)}
                    className={`py-3 text-left transition-all border-t-2 cursor-pointer ${isSel ? 'border-purple-400 opacity-100' : 'border-slate-200 opacity-60 hover:opacity-100'}`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-mono font-bold text-purple-400">Mode {m.id}</span>
                      <Icon size={18} className={isSel ? 'text-purple-400' : 'text-slate-500'} />
                    </div>
                    <span className="text-base font-extrabold text-white block truncate">{m.label.split('—')[1]}</span>
                  </button>
                );
              })}
            </div>

            {active && (
              <motion.div key={active.id} className="pt-4 border-t border-slate-200 w-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h4 className="text-xl font-black text-purple-300 mb-2">{active.label}</h4>
                <p className="text-lg text-slate-900 leading-relaxed font-medium mb-4">{active.desc}</p>
                <p className="text-sm font-semibold text-slate-500">
                  🔒 <strong className="text-white">Privacy Rule:</strong> Customer can reduce capture at any time from app. Driver can NEVER change mode. Only Safety Desk can widen mode on L4/L5 emergency escalation.
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
