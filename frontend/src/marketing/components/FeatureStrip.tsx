import { motion } from "framer-motion";
import { LiveAcademicIcon, LiveFlaskIcon, LiveCloudIcon } from "./ui/LiveIcons";

const features = [
  {
    liveIcon: LiveAcademicIcon,
    title: "Researchers & Students",
    subtitle: "Open Academic Access",
    iconColor: "text-bio-green",
    badgeBg: "bg-bio-green-light border-bio-green/20",
    status: "Active",
  },
  {
    liveIcon: LiveFlaskIcon,
    title: "3 Unified AI Tools",
    subtitle: "Design, Screen & Simulate",
    iconColor: "text-purple",
    badgeBg: "bg-purple-light border-purple/20",
    status: "Pipeline",
  },
  {
    liveIcon: LiveCloudIcon,
    title: "Zero GPU Limitations",
    subtitle: "Serverless Cloud Clusters",
    iconColor: "text-blue",
    badgeBg: "bg-cyan-light border-blue/20",
    status: "Modal A10G",
  }
];

export default function FeatureStrip() {
  return (
    <div className="relative z-20 -mt-[36px] mb-20 px-4 sm:px-0">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.6 }}
        className="bg-white/95 backdrop-blur-md rounded-[20px] shadow-[0_12px_40px_rgba(7,26,51,0.08)] border border-border-light p-5 md:p-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-center">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -2 }}
              className="flex items-center gap-4 p-2.5 rounded-xl transition-all duration-200 hover:bg-bg-soft/70 relative group"
            >
              {/* Premium Live Icon Capsule */}
              <div className="relative shrink-0">
                <div className={`w-13 h-13 rounded-2xl flex items-center justify-center p-3 border shadow-sm transition-transform group-hover:scale-105 ${feature.badgeBg}`}>
                  <feature.liveIcon size={26} className={feature.iconColor} />
                </div>
              </div>

              {/* Text content */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-[14px] font-bold text-navy leading-tight truncate">
                    {feature.title}
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-semibold text-text-soft">
                    {feature.subtitle}
                  </span>
                </div>
              </div>

              {/* Subtle divider */}
              {i < features.length - 1 && (
                <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[1px] h-9 bg-border-light/80" />
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
