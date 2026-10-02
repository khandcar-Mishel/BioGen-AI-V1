import { Github, Linkedin, Youtube } from "lucide-react";
import { BrandMark } from "../../components/BrandMark";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-bg-base border-t border-border-subtle pt-16 pb-8">
      <div className="max-w-[1240px] mx-auto px-6 sm:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">

          {/* Brand */}
          <div className="flex flex-col gap-4">
            <Link to="/" className="flex items-center gap-3">
              <BrandMark size={34} />
              <div className="flex flex-col">
                <span className="font-bold text-[16px] leading-tight text-text-main">
                  BioGen AI
                </span>
                <span className="text-[10px] tracking-wide font-medium text-text-soft">
                  Generative Protein Design for Research
                </span>
              </div>
            </Link>
            <p className="text-text-soft text-[13px] font-medium mt-1">
              For Research. For a Healthier Tomorrow.
            </p>
          </div>

          {/* Navigation & Socials */}
          <div className="flex flex-col md:items-end gap-6">
            <nav className="flex flex-wrap gap-x-6 gap-y-2">
              {['Home', 'RFdiffusion', 'Screening', 'MD Simulation', 'About Us'].map((item) => {
                const path = item === 'Home' ? '/' : item === 'About Us' ? '/about' : `/${item.toLowerCase().replace(' ', '-')}`;
                return (
                  <Link
                    key={item}
                    to={path}
                    className="text-[13px] font-semibold text-text-main hover:text-bio-green transition-colors"
                  >
                    {item}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/RosettaCommons/RFdiffusion"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted-light hover:text-text-main transition-colors"
                title="GitHub Repository"
              >
                <Github size={18} strokeWidth={2} />
              </a>
              <a
                href="https://www.linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted-light hover:text-text-main transition-colors"
                title="LinkedIn"
              >
                <Linkedin size={18} strokeWidth={2} />
              </a>
              <a
                href="https://www.youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted-light hover:text-text-main transition-colors"
                title="YouTube"
              >
                <Youtube size={18} strokeWidth={2} />
              </a>
            </div>
          </div>
        </div>

        <div className="w-full h-[1px] bg-border-subtle mb-6" />

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[12px] text-text-muted-light">
            © 2025 BioGen AI. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link to="/about" className="text-[12px] text-text-muted-light hover:text-text-main transition-colors">Privacy Policy</Link>
            <span className="text-border-subtle text-[10px]">|</span>
            <Link to="/about" className="text-[12px] text-text-muted-light hover:text-text-main transition-colors">Terms of Service</Link>
            <span className="text-border-subtle text-[10px]">|</span>
            <span className="text-[12px] text-text-muted-light font-medium">Research Use Only</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
