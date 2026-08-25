import { motion } from 'framer-motion';
import { Smartphone, Car, Shield, LayoutDashboard } from 'lucide-react';

const apps = [
  {
    name: 'Customer App',
    tech: 'iOS & Android',
    modules: 'Booking, Guardian Link, Speed Ceiling, Pickup Handshake, Trip Vault, Live Map',
    icon: Smartphone,
  },
  {
    name: 'Driver App',
    tech: 'iOS & Android',
    modules: 'Acceptance, Navigation, Handshake (Selfie+OTP), Condition Capture, Score Dashboard',
    icon: Car,
  },
  {
    name: 'Agent App',
    tech: 'Android (Field Ops)',
    modules: 'Field Driver Recruitment, Document Verification, Road Test Scheduling',
    icon: Shield,
  },
  {
    name: 'Admin CRM',
    tech: 'Web Dashboard',
    modules: '24x7 Safety Desk, Live Night Board, Driver Verification Queue, Corporate Billing',
    icon: LayoutDashboard,
  },
];

export default function Slide11Ecosystem() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />

      <div className="relative z-10 w-full max-w-[1600px] mx-auto h-full flex flex-col justify-between py-2">
        {/* Header */}
        <motion.div className="mb-6 text-left" initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="clean-badge mb-3">Software Architecture</div>
          <h2 className="text-5xl lg:text-6xl font-black text-white tracking-tight mb-2">Application Ecosystem</h2>
          <p className="text-xl text-slate-600 max-w-3xl leading-relaxed font-medium">
            Four tailored applications connected to a single unified backend core.
          </p>
        </motion.div>

        {/* 4 Apps Grid - Open Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 my-auto pt-6 border-t border-slate-200">
          {apps.map((app, i) => {
            const Icon = app.icon;
            return (
              <motion.div key={app.name} className="py-2" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <Icon size={28} className="text-slate-900" />
                    <h3 className="font-extrabold text-white text-2xl">{app.name}</h3>
                  </div>
                  <span className="text-sm font-mono font-bold text-slate-900">{app.tech}</span>
                </div>
                <p className="text-lg text-slate-900 leading-relaxed font-medium"><strong className="text-slate-900">Core Modules:</strong> {app.modules}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
