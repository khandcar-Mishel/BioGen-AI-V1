import { motion } from 'framer-motion';
import { User, BookOpen, UsersRound, Code2, Leaf, CheckCircle2 } from 'lucide-react';

// A DNA double helix growing inside a heart: new science in service of healthier lives.
const HELIX_Y = Array.from({ length: 41 }, (_, i) => 74 + i * 2.4);
const helixX = (y: number, phase: number) => 120 + 21 * Math.sin((y - 74) / 9 + phase);
const strand = (phase: number) => HELIX_Y.map((y, i) => `${i ? 'L' : 'M'}${helixX(y, phase).toFixed(1)} ${y.toFixed(1)}`).join(' ');
const HELIX_RUNGS = HELIX_Y.filter((_, i) => i % 4 === 0);

function HealthHelixArt() {
  return (
    <svg viewBox="0 0 240 220" className="absolute right-3 top-1/2 z-10 h-[88%] w-auto -translate-y-1/2" role="img" aria-label="A DNA helix growing inside a heart, representing healthier lives through new therapeutics">
      <defs>
        <linearGradient id="aboutHeart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#12B886" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0F7CDF" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="aboutStrand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00A878" />
          <stop offset="100%" stopColor="#0F7CDF" />
        </linearGradient>
      </defs>

      <motion.path
        d="M120 202 C42 144 18 84 58 52 C88 30 113 48 120 68 C127 48 152 30 182 52 C222 84 198 144 120 202 Z"
        fill="url(#aboutHeart)"
        stroke="#00A878"
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={{ transformOrigin: '120px 120px' }}
        animate={{ scale: [1, 1.025, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {HELIX_RUNGS.map((y) => (
        <line key={y} x1={helixX(y, 0)} y1={y} x2={helixX(y, Math.PI)} y2={y} stroke="#00A878" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
      ))}
      <path d={strand(0)} fill="none" stroke="url(#aboutStrand)" strokeWidth="4" strokeLinecap="round" />
      <path d={strand(Math.PI)} fill="none" stroke="url(#aboutStrand)" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.65" />

      {/* Sprouting leaf: growth and renewal */}
      <path d="M120 66 C120 44 134 30 154 28 C154 48 142 62 120 66 Z" fill="#00A878" fillOpacity="0.85" />
      <path d="M120 66 C124 54 132 44 144 36" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" />

      {/* Orbiting molecules */}
      {[
        { x: 28, y: 40, r: 6, d: 0 },
        { x: 212, y: 64, r: 8, d: 0.7 },
        { x: 34, y: 170, r: 5, d: 1.4 },
        { x: 208, y: 168, r: 6, d: 2.1 },
      ].map((n) => (
        <motion.circle
          key={`${n.x}-${n.y}`}
          cx={n.x} cy={n.y} r={n.r}
          fill="none" stroke="#00A878" strokeWidth="2"
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 3, delay: n.d, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <path d="M28 46 L52 66 M212 72 L190 80 M34 165 L58 148 M208 162 L186 150" stroke="#00A878" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function AboutHero() {
  return (
    <section className="relative bg-about-hero-cyan overflow-hidden border-b border-about-border">
      {/* Background Subtle Elements */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[radial-gradient(ellipse_at_center,_#EAF8F7_0%,_transparent_70%)] opacity-80 blur-[60px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-[radial-gradient(ellipse_at_center,_#DDE8EC_0%,_transparent_70%)] opacity-40 blur-[80px]"></div>

        {/* Subtle Molecular SVG Pattern */}
        <svg className="absolute top-0 right-0 w-full h-full opacity-10" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
          <g stroke="#00A878" strokeWidth="1" fill="none">
            <circle cx="650" cy="150" r="40" />
            <circle cx="750" cy="250" r="30" />
            <circle cx="550" cy="300" r="50" />
            <path d="M650 190 L750 220" />
            <path d="M610 270 L550 300" />
            <path d="M650 190 L610 270" />
          </g>
        </svg>
      </div>

      <div className="max-w-[1240px] mx-auto px-6 sm:px-8 relative z-10 pt-16 pb-12 lg:pt-24 lg:pb-16">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8">

          {/* LEFT CONTENT */}
          <div className="w-full lg:w-[55%] flex flex-col items-start text-left">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-about-green bg-white/50 backdrop-blur-sm mb-6"
            >
              <User size={14} className="text-about-green" />
              <span className="text-[11px] font-bold tracking-[0.1em] text-about-green uppercase">
                About BioGen AI
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-[36px] sm:text-[44px] lg:text-[54px] font-[750] text-about-navy-head leading-[1.1] mb-6 tracking-tight"
            >
              A Student-Led Initiative<br />
              for a <span className="text-about-green">Healthier Tomorrow.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-[16px] text-about-text leading-[1.6] max-w-[570px] mb-12"
            >
              BioGen AI is a research-focused platform that combines computational protein design, simulation, and analysis tools to make advanced biotechnology more accessible for researchers, students, and the scientific community.
            </motion.p>
          </div>

          {/* RIGHT CONTENT: VISUAL */}
          <div className="w-full lg:w-[45%] relative min-h-[300px] lg:min-h-[420px] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="relative w-full h-full max-w-[480px] aspect-[4/3] rounded-[16px] bg-about-bg border border-about-border shadow-sm overflow-hidden flex items-center justify-center group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-about-hero-cyan to-[#D0EAEA] opacity-50 mix-blend-multiply"></div>

              <HealthHelixArt />

              {/* Floating Drug Candidates Card */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-4 -left-4 lg:bottom-4 lg:left-4 bg-white rounded-[14px] p-5 shadow-[0_8px_30px_rgba(7,26,61,0.08)] border border-about-border w-[220px] z-20"
              >
                <h4 className="text-[13px] font-bold text-about-navy mb-3">Drug Candidates</h4>
                <ul className="flex flex-col gap-2.5">
                  {[
                    "AI-generated peptides",
                    "Target-specific design",
                    "High binding potential",
                    "Faster discovery"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-about-green shrink-0" />
                      <span className="text-[12px] text-about-text font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Handwritten annotation */}
              <div className="absolute top-6 left-5 lg:top-6 lg:left-5 text-about-green font-['Caveat'] text-[20px] leading-tight rotate-[-6deg] z-20 pointer-events-none drop-shadow-sm">
                AI discovers<br/>
                new possibilities<br/>
                for better<br/>
                therapeutics
                <svg className="absolute -bottom-6 right-0 w-8 h-8 text-about-green rotate-[70deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>

            </motion.div>
          </div>
        </div>

        {/* Feature Strip */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mt-16 pt-10 border-t border-about-border/60"
        >
          {[
            { icon: <BookOpen size={20} strokeWidth={2} />, title: "Research\nDriven" },
            { icon: <UsersRound size={20} strokeWidth={2} />, title: "Student\nLed" },
            { icon: <Code2 size={20} strokeWidth={2} />, title: "Open\nScience" },
            { icon: <Leaf size={20} strokeWidth={2} />, title: "Real-World\nImpact" }
          ].map((item, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-[12px] bg-[#E2F7F1] text-about-green flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <span className="text-[14px] font-bold text-about-navy-head leading-tight whitespace-pre-line">
                {item.title}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
