import Navbar from '../components/marketing/Navbar.jsx'
import Hero from '../components/marketing/Hero.jsx'
import Skills from '../components/marketing/Skills.jsx'
import SafetySuite from '../components/marketing/SafetySuite.jsx'
import HowItWorks from '../components/marketing/HowItWorks.jsx'
import DriverPitch from '../components/marketing/DriverPitch.jsx'
import Pricing from '../components/marketing/Pricing.jsx'
import Testimonials from '../components/marketing/Testimonials.jsx'
import FAQ from '../components/marketing/FAQ.jsx'
import CTA from '../components/marketing/CTA.jsx'
import Footer from '../components/marketing/Footer.jsx'

export default function Landing() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Skills />
        <SafetySuite />
        <HowItWorks />
        <DriverPitch />
        <Pricing />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
