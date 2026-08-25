import { motion } from 'framer-motion';
import { Car } from 'lucide-react';

export default function Slide01Title() {
  return (
    <div className="slide" style={{ padding: 0, position: 'relative', overflow: 'hidden' }}>
      {/* Full bleed hero image background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/assets/hero_car.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.35)',
          zIndex: 0,
        }}
      />
      {/* Dark gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(10,13,20,0.92) 50%, rgba(10,13,20,0.5) 100%)', zIndex: 1 }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '4.5rem 6rem' }}>
        {/* Top */}
        <motion.div className="clean-badge" style={{ width: 'fit-content' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Car size={15} style={{ color: '#38BDF8' }} />
          <span>Driver-as-a-Service · India</span>
        </motion.div>

        {/* Center Content */}
        <div>
          <motion.p
            style={{ fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#38BDF8', marginBottom: '1.25rem' }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          >
            MyDriver — Investor Briefing 2024
          </motion.p>
          <motion.h1
            style={{ fontSize: 'clamp(3rem, 6vw, 6rem)', fontWeight: 900, color: '#FFFFFF', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '1.75rem', maxWidth: '850px' }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          >
            We Move{' '}
            <span style={{ color: '#38BDF8' }}>Trust</span>,<br />
            Not Just Vehicles.
          </motion.h1>
          <motion.p
            style={{ fontSize: '1.25rem', color: '#CBD5E1', maxWidth: '600px', lineHeight: 1.7, fontWeight: 500 }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          >
            India's first verified driver accountability infrastructure. Real-time safety for every trip where someone else drives your car.
          </motion.p>
        </div>

        {/* Bottom Stats Row */}
        <motion.div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.12)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        >
          {[
            { label: 'Platform Type', value: 'Driver-as-a-Service' },
            { label: 'Core Moat', value: 'Dual-GPS Engine' },
            { label: 'Safety Layer', value: '24×7 Human Desk' },
            { label: 'Phase 2', value: 'VisionCam Hardware' },
          ].map(stat => (
            <div key={stat.label}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '0.35rem' }}>{stat.label}</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#F1F5F9' }}>{stat.value}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
