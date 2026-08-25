import { motion } from 'framer-motion';
import { Share2, Gauge } from 'lucide-react';

const alerts = [
  { txt: '"Trip started. Priya is in the car."',          color: 'var(--txt-secondary)' },
  { txt: '"Route deviation detected — 1.4 km off path."', color: 'var(--amber)' },
  { txt: '"Arrived. Priya confirmed safe."',              color: 'var(--emerald)' },
];

const telematics = [
  { signal: 'Harsh braking / acceleration', sensor: 'Accelerometer G-force delta' },
  { signal: 'Aggressive cornering',          sensor: 'Gyroscope angular rate' },
  { signal: 'Overspeeding vs road limit',    sensor: 'GPS + map speed data' },
  { signal: 'Phone use while moving',        sensor: 'Screen-on + motion correlation' },
  { signal: 'Night fatigue pattern',         sensor: 'Hours driven + micro-swerve detection' },
];

export default function Slide07Safety() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />
      <div className="deck-inner">
        <motion.div className="deck-header" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="deck-badge">Core Safety Stack</div>
          <h2 className="deck-title">Guardian Link & Live Driver Score</h2>
          <p className="deck-subtitle">Proactive push alerts to trusted contacts, paired with 50 Hz phone sensor telematics scoring.</p>
        </motion.div>

        <div className="deck-divider" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', flex: 1, alignItems: 'start' }}>
          {/* Guardian Link */}
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <Share2 size={20} style={{ color: 'var(--sky)' }} />
              <span style={{ fontWeight: 800, color: 'var(--txt-primary)', fontSize: '1.05rem' }}>Guardian Link</span>
              <span className="pill pill-sky">Push Safety</span>
            </div>
            <p className="body-md" style={{ marginBottom: '1.5rem' }}>
              Uber gives a link you must manually check. Guardian Link <strong style={{ color: 'var(--sky)' }}>pushes real-time alerts directly to up to 3 trusted contacts</strong>.
            </p>
            {alerts.map((a) => (
              <div key={a.txt} style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--border)', fontSize: '0.9rem', color: a.color, fontWeight: 500, fontStyle: 'italic' }}>
                {a.txt}
              </div>
            ))}
          </motion.div>

          {/* Driver Score */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <Gauge size={20} style={{ color: 'var(--amber)' }} />
              <span style={{ fontWeight: 800, color: 'var(--txt-primary)', fontSize: '1.05rem' }}>Driver Score</span>
              <span className="pill pill-amber">0–100</span>
            </div>
            <p className="body-md" style={{ marginBottom: '1.5rem' }}>
              Star ratings measure politeness. Telematics measures actual driving safety and vehicle control.
            </p>
            {telematics.map((t) => (
              <div key={t.signal} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '0.85rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--txt-secondary)', fontWeight: 500 }}>{t.signal}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--amber)', fontWeight: 600, fontFamily: 'monospace' }}>{t.sensor}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
