import { motion } from 'framer-motion';
import { Navigation } from 'lucide-react';

const signals = [
  { name: 'Driver Phone GPS', desc: 'Continuous high-frequency location stream from driver\'s active app.' },
  { name: 'Customer Phone GPS', desc: 'Secondary independent verification stream when passenger is in the vehicle.' },
  { name: 'Expected Map Route', desc: 'Baseline route corridor calculated by map engine at trip start.' },
];

const triggers = [
  'Route deviation beyond designated corridor tolerance',
  'Unscheduled stops longer than 3 minutes mid-trip',
  'Driver app force-closed, phone off, or GPS permission revoked',
  'Speed sustained above customer-configured ceiling',
];

export default function Slide06DualGPS() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />
      <div className="deck-inner">
        <motion.div className="deck-header" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="deck-badge">Core Technical Moat</div>
          <h2 className="deck-title">Dual-GPS Trip Integrity Engine</h2>
          <p className="deck-subtitle">Continuously reconciles three independent signals. <span className="c-sky" style={{ fontWeight: 600 }}>Switching it off is itself the alarm.</span></p>
        </motion.div>

        <div className="deck-divider" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', flex: 1, alignItems: 'start' }}>
          {/* Left: Signals */}
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <span className="label-sm" style={{ display: 'block', marginBottom: '1.25rem' }}>Three Reconciled Signals</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {signals.map((s, i) => (
                <div key={s.name} style={{ display: 'flex', gap: '1rem', padding: '1.1rem 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--sky)' }}>{i + 1}</span>
                  </div>
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--txt-primary)', fontSize: '0.95rem', display: 'block', marginBottom: '0.25rem' }}>{s.name}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--txt-muted)' }}>{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: Triggers */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
            <span className="label-sm c-rose" style={{ display: 'block', marginBottom: '1.25rem' }}>Automated Escalation Triggers</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {triggers.map((t) => (
                <div key={t} style={{ display: 'flex', gap: '0.75rem', padding: '1.1rem 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--rose)', fontSize: '1rem', flexShrink: 0, marginTop: '0.05rem' }}>⚡</span>
                  <span style={{ fontSize: '0.95rem', color: 'var(--txt-secondary)', fontWeight: 500 }}>{t}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'rgba(56,189,248,0.05)', borderLeft: '3px solid var(--sky)', borderRadius: '0 6px 6px 0' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--txt-secondary)', fontStyle: 'italic', lineHeight: 1.6 }}>
                "A safety feature a driver can silently disable is theatre. The act of disabling it triggers the alert."
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
