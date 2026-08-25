import { motion } from 'framer-motion';
import { Compass, ShieldCheck, Database, Award } from 'lucide-react';

export default function Slide15Vision() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />

      <div className="relative z-10 w-full max-w-[1600px] mx-auto h-full flex flex-col justify-between py-2">
        {/* Header */}
        <motion.div className="mb-6 text-left" initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="clean-badge mb-3">
            <Compass size={16} className="text-slate-900" />
            <span>3-Year Vision</span>
          </div>
          <h2 className="text-5xl lg:text-6xl font-black text-white tracking-tight mb-2">The Long Game</h2>
          <p className="text-xl text-slate-600 max-w-3xl leading-relaxed font-medium">
            MyDriver's real asset at scale is not the driver pool — <span className="text-slate-900 font-bold">it is the verified driving-behaviour dataset and trust infrastructure layer.</span>
          </p>
        </motion.div>

        {/* 3 Open Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 my-auto pt-6 border-t border-slate-200">
          <motion.div className="py-2" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Database size={36} className="text-slate-900 mb-4" />
            <h4 className="font-extrabold text-white text-3xl mb-3">Behavioral Dataset</h4>
            <p className="text-lg text-slate-600 leading-relaxed font-medium">High-fidelity driving telematics data for insurance underwriting and risk assessment.</p>
          </motion.div>

          <motion.div className="py-2" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <ShieldCheck size={36} className="text-brand-600 mb-4" />
            <h4 className="font-extrabold text-white text-3xl mb-3">Licensable Trust Engine</h4>
            <p className="text-lg text-slate-600 leading-relaxed font-medium">Verification and escalation protocols licensable to corporate fleets & ride platforms.</p>
          </motion.div>

          <motion.div className="py-2" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Award size={36} className="text-brand-700 mb-4" />
            <h4 className="font-extrabold text-white text-3xl mb-3">DaaS Ecosystem</h4>
            <p className="text-lg text-slate-600 leading-relaxed font-medium">Personal drivers, corporate fleets, event chauffeurs, and driver training academy.</p>
          </motion.div>
        </div>

        {/* Bottom Banner */}
        <motion.div className="pt-6 border-t border-slate-200 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <p className="text-3xl font-extrabold text-white italic">"Your car. Your family. Your terms. Someone else drives."</p>
        </motion.div>
      </div>
    </div>
  );
}
