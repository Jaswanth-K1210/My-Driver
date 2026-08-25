import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';

const rows = [
  { dim: 'Customer lacks',     legacy: 'A vehicle',                   md: 'A driver' },
  { dim: 'Platform supplies',  legacy: 'Car + driver',                md: 'Driver only' },
  { dim: 'Asset at risk',      legacy: "Platform / driver's car",     md: "Customer's own car" },
  { dim: 'Core anxiety',       legacy: '"Will I reach safely?"',      md: '"Will my car & family reach safely?"' },
  { dim: 'Competition mode',   legacy: 'Price & ETA',                 md: 'Accountability & verified trust' },
];

export default function Slide03Category() {
  return (
    <div className="slide">
      <div className="grid-bg-subtle" />
      <div className="deck-inner">
        <motion.div className="deck-header" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="deck-badge"><Layers size={13} /> Category Positioning</div>
          <h2 className="deck-title">Not a Ride-Hailing Company</h2>
          <p className="deck-subtitle">We do not move people. <span className="c-sky" style={{ fontWeight: 600 }}>We move trust.</span> A verified-trust infrastructure layer is not a low-margin commodity.</p>
        </motion.div>

        <div className="deck-divider" />

        <motion.div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          {/* Table Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr', gap: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-hi)' }}>
            <span className="label-sm">Dimension</span>
            <span className="label-sm">Uber / Ola / Rapido</span>
            <span className="label-sm c-sky">MyDriver</span>
          </div>

          {/* Table Rows */}
          {rows.map((row, i) => (
            <motion.div key={row.dim} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr', gap: '1rem', padding: '1.1rem 0', borderBottom: '1px solid var(--border)' }}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }}>
              <span style={{ fontWeight: 600, color: 'var(--txt-secondary)', fontSize: '0.95rem' }}>{row.dim}</span>
              <span style={{ color: 'var(--txt-muted)', fontSize: '0.95rem' }}>{row.legacy}</span>
              <span style={{ fontWeight: 700, color: 'var(--txt-primary)', fontSize: '0.95rem' }}>{row.md}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <div>
            <span className="label-sm c-amber" style={{ display: 'block', marginBottom: '0.4rem' }}>Low-Margin Commodity</span>
            <p className="body-md">Driver marketplaces compete solely on price, squeezing margins to zero.</p>
          </div>
          <div>
            <span className="label-sm c-sky" style={{ display: 'block', marginBottom: '0.4rem' }}>Infrastructure Trust Layer</span>
            <p className="body-md">Accountability infrastructure commands safety fees and corporate B2B contracts.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
