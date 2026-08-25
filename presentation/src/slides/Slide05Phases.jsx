import { motion } from 'framer-motion';
import { Smartphone, Video, ShieldCheck, Zap } from 'lucide-react';

const p1 = [
  'Dual-GPS Trip Integrity cross-check',
  'Guardian Link auto-alerts to trusted contacts',
  'Live Driver Behaviour Score (phone telematics)',
  'Pickup Handshake (selfie + OTP liveness match)',
  '8-Point Car Condition photo capture',
  '24×7 Human Safety Desk escalation ladder',
];

const p2 = [
  'Adaptive-orientation motorised camera unit',
  'Customer-selected view: Road / Driver / Full',
  'Camera vs Phone GPS tamper detection',
  'On-demand streaming (no continuous 24×7 storage)',
];
const p2removed = [
  'Two-way live voice into car (privacy concern)',
  'Always-inward cabin filming (Replaced by Mode R/D/F)',
];

export default function Slide05Phases() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />
      <div className="deck-inner">
        <motion.div className="deck-header" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="deck-badge">Strategic Sequencing</div>
          <h2 className="deck-title">Phase 1 vs Phase 2 USP</h2>
          <p className="deck-subtitle">Ship the trust layer first, add the lens second. Prove people pay for accountability before hardware CAPEX.</p>
        </motion.div>

        <div className="deck-divider" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', flex: 1, alignItems: 'start' }}>
          {/* Phase 1 */}
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Smartphone size={22} style={{ color: 'var(--sky)' }} />
                <span style={{ fontWeight: 800, color: 'var(--txt-primary)', fontSize: '1.1rem' }}>Phase 1 — Digital Guardian Stack</span>
              </div>
              <span className="pill pill-emerald">Zero Hardware</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {p1.map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border)' }}>
                  <ShieldCheck size={17} style={{ color: 'var(--sky)', flexShrink: 0, marginTop: '0.15rem' }} />
                  <span style={{ fontSize: '0.95rem', color: 'var(--txt-secondary)', fontWeight: 500 }}>{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Phase 2 */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Video size={22} style={{ color: 'var(--purple)' }} />
                <span style={{ fontWeight: 800, color: 'var(--txt-primary)', fontSize: '1.1rem' }}>Phase 2 — VisionCam</span>
              </div>
              <span className="pill pill-purple">Adds Sight</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem' }}>
              {p2.map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border)' }}>
                  <Zap size={17} style={{ color: 'var(--purple)', flexShrink: 0, marginTop: '0.15rem' }} />
                  <span style={{ fontSize: '0.95rem', color: 'var(--txt-secondary)', fontWeight: 500 }}>{item}</span>
                </div>
              ))}
            </div>

            <span className="label-sm" style={{ display: 'block', marginBottom: '0.75rem' }}>Removed from spec</span>
            {p2removed.map((item) => (
              <div key={item} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', opacity: 0.4 }}>
                <span style={{ fontSize: '0.85rem', textDecoration: 'line-through', color: 'var(--txt-muted)' }}>{item}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
