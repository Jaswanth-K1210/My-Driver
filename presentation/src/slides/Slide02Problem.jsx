import { motion } from 'framer-motion';
import { AlertCircle, ShieldAlert, EyeOff, Radio } from 'lucide-react';

const failureMoments = [
  {
    id: 1, time: '11:40 PM · Jubilee Hills',
    title: 'The Late-Night Solo Rider',
    problem: 'A woman travelling alone in her own car with a stranger. Her only safety measure is a manual SOS button.',
    gap: 'No proactive monitoring or automated guardian link.',
    icon: ShieldAlert,
  },
  {
    id: 2, time: '06:10 AM · RGIA Airport Drop',
    title: 'The Empty-Car Return',
    problem: 'Sending your car home empty to avoid ₹500/day airport parking. Zero visibility on how it is driven.',
    gap: 'A moving dot gives no info on speed, safety or car condition.',
    icon: EyeOff,
  },
  {
    id: 3, time: '04:30 PM · School / Hospital Run',
    title: 'Family & Dependent Transport',
    problem: 'A driver takes elderly parents or children across the city. Everything is a black box.',
    gap: 'No real-time status or verified check-in confirmation.',
    icon: Radio,
  },
];

export default function Slide02Problem() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />
      <div className="deck-inner">
        {/* Header */}
        <motion.div className="deck-header" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="deck-badge">
            <AlertCircle size={13} style={{ color: 'var(--rose)' }} />
            <span>Market Vulnerability</span>
          </div>
          <h2 className="deck-title">The Three Failure Moments</h2>
          <p className="deck-subtitle">
            Existing platforms give you a moving dot on a map.{' '}
            <span className="c-rose" style={{ fontWeight: 600 }}>A dot cannot tell you if anything is wrong.</span>
          </p>
        </motion.div>

        <div className="deck-divider" />

        {/* 3 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3rem', flex: 1 }}>
          {failureMoments.map((m, i) => {
            const Icon = m.icon;
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <span className="label-sm c-sky">{m.time}</span>
                  <Icon size={20} style={{ color: 'var(--txt-muted)', flexShrink: 0, marginLeft: 8 }} />
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--txt-primary)', marginBottom: '0.75rem', lineHeight: 1.25 }}>{m.title}</h3>
                <p className="body-md" style={{ marginBottom: '1.25rem' }}>{m.problem}</p>
                <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rose)' }}>⚠ {m.gap}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
