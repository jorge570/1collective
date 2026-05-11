import React, { useEffect, useRef } from 'react';
import { 
  Wrench, 
  Clock, 
  FileText, 
  Smartphone, 
  ArrowRight,
  HardHat,
  CheckCircle2,
  Users
} from 'lucide-react';

const RevealOnScroll = ({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-up');
            if (delay === 1) entry.target.classList.add('delay-1');
            if (delay === 2) entry.target.classList.add('delay-2');
            if (delay === 3) entry.target.classList.add('delay-3');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) observer.unobserve(ref.current);
    };
  }, [delay]);

  return <div ref={ref} style={{ opacity: 0 }}>{children}</div>;
};

function App() {
  return (
    <>
      <header className="header">
        <div className="container">
          <div className="logo">
            <Wrench size={28} className="text-primary" strokeWidth={2.5} />
            1collective
          </div>
          <nav>
            <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '1rem' }}>
              Get Early Access
            </button>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="hero">
          <img 
            src="/src/assets/hero-electrician.png" 
            alt="Electrician at work" 
            className="hero-image" 
          />
          <div className="container">
            <div className="hero-content">
              <RevealOnScroll>
                <span className="badge">Built for the Field</span>
              </RevealOnScroll>
              
              <RevealOnScroll delay={1}>
                <h1>
                  Tools for the <span className="text-primary">trades</span>.<br />
                  Not the boardroom.
                </h1>
              </RevealOnScroll>

              <RevealOnScroll delay={2}>
                <p style={{ fontSize: '1.25rem', marginBottom: '2.5rem', maxWidth: '50ch' }}>
                  The job management platform that finally respects the people who build and fix everything. No fluff. Just the heavy-duty tech you need to run your crew, bill your clients, and get the job done.
                </p>
              </RevealOnScroll>

              <RevealOnScroll delay={3}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary">
                    Start Building <ArrowRight size={20} style={{ marginLeft: '0.5rem' }} />
                  </button>
                  <button className="btn btn-outline">
                    See How It Works
                  </button>
                </div>
              </RevealOnScroll>
            </div>
          </div>
        </section>

        {/* LOGO TICKER / SOCIAL PROOF */}
        <section className="section" style={{ backgroundColor: '#000', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div className="container">
            <p style={{ textAlign: 'center', fontFamily: 'var(--font-display)', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              TRUSTED BY HARDWORKING CREWS ACROSS THE COUNTRY
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap', marginTop: '2rem', opacity: 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.25rem' }}>
                <HardHat /> APEX PLUMBING
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.25rem' }}>
                <Wrench /> IRON & VOLT ELECTRIC
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.25rem' }}>
                <Users /> CASCADE ROOFING CO.
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES GRID */}
        <section className="section-lg">
          <div className="container">
            <RevealOnScroll>
              <h2 style={{ maxWidth: '20ch', marginBottom: '4rem' }}>
                Leave the paperwork in the truck.
              </h2>
            </RevealOnScroll>

            <div className="grid-3">
              <RevealOnScroll delay={1}>
                <div className="card">
                  <div className="card-icon">
                    <FileText size={40} strokeWidth={1.5} />
                  </div>
                  <h3>Invoicing & Payments</h3>
                  <p>Generate professional invoices right from the job site. Get paid faster with integrated mobile payments that don't make you jump through hoops.</p>
                </div>
              </RevealOnScroll>

              <RevealOnScroll delay={2}>
                <div className="card">
                  <div className="card-icon">
                    <Clock size={40} strokeWidth={1.5} />
                  </div>
                  <h3>Time Tracking & Crews</h3>
                  <p>Know exactly who is where. Clock in, track hours to specific projects, and manage your entire crew without a single paper timesheet.</p>
                </div>
              </RevealOnScroll>

              <RevealOnScroll delay={3}>
                <div className="card">
                  <div className="card-icon">
                    <CheckCircle2 size={40} strokeWidth={1.5} />
                  </div>
                  <h3>Job Management</h3>
                  <p>From initial quote to final sign-off. Keep photos, notes, and client communication in one place. Nothing falls through the cracks.</p>
                </div>
              </RevealOnScroll>
            </div>
          </div>
        </section>

        {/* MOBILE FOCUS SECTION */}
        <section className="section-lg" style={{ backgroundColor: '#111' }}>
          <div className="container">
            <div className="grid-2" style={{ alignItems: 'center' }}>
              <RevealOnScroll>
                <div className="feature-image-wrapper">
                  <img src="/src/assets/phone-hands.png" alt="Using app on job site" />
                </div>
              </RevealOnScroll>
              
              <div>
                <RevealOnScroll delay={1}>
                  <h2>Built for calloused hands.</h2>
                  <p style={{ fontSize: '1.25rem', margin: '2rem 0' }}>
                    We didn't design this in a sleek coffee shop. We built it on job sites, in vans, and out in the elements. Large tap targets, high-contrast text, and offline mode mean it works when you're wearing gloves in a basement with no service.
                  </p>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1.125rem' }}>
                      <Smartphone className="text-primary" /> Full functionality on mobile
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1.125rem' }}>
                      <CheckCircle2 className="text-primary" /> Works offline, syncs later
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1.125rem' }}>
                      <CheckCircle2 className="text-primary" /> Voice-to-text notes for messy jobs
                    </li>
                  </ul>
                </RevealOnScroll>
              </div>
            </div>
          </div>
        </section>

        {/* CALL TO ACTION */}
        <section className="section-lg" style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.1, zIndex: -1 }}>
            <img src="/src/assets/tools-tailgate.png" alt="Background" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div className="container" style={{ textAlign: 'center' }}>
            <RevealOnScroll>
              <h2 style={{ fontSize: 'clamp(3rem, 6vw, 5rem)' }}>Stop struggling with software.<br/>Start building.</h2>
              <p style={{ margin: '2rem auto', fontSize: '1.25rem', color: 'var(--text-main)' }}>
                Join thousands of tradespeople running their business on 1collective.
              </p>
              <button className="btn btn-primary" style={{ padding: '1.5rem 3rem', fontSize: '1.5rem' }}>
                Create Free Account
              </button>
            </RevealOnScroll>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="logo" style={{ marginBottom: '1.5rem' }}>
                <Wrench size={24} className="text-primary" strokeWidth={2.5} />
                1collective
              </div>
              <p style={{ maxWidth: '400px' }}>
                The technology stack for blue collar workers. Built rugged. Built to last.
              </p>
            </div>
            <div className="footer-links">
              <h4>Product</h4>
              <ul>
                <li><a href="#">Job Management</a></li>
                <li><a href="#">Invoicing</a></li>
                <li><a href="#">Time Tracking</a></li>
                <li><a href="#">Pricing</a></li>
              </ul>
            </div>
            <div className="footer-links">
              <h4>Company</h4>
              <ul>
                <li><a href="#">About Us</a></li>
                <li><a href="#">Contact</a></li>
                <li><a href="#">Terms of Service</a></li>
                <li><a href="#">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <p>&copy; {new Date().getFullYear()} 1collective. All rights reserved.</p>
            <p>Built for the trade.</p>
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;
