import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Grid, X } from 'lucide-react';

import Slide01Title from './slides/Slide01Title';
import Slide02Problem from './slides/Slide02Problem';
import Slide03Category from './slides/Slide03Category';
import Slide04UseCases from './slides/Slide04UseCases';
import Slide05Phases from './slides/Slide05Phases';
import Slide06DualGPS from './slides/Slide06DualGPS';
import Slide07Safety from './slides/Slide07Safety';
import Slide08TrustInfra from './slides/Slide08TrustInfra';
import Slide09NightShield from './slides/Slide09NightShield';
import Slide10VisionCam from './slides/Slide10VisionCam';
import Slide11Ecosystem from './slides/Slide11Ecosystem';
import Slide12Escalation from './slides/Slide12Escalation';
import Slide13Economics from './slides/Slide13Economics';
import Slide14Roadmap from './slides/Slide14Roadmap';
import Slide15Vision from './slides/Slide15Vision';

const slides = [
  { component: Slide01Title, title: 'Title', label: 'MyDriver' },
  { component: Slide02Problem, title: 'The Problem', label: 'Problem' },
  { component: Slide03Category, title: 'Category Positioning', label: 'Category' },
  { component: Slide04UseCases, title: 'Use Cases', label: 'Use Cases' },
  { component: Slide05Phases, title: 'Two-Phase Strategy', label: 'Phases' },
  { component: Slide06DualGPS, title: 'Dual-GPS Engine', label: 'Dual-GPS' },
  { component: Slide07Safety, title: 'Safety Stack', label: 'Safety' },
  { component: Slide08TrustInfra, title: 'Trust Infrastructure', label: 'Trust Infra' },
  { component: Slide09NightShield, title: 'Night Shield', label: 'Night Shield' },
  { component: Slide10VisionCam, title: 'VisionCam', label: 'VisionCam' },
  { component: Slide11Ecosystem, title: 'The Ecosystem', label: 'Ecosystem' },
  { component: Slide12Escalation, title: 'Escalation Framework', label: 'L0–L5' },
  { component: Slide13Economics, title: 'Unit Economics', label: 'Economics' },
  { component: Slide14Roadmap, title: '18-Month Roadmap', label: 'Roadmap' },
  { component: Slide15Vision, title: 'The Long Game', label: 'Vision' },
];

const variants = {
  enter: (dir) => ({ opacity: 0, y: dir > 0 ? 12 : -12 }),
  center: { opacity: 1, y: 0 },
  exit: (dir) => ({ opacity: 0, y: dir > 0 ? -12 : 12 }),
};

function SlideOverview({ current, onSelect, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(9, 13, 22, 0.95)', backdropFilter: 'blur(16px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="w-full max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-white">Slide Directory</h3>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => { onSelect(i); onClose(); }}
              className={`clean-card p-3 text-left transition-all ${current === i ? 'border-sky-400 bg-slate-800' : 'hover:border-slate-700'}`}
            >
              <span className="text-[10px] font-mono text-slate-500 block mb-1">0{i + 1}</span>
              <span className="text-xs font-semibold text-slate-200 block truncate">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showOverview, setShowOverview] = useState(false);

  const goTo = useCallback((idx, dir) => {
    if (idx < 0 || idx >= slides.length) return;
    setDirection(dir !== undefined ? dir : idx > current ? 1 : -1);
    setCurrent(idx);
  }, [current]);

  const goNext = useCallback(() => goTo(current + 1, 1), [current, goTo]);
  const goPrev = useCallback(() => goTo(current - 1, -1), [current, goTo]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
      if (e.key === 'Escape') setShowOverview(false);
      if (e.key === 'g' || e.key === 'G') setShowOverview(v => !v);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  const SlideComponent = slides[current].component;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0B0E14]">
      {/* Active Slide */}
      <AnimatePresence custom={direction} mode="wait">
        <motion.div
          key={current}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          <SlideComponent />
        </motion.div>
      </AnimatePresence>

      {/* Subtle Top Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-900 z-40">
        <div
          className="h-full bg-sky-400 transition-all duration-300 ease-out"
          style={{ width: `${((current + 1) / slides.length) * 100}%` }}
        />
      </div>

      {/* Top Header Controls */}
      <div className="fixed top-4 left-6 right-6 z-40 flex justify-between items-center pointer-events-none">
        <span className="text-xs font-mono text-slate-500 font-semibold tracking-wider uppercase pointer-events-auto">MyDriver</span>
        
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-800">
            {current + 1} / {slides.length}
          </span>
          <button
            onClick={() => setShowOverview(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all"
            title="Overview (G)"
          >
            <Grid size={16} />
          </button>
        </div>
      </div>

      {/* Bottom Floating Navigation Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-slate-900/80 border border-slate-800 px-4 py-2 rounded-full backdrop-blur-md">
        <button
          onClick={goPrev}
          disabled={current === 0}
          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-xs font-medium text-slate-300 min-w-[120px] text-center truncate">
          {slides[current].label}
        </span>
        <button
          onClick={goNext}
          disabled={current === slides.length - 1}
          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Slide Overview Modal */}
      <AnimatePresence>
        {showOverview && (
          <SlideOverview
            current={current}
            onSelect={(i) => goTo(i)}
            onClose={() => setShowOverview(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
