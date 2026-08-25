import { motion } from 'framer-motion';
import { AlertOctagon } from 'lucide-react';
import { useState } from 'react';

const levels = [
  { level: 'L0', trigger: 'Minor anomaly (small deviation, brief stop)', action: 'Silent log, in-app driver nudge', window: 'Instant' },
  { level: 'L1', trigger: 'Sustained anomaly / speed breach x3', action: 'Driver push alert + customer notification', window: '< 30 s' },
  { level: 'L2', trigger: 'No response / app disabled', action: 'SMS + automated IVR call to driver', window: '< 90 s' },
  { level: 'L3', trigger: 'Still unresolved', action: 'Human Safety Desk agent calls driver & customer', window: '< 3 min' },
  { level: 'L4', trigger: 'SOS pressed, or L3 unresolved', action: 'Guardian contacts alerted, live location shared', window: 'Immediate' },
  { level: 'L5', trigger: 'Verified emergency', action: 'Structured escalation to Dial 112 / T-Safe, Trip Vault packet released', window: 'Immediate' },
];

export default function Slide12Escalation() {
  const [selected, setSelected] = useState('L3');
  const active = levels.find(l => l.level === selected);

  return (
    <div className="slide">
      <div className="grid-bg-subtle" />

      <div className="relative z-10 w-full max-w-[1600px] mx-auto h-full flex flex-col justify-between py-2">
        {/* Header */}
        <motion.div className="mb-6 text-left" initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="clean-badge mb-3">
            <AlertOctagon size={16} className="text-brand-700" />
            <span>Operational Safety</span>
          </div>
          <h2 className="text-5xl lg:text-6xl font-black text-white tracking-tight mb-2">Structured Escalation Framework</h2>
          <p className="text-xl text-slate-600 max-w-3xl leading-relaxed font-medium">
            A defensible L0–L5 ladder replacing automated police triggers. Human verification is mandatory before L5.
          </p>
        </motion.div>

        {/* 6 Selector Buttons - Borderless */}
        <div className="grid grid-cols-6 gap-4 mb-8 pt-6 border-t border-slate-200">
          {levels.map((l) => {
            const isSel = l.level === selected;
            return (
              <button
                key={l.level}
                onClick={() => setSelected(l.level)}
                className={`py-4 text-center transition-all border-t-2 cursor-pointer ${
                  isSel ? 'border-brand-400 opacity-100' : 'border-slate-200 opacity-50 hover:opacity-100'
                }`}
              >
                <span className="text-3xl font-black font-mono text-white block">{l.level}</span>
                <span className="text-sm font-mono font-bold text-brand-700 block mt-1">{l.window}</span>
              </button>
            );
          })}
        </div>

        {/* Active Stage Detail */}
        {active && (
          <motion.div key={active.level} className="pt-6 border-t border-slate-200 w-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-3xl font-black font-mono text-brand-700">Escalation Stage {active.level}</span>
              <span className="text-lg font-mono font-bold text-slate-600">Target Response Window: {active.window}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xl font-medium">
              <div>
                <span className="text-sm uppercase font-extrabold text-slate-500 block mb-2">Trigger Condition</span>
                <p className="text-white font-bold text-2xl leading-relaxed">{active.trigger}</p>
              </div>
              <div>
                <span className="text-sm uppercase font-extrabold text-brand-700 block mb-2">System Action</span>
                <p className="text-slate-900 text-2xl leading-relaxed">{active.action}</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
