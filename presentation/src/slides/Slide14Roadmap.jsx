import { motion } from 'framer-motion';

const phases = [
  { phase: 'Phase 0 · Month 0-2', title: 'Validate (₹12 Lakh)', desc: 'Guardian Stack MVP in 1 micro-market (Hitec City). 20-30 drivers. A/B test safety fee (₹49/₹99). Gate: 40% attach rate.' },
  { phase: 'Phase 1 · Month 3-9', title: 'Build (₹65 Lakh)', desc: 'Full Guardian Stack (all 10 software features), 100 active drivers, 24x7 Safety Desk live, corporate pilots.' },
  { phase: 'Phase 2 · Month 10-18', title: 'Vision (₹98 Lakh)', desc: 'VisionCam rollout with adaptive orientation, safety fee moves ₹49 -> ₹99, 300-400 drivers, break-even at M20.' },
  { phase: 'Phase 3 · Month 19-36', title: 'Expand', desc: 'Second city expansion (Bengaluru/Vizag), monthly personal driver plans, fleet management.' },
];

export default function Slide14Roadmap() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />

      <div className="relative z-10 w-full max-w-[1600px] mx-auto h-full flex flex-col justify-between py-2">
        {/* Header */}
        <motion.div className="mb-6 text-left" initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="clean-badge mb-3">Execution Schedule</div>
          <h2 className="text-5xl lg:text-6xl font-black text-white tracking-tight mb-2">Roadmap & Time to Succeed</h2>
          <p className="text-xl text-slate-600 max-w-3xl leading-relaxed font-medium">
            Disciplined progression with an immediate Phase 0 proof gate.
          </p>
        </motion.div>

        {/* 4 Open Grid Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 my-auto pt-6 border-t border-slate-200">
          {phases.map((p, i) => (
            <motion.div key={p.phase} className="py-2" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <span className="text-base font-mono font-bold text-slate-900 block mb-2">{p.phase}</span>
              <h3 className="font-black text-white text-3xl mb-3">{p.title}</h3>
              <p className="text-xl text-slate-900 leading-relaxed font-medium">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
