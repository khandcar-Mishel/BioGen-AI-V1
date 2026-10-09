import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { LiveBackboneIcon, LiveFlaskIcon, LiveAtomIcon } from "./ui/LiveIcons";

const tools = [
  {
    id: "rfdiffusion",
    path: "/rfdiffusion",
    badge: "Protein Design",
    badgeColor: "text-primary bg-primary/10 border-primary/25",
    liveIcon: LiveBackboneIcon,
    iconColor: "text-primary",
    iconBg: "bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 shadow-[0_0_15px_rgba(15,167,127,0.15)]",
    title: "RFdiffusion",
    tagline: "De Novo Backbone Generator",
    description: "Generate stable de novo protein and peptide backbones conditioned on target binding hotspots.",
    buttonColor: "bg-primary hover:bg-primary-dark shadow-[0_4px_16px_rgba(15,167,127,0.22)]",
    image: "/rfdiffusion-1.png",
    features: [
      "De novo backbone generation",
      "Target-conditioned binder design",
      "Atomic-resolution PDB outputs"
    ]
  },
  {
    id: "screening",
    path: "/screening",
    badge: "Assay Suite",
    badgeColor: "text-purple bg-purple/10 border-purple/25",
    liveIcon: LiveFlaskIcon,
    iconColor: "text-purple",
    iconBg: "bg-gradient-to-br from-purple/20 to-purple/5 border border-purple/20 shadow-[0_0_15px_rgba(104,76,223,0.15)]",
    title: "Screening",
    tagline: "Bio-Assay & Safety Profiler",
    description: "Screen candidates with 10+ in-silico assays to predict toxicity, allergenicity, and developability.",
    buttonColor: "bg-purple hover:bg-[#563bbd] shadow-[0_4px_16px_rgba(104,76,223,0.22)]",
    image: "/screening_hero.png",
    features: [
      "Toxicity & allergenicity prediction",
      "Stability & solubility assessment",
      "Automated developability ranking"
    ]
  },
  {
    id: "md-simulation",
    path: "/md-simulation",
    badge: "Dynamics",
    badgeColor: "text-blue bg-blue/10 border-blue/25",
    liveIcon: LiveAtomIcon,
    iconColor: "text-blue",
    iconBg: "bg-gradient-to-br from-blue/20 to-blue/5 border border-blue/20 shadow-[0_0_15px_rgba(15,124,223,0.15)]",
    title: "MD Simulation",
    tagline: "All-Atom Trajectory Analysis",
    description: "Simulate time-resolved conformational stability and binding kinetics in explicit solvent.",
    buttonColor: "bg-blue hover:bg-[#0c66b8] shadow-[0_4px_16px_rgba(15,124,223,0.22)]",
    image: "/md_simu-hero.png",
    features: [
      "Structural stability (RMSD & RMSF)",
      "Explicit water & ionic solvation",
      "Time-resolved conformational insights"
    ]
  }
];

export default function ToolsSection() {
  return (
    <section id="tools" className="py-12 md:py-18 scroll-mt-20">
      {/* Sleek Compact Section Header */}
      <div className="text-center mb-10 md:mb-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold uppercase tracking-wider mb-3"
        >
          <Sparkles size={12} />
          Integrated Computational Suite
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.05 }}
          className="text-2xl sm:text-3xl lg:text-[38px] font-extrabold text-navy mb-2.5 tracking-tight"
        >
          Explore <span className="text-primary">Our Research Tools</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-text-secondary text-sm sm:text-base max-w-xl mx-auto"
        >
          A unified pipeline to design, screen, and simulate therapeutic proteins with cloud-accelerated intelligence.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-7">
        {tools.map((tool, index) => (
          <motion.div
            key={tool.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.12, duration: 0.45 }}
            className="group bg-white rounded-2xl border border-border-main p-5 sm:p-6 card-shadow transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_rgba(7,26,51,0.1)] hover:border-primary/30 flex flex-col h-full relative"
          >
            {/* Redesigned Compact Header: Scientific Live Icon + Clean Tool Name Lockup */}
            <div className="flex items-center gap-3.5 mb-3.5">
              <div className={`w-11 h-11 p-2 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${tool.iconBg}`}>
                <tool.liveIcon size={22} className={tool.iconColor} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[18px] sm:text-[19px] font-bold text-navy group-hover:text-primary transition-colors tracking-tight truncate">
                    {tool.title}
                  </h3>
                  <span className={`text-[9.5px] font-extrabold tracking-wider px-2 py-0.5 rounded-full uppercase border shrink-0 ${tool.badgeColor}`}>
                    {tool.badge}
                  </span>
                </div>
                <p className="text-[12px] font-medium text-text-soft truncate mt-0.5">
                  {tool.tagline}
                </p>
              </div>
            </div>

            <p className="text-[13px] text-text-secondary leading-relaxed mb-4 flex-1">
              {tool.description}
            </p>

            {/* Tool hero image, same artwork as the tool's own page */}
            <div className="w-full aspect-[16/10] rounded-xl mb-4.5 flex items-center justify-center bg-bg-soft/60 border border-border-light/70 overflow-hidden">
              <img
                src={tool.image}
                alt={`${tool.title} preview`}
                loading="lazy"
                className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
              />
            </div>

            {/* Feature Checklist */}
            <div className="flex flex-col gap-2 mb-5 bg-bg-soft/60 p-3 rounded-xl border border-border-light/70">
              {tool.features.map((feature, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 size={15} className={`shrink-0 ${tool.iconColor}`} />
                  <span className="text-[12.5px] font-medium text-navy/85 leading-tight">{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <Link
              to={tool.path}
              className={`w-full flex items-center justify-center gap-2 text-white font-semibold py-3 rounded-xl transition-all hover:brightness-110 active:scale-[0.98] mt-auto text-[14px] ${tool.buttonColor}`}
            >
              Get Started <ArrowRight size={16} />
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
