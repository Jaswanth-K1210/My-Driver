import { motion } from 'framer-motion';
import { Moon, Plane, HeartHandshake, Building2 } from 'lucide-react';
import { useState } from 'react';

const cases = [
  { id: 1, tag: 'Primary Wedge',    title: 'Late-Night Solo Ride',      icon: Moon,         color: 'var(--purple)',
    who: 'Women & young professionals returning late from IT hubs or social venues.',
    action: 'Night Shield certified drivers, live guardian auto-link, silent volume SOS, 24×7 Safety Desk monitoring.' },
  { id: 2, tag: 'Highest Frequency', title: 'Airport Empty-Car Drop',    icon: Plane,        color: 'var(--sky)',
    who: 'Frequent flyers avoiding ₹300–500/day airport parking charges.',
    action: 'Empty Car Mode geofence corridor, speed ceiling, 8-point condition capture, Trip Vault email report.' },
  { id: 3, tag: 'Trust Driver',      title: 'Family & Elderly Transport', icon: HeartHandshake,color: 'var(--emerald)',
    who: 'Parents, in-laws, or dependents travelling without you.',
    action: 'Arrival confirmation, Driver Behaviour Score, repeat-driver preference booking.' },
  { id: 4, tag: 'Revenue Anchor',   title: 'Corporate Night Drop',      icon: Building2,    color: 'var(--amber)',
    who: 'IT / BPO / Healthcare employers with statutory safe transport obligations.',
    action: 'Compliance-grade trip logs, transport manager dashboard, contracted monthly volume.' },
];

export default function Slide04UseCases() {
  const [sel, setSel] = useState(1);
  const active = cases.find(c => c.id === sel);

  return (
    <div className="slide">
      <div className="grid-bg-subtle" />
      <div className="deck-inner">
        <motion.div className="deck-header" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="deck-badge">Core Operational Scenarios</div>
          <h2 className="deck-title">Four Essential Use Cases</h2>
          <p className="deck-subtitle">The four operational scenarios the product must visibly win.</p>
        </motion.div>

        <div className="deck-divider" />

        {/* 4 selector tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0' }}>
          {cases.map((c) => {
            const Icon = c.icon;
            const isSel = c.id === sel;
            return (
              <button key={c.id} onClick={() => setSel(c.id)}
                style={{ textAlign: 'left', padding: '1.25rem 1.5rem 1.25rem 0', cursor: 'pointer', background: 'none', border: 'none',
                  borderTop: `2px solid ${isSel ? c.color : 'var(--border)'}`,
                  opacity: isSel ? 1 : 0.5, transition: 'all 0.2s' }}>
                <span className="label-sm" style={{ display: 'block', marginBottom: '0.5rem', color: isSel ? c.color : 'var(--txt-muted)' }}>{c.tag}</span>
                <Icon size={22} style={{ color: isSel ? c.color : 'var(--txt-muted)', marginBottom: '0.5rem' }} />
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--txt-primary)', lineHeight: 1.3, display: 'block' }}>{c.title}</span>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        {active && (
          <motion.div key={active.id} style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', alignItems: 'start' }}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div>
              <span className="label-sm" style={{ display: 'block', marginBottom: '0.75rem' }}>Target Persona</span>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--txt-primary)', lineHeight: 1.5 }}>{active.who}</p>
            </div>
            <div>
              <span className="label-sm" style={{ display: 'block', marginBottom: '0.75rem', color: active.color }}>MyDriver System Action</span>
              <p className="body-lg">{active.action}</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
