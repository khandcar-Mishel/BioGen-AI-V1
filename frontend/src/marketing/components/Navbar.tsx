import Modal from './Modal';
import { BrandMark } from '../../components/BrandMark';
import { useState, useEffect } from 'react';
import { Search, ArrowRight, Menu, X, Dna, FlaskConical, Waves, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const navLinks = [
  { name: 'Home', path: '/' },
  { name: 'RFdiffusion', path: '/rfdiffusion' },
  { name: 'Screening', path: '/screening' },
  { name: 'MD Simulation', path: '/md-simulation' },
  { name: 'About Us', path: '/about' },
];

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/';
  const isTransparent = isHomePage && !isScrolled;

  const searchResults = [
    { title: 'RFdiffusion Workspace', desc: 'Design novel protein backbones interactively with 3Dmol.js', path: '/rfdiffusion/studio', icon: Dna },
    { title: 'RFdiffusion Studio', desc: 'Generative protein design pipeline and model architecture', path: '/rfdiffusion', icon: Dna },
    { title: 'Peptide Screening Studio', desc: 'Safety, toxicity, allergenicity, and stability prediction tools', path: '/screening', icon: FlaskConical },
    { title: 'Molecular Dynamics Studio', desc: 'Atomic-resolution trajectory simulation and conformational insights', path: '/md-simulation', icon: Waves },
    { title: 'About BioGen AI', desc: 'Mission, values, and core research team behind BioGen AI', path: '/about', icon: Info },
  ].filter(item =>
    searchQuery === '' ||
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
        isTransparent
          ? 'bg-transparent border-transparent h-[72px]'
          : 'bg-white/95 backdrop-blur-md border-border-subtle h-[68px] shadow-[0_4px_20px_rgba(16,24,40,0.02)]'
      }`}
    >
      <div className="max-w-[1240px] mx-auto px-6 sm:px-8 h-full flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <BrandMark size={36} className="group-hover:scale-105 transition-transform" />
          <div className="flex flex-col">
            <span className={`font-bold text-[17px] leading-tight ${isTransparent ? 'text-white' : 'text-text-main'} transition-colors`}>
              BioGen AI
            </span>
            <span className={`text-[10px] tracking-wide font-medium ${isTransparent ? 'text-white/70' : 'text-text-soft'} transition-colors`}>
              Generative Protein Design for Research
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden xl:flex items-center gap-8">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.name}
                to={link.path}
                className={`relative text-[14px] font-semibold transition-colors hover:text-bio-green ${
                  isActive
                    ? 'text-bio-green'
                    : isTransparent ? 'text-white/90' : 'text-text-main'
                }`}
              >
                {link.name}
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute -bottom-[2px] left-0 right-0 h-[2px] bg-bio-green rounded-full"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="hidden xl:flex items-center gap-4">
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            aria-label="Search BioGen AI"
            className={`p-2 transition-colors hover:text-bio-green cursor-pointer ${isTransparent ? 'text-white/90' : 'text-text-soft'}`}
          >
            <Search size={18} strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={() => navigate('/rfdiffusion/studio/settings')}
            className={`flex items-center gap-2 text-[14px] font-semibold px-2 py-2 transition-colors hover:text-bio-green cursor-pointer ${isTransparent ? 'text-white' : 'text-text-main'}`}
          >
            Connection
          </button>

          <Link
            to="/#tools"
            className="flex items-center gap-1.5 bg-bio-green hover:bg-bio-green-dark text-white text-[14px] font-semibold px-4 py-2.5 rounded-[8px] transition-all card-shadow-hover hover:-translate-y-[1px]"
          >
            Get Started
            <ArrowRight size={16} strokeWidth={2} />
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className={`xl:hidden p-2 rounded-lg backdrop-blur-sm ${isTransparent ? 'text-white bg-white/10' : 'text-text-main bg-bg-soft'}`}
          aria-label="Toggle navigation" aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-full left-0 right-0 bg-white border-b border-border-subtle shadow-lg p-6 xl:hidden flex flex-col gap-4"
          >
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                className={`text-[15px] font-semibold py-2 border-b border-border-subtle/50 ${
                  location.pathname === link.path ? 'text-bio-green' : 'text-text-main'
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.name}
              </Link>
            ))}
            <div className="pt-4 flex flex-col gap-3">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsSearchOpen(true);
                }}
                className="flex items-center justify-center gap-2 text-text-main text-[15px] font-semibold py-3 rounded-[8px] border border-border-subtle"
              >
                <Search size={16} /> Search Tools & Structures
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/rfdiffusion/studio/settings');
                }}
                className="flex items-center justify-center gap-2 text-text-main text-[15px] font-semibold py-3 rounded-[8px] border border-border-subtle"
              >
                Connection settings
              </button>
              <Link
                to="/#tools"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 bg-bio-green text-white text-[15px] font-semibold py-3 rounded-[8px]"
              >
                Get Started <ArrowRight size={18} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spotlight Search Modal */}
      <AnimatePresence>
        {isSearchOpen && (
          <Modal label="Search BioGen AI" onClose={() => setIsSearchOpen(false)} className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-border-subtle overflow-hidden"
            >
              <div className="p-4 border-b border-border-subtle flex items-center gap-3">
                <Search size={20} className="text-text-soft shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search tools and workflows (e.g. RFdiffusion, Screening)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-base font-medium text-text-main placeholder:text-text-soft focus:outline-none"
                />
                <button
                  onClick={() => setIsSearchOpen(false)}
                  aria-label="Close search biogen ai"
                  className="p-1 rounded-md text-text-soft hover:text-text-main hover:bg-bg-alt"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[360px] overflow-y-auto p-2">
                <div className="px-3 py-1.5 text-[11px] font-bold text-text-soft uppercase tracking-wider">
                  Suggestions & Quick Navigation
                </div>
                {searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setIsSearchOpen(false);
                      navigate(item.path);
                    }}
                    className="w-full text-left p-3 rounded-xl hover:bg-[#F2FBF7] transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-bg-pale-mint text-bio-green flex items-center justify-center shrink-0">
                        <item.icon size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-text-main group-hover:text-bio-green transition-colors">
                          {item.title}
                        </div>
                        <div className="text-xs text-text-soft">
                          {item.desc}
                        </div>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-text-soft group-hover:text-bio-green group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

    </header>
  );
}
