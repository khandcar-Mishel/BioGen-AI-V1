import { motion } from 'framer-motion';

interface LiveIconProps {
  className?: string;
  size?: number;
  color?: string;
  pulseColor?: string;
}

// 1. Live DNA / Generative Backbone Icon
export function LiveDnaIcon({ size = 24, className = "text-primary", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {/* Ambient breathing glow */}
      <span className="absolute inset-0 rounded-full bg-primary/20 blur-[6px] animate-pulse" style={{ animationDuration: '3s' }} />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <motion.path
          d="m8 3 4 8 5-5 5 15-4-8-5 5Z"
          animate={{ scale: [1, 1.05, 1], rotate: [0, 2, -2, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.circle
          cx="4" cy="4" r="2" fill={color}
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.circle
          cx="20" cy="20" r="2" fill={color}
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.5, delay: 1, repeat: Infinity, ease: "easeInOut" }}
        />
        <path d="m14 12-8.5 8.5" />
        <path d="m4 11 9 9" />
      </svg>
      {/* Live orbit point */}
      <motion.span
        className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10A875]"
        animate={{
          x: [-size/3, size/3, -size/3],
          y: [-size/4, size/4, -size/4]
        }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// 2. Live Screening / Flask Bio-Assay Icon
export function LiveFlaskIcon({ size = 24, className = "text-purple", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-purple/20 blur-[6px] animate-pulse" style={{ animationDuration: '3s' }} />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <path d="M10 2v7.31L4.17 19.34A2 2 0 0 0 5.89 22h12.22a2 2 0 0 0 1.72-2.66L14 9.31V2" />
        <path d="M8.5 2h7" />
        <motion.path
          d="M7 16h10"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
      {/* Floating reactant bubbles */}
      <motion.span
        className="absolute w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_#684CDF]"
        animate={{ y: [size/4, -size/8, -size/3], opacity: [0, 1, 0], scale: [0.6, 1, 0.4] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.span
        className="absolute w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_4px_#4DD0D1]"
        style={{ left: size/2 + 2 }}
        animate={{ y: [size/5, -size/10, -size/3.5], opacity: [0, 0.9, 0], scale: [0.5, 0.9, 0.3] }}
        transition={{ duration: 2.7, delay: 0.8, repeat: Infinity, ease: "easeOut" }}
      />
    </div>
  );
}

// 3. Live Atom / Dynamics Icon
export function LiveAtomIcon({ size = 24, className = "text-blue" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-blue/20 blur-[6px] animate-pulse" style={{ animationDuration: '3s' }} />
      {/* Nucleus */}
      <motion.div
        className="w-2 h-2 rounded-full bg-blue shadow-[0_0_8px_#2F80ED] relative z-10"
        animate={{ scale: [0.9, 1.25, 0.9] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Orbital Ring 1 */}
      <motion.div
        className="absolute inset-0 rounded-full border border-blue/40"
        animate={{ rotate: 360, scaleY: [0.45, 0.55, 0.45] }}
        transition={{ rotate: { duration: 5, repeat: Infinity, ease: "linear" }, scaleY: { duration: 3, repeat: Infinity } }}
      >
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#4DD0D1]" />
      </motion.div>
      {/* Orbital Ring 2 */}
      <motion.div
        className="absolute inset-0 rounded-full border border-blue/40"
        style={{ rotate: '60deg' }}
        animate={{ rotate: [60, 420], scaleY: [0.5, 0.4, 0.5] }}
        transition={{ rotate: { duration: 6, repeat: Infinity, ease: "linear" }, scaleY: { duration: 3, repeat: Infinity } }}
      >
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10A875]" />
      </motion.div>
    </div>
  );
}

// 4. Live Cloud GPU / Serverless Icon
export function LiveCloudIcon({ size = 24, className = "text-blue", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-cyan/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      </svg>
      {/* Pulsing data transmission wave */}
      <motion.span
        className="absolute w-2 h-2 rounded-full border border-cyan-400"
        style={{ bottom: 2, right: 4 }}
        animate={{ scale: [1, 2.4], opacity: [1, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
      />
      <span className="absolute w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ bottom: 2, right: 4 }} />
    </div>
  );
}

// 5. Live Shield / Safety Icon
export function LiveShieldIcon({ size = 24, className = "text-screen-green", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-emerald-500/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <motion.path
          d="m9 12 2 2 4-4"
          strokeDasharray="20"
          animate={{ strokeDashoffset: [20, 0, 0, 20] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" style={{ animationDuration: '2.5s' }} />
    </div>
  );
}

// 6. Live Target / Binder Precision Icon
export function LiveTargetIcon({ size = 24, className = "text-cyan-600", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-cyan/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" fill={color} />
      </svg>
      {/* Radar scanning ping */}
      <motion.div
        className="absolute inset-1 rounded-full border border-cyan-400"
        animate={{ scale: [0.4, 1.2], opacity: [0.9, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
      />
    </div>
  );
}

// 7. Live Wave / Dynamics Waveform Icon
export function LiveWaveIcon({ size = 24, className = "text-blue", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-blue/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <motion.path
          d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"
          animate={{ x: [-2, 2, -2] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.path
          d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"
          animate={{ x: [2, -2, 2] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.path
          d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"
          animate={{ x: [-1.5, 1.5, -1.5] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

// 8. Live Clock / Acceleration Icon
export function LiveClockIcon({ size = 24, className = "text-emerald-600", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-emerald-500/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      {/* Live sweeping tick */}
      <motion.span
        className="absolute w-1 h-3 bg-emerald-400 origin-bottom rounded-full"
        style={{ top: size/2 - 9, left: size/2 - 2 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      />
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute" />
    </div>
  );
}

// 9. Live Academic / Students Icon
export function LiveAcademicIcon({ size = 24, className = "text-bio-green", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-primary/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
        <path d="M22 10v6" />
        <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
      </svg>
      <motion.span
        className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10A875]"
        animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// 10. Live Globe / Open Science Icon
export function LiveGlobeIcon({ size = 24, className = "text-amber-600", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-amber-500/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <circle cx="12" cy="12" r="10" />
        <motion.path
          d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"
          animate={{ scaleX: [1, 0.7, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <path d="M2 12h20" />
      </svg>
      {/* Orbiting connection dot */}
      <motion.span
        className="absolute w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#F59E0B]"
        animate={{
          x: [size/3, -size/3, size/3],
          y: [-size/4, size/4, -size/4]
        }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// 11. Live Chart / Analytics Icon
export function LiveChartIcon({ size = 24, className = "text-cyan-600", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-cyan/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <path d="M3 3v18h18" />
        <motion.path
          d="m19 9-5 5-4-4-3 3"
          animate={{ strokeDashoffset: [20, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
        />
      </svg>
      <motion.span
        className="absolute w-2 h-2 rounded-full bg-cyan-400"
        style={{ top: size/3 - 2, right: size/4 }}
        animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      />
    </div>
  );
}

// 12. Live Settings / Computation Engine Icon
export function LiveSettingsIcon({ size = 24, className = "text-purple", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-purple/20 blur-[6px] animate-pulse" />
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative z-10"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </motion.svg>
    </div>
  );
}

// 13. Live Upload / Input Icon
export function LiveUploadIcon({ size = 24, className = "text-bio-green", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-emerald-500/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <motion.g
          animate={{ y: [-2, -6, -2] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </motion.g>
      </svg>
    </div>
  );
}

// 14. Live Rocket / Impact Icon
export function LiveRocketIcon({ size = 24, className = "text-blue", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-blue/20 blur-[6px] animate-pulse" />
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative z-10"
        animate={{ y: [-1, -3, -1], rotate: [-2, 2, -2] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </motion.svg>
      {/* Thrust particle spark */}
      <motion.span
        className="absolute w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#F59E0B]"
        style={{ bottom: 2, left: 2 }}
        animate={{ scale: [0.6, 1.4, 0.6], opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    </div>
  );
}

// 15. Live Coins / Cost Efficiency Icon
export function LiveCoinsIcon({ size = 24, className = "text-amber-600", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-amber-500/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <circle cx="8" cy="8" r="6" />
        <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
        <path d="M7 6h1v4" />
        <motion.path
          d="m16.71 13.88.7.71-2.82 2.82"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </svg>
      <motion.span
        className="absolute w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#F59E0B]"
        style={{ top: 2, right: 4 }}
        animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      />
    </div>
  );
}

// 16. Live Network / Interaction Icon
export function LiveNetworkIcon({ size = 24, className = "text-blue", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-blue/20 blur-[6px] animate-pulse" />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <rect x="16" y="16" width="6" height="6" rx="1" />
        <rect x="2" y="16" width="6" height="6" rx="1" />
        <rect x="9" y="2" width="6" height="6" rx="1" />
        <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
        <path d="M12 12V8" />
      </svg>
      {/* Data pulse moving along the bus */}
      <motion.span
        className="absolute w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#4DD0D1]"
        animate={{
          x: [-size/3, 0, size/3],
          opacity: [0.2, 1, 0.2]
        }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ top: size/2 - 1 }}
      />
    </div>
  );
}

// 17. Live Backbone Icon: a folding peptide chain with residue nodes
export function LiveBackboneIcon({ size = 24, className = "text-primary", color = "currentColor" }: LiveIconProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full bg-primary/20 blur-[6px] animate-pulse" style={{ animationDuration: '3s' }} />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
        <path d="M3 17c3-9 5-9 7-4s4 5 6-1 3-6 5-4" />
        <motion.circle
          cx="3" cy="17" r="1.6" fill={color}
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.circle
          cx="12" cy="14" r="1.6" fill={color}
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, delay: 0.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.circle
          cx="21" cy="9" r="1.6" fill={color}
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, delay: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}
