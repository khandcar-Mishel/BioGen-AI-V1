import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, ChevronDown, Github, MessageSquare, Mail, Lightbulb, CheckCircle2 } from 'lucide-react';

const CONTACT_EMAIL = 'mishel.bioinfo@gmail.com';
// Web3Forms delivers the message to CONTACT_EMAIL. The key is public by design; without it the form falls back to mailto:.
const WEB3FORMS_KEY = import.meta.env.VITE_WEB3FORMS_KEY as string | undefined;

export default function AboutContact() {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', subject: 'general', message: '' });
  return (
    <section className="bg-white pb-20 lg:pb-32">
      <div className="max-w-[1240px] mx-auto px-6 sm:px-8">

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">

          {/* LEFT: Contact Form */}
          <div className="w-full lg:w-[55%]">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-[30px] sm:text-[34px] font-[750] text-about-navy-head mb-3 tracking-tight">
                Get in Touch
              </h2>
              <p className="text-[16px] text-about-text mb-8">
                Have questions, suggestions, or ideas? We'd love to hear from you.
              </p>

              {submitted ? (
                <div className="p-8 rounded-xl bg-bio-green-light border border-bio-green/20 text-center">
                  <div className="w-12 h-12 bg-white text-bio-green rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-about-navy-head mb-1">{WEB3FORMS_KEY ? 'Message sent' : 'Email draft prepared'}</h3>
                  <p className="text-sm text-about-text mb-4">
                    {WEB3FORMS_KEY
                      ? "Thanks for reaching out. We'll get back to you at the email you provided."
                      : 'Your email client should open with your message. Send the draft there to complete your inquiry.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setFormData({ name: '', email: '', subject: 'general', message: '' });
                    }}
                    className="text-xs font-semibold text-about-green hover:underline cursor-pointer"
                  >
                    Send another message &rarr;
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const subject = `[BioGen AI] ${formData.subject}`;
                    if (!WEB3FORMS_KEY) {
                      const body = encodeURIComponent(`${formData.message}\n\n— ${formData.name} (${formData.email})`);
                      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${body}`;
                      setSubmitted(true);
                      return;
                    }
                    setSending(true);
                    setError('');
                    try {
                      const res = await fetch('https://api.web3forms.com/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                        body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject, from_name: formData.name, name: formData.name, email: formData.email, message: formData.message }),
                      });
                      const result = await res.json();
                      if (!res.ok || !result.success) throw new Error(result.message || 'Request failed');
                      setSubmitted(true);
                    } catch {
                      setError(`We couldn't send your message. Please email ${CONTACT_EMAIL} directly.`);
                    } finally {
                      setSending(false);
                    }
                  }}
                  className="flex flex-col gap-5"
                >
                  <div className="flex flex-col sm:flex-row gap-5">
                    <div className="flex-1">
                      <label htmlFor="name" className="sr-only">Name</label>
                      <input
                        type="text"
                        id="name"
                        required
                        placeholder="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-white border border-about-border rounded-[8px] px-4 py-3.5 text-[15px] text-about-navy placeholder:text-about-muted focus:outline-none focus:border-about-green transition-colors"
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="email" className="sr-only">Email</label>
                      <input
                        type="email"
                        id="email"
                        required
                        placeholder="Email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-white border border-about-border rounded-[8px] px-4 py-3.5 text-[15px] text-about-navy placeholder:text-about-muted focus:outline-none focus:border-about-green transition-colors"
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <label htmlFor="subject" className="sr-only">Subject</label>
                    <select
                      id="subject"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full bg-white border border-about-border rounded-[8px] px-4 py-3.5 text-[15px] text-about-navy focus:outline-none focus:border-about-green transition-colors appearance-none"
                    >
                      <option value="general">General Inquiry</option>
                      <option value="research">Research Collaboration</option>
                      <option value="feedback">Platform Feedback</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-about-muted">
                      <ChevronDown size={18} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="message" className="sr-only">Message</label>
                    <textarea
                      id="message"
                      rows={6}
                      required
                      placeholder="Your message..."
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full bg-white border border-about-border rounded-[8px] px-4 py-3.5 text-[15px] text-about-navy placeholder:text-about-muted focus:outline-none focus:border-about-green transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full bg-about-green hover:bg-about-green-sec text-white font-semibold text-[15px] py-4 rounded-[8px] flex items-center justify-center gap-2 transition-all hover:-translate-y-[1px] shadow-sm mt-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    <Send size={18} />
                    {sending ? 'Sending…' : WEB3FORMS_KEY ? 'Send Message' : 'Prepare Email'}
                  </button>

                  {error && <p role="alert" className="text-center text-[13px] text-red-600">{error}</p>}

                  <p className="text-center text-[13px] text-about-muted mt-2">
                    We typically respond within 2–3 business days.
                  </p>
                </form>
              )}
            </motion.div>
          </div>

          {/* RIGHT: Information Cards */}
          <div className="w-full lg:w-[45%] flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="bg-about-cyan rounded-[14px] p-8 border border-about-border/50 relative overflow-hidden"
            >
              {/* Subtle Decorative Hexagons */}
              <svg className="absolute -bottom-8 -right-8 w-48 h-48 opacity-[0.03] text-about-navy pointer-events-none" viewBox="0 0 100 100">
                <path fill="currentColor" d="M50 0L93.3 25V75L50 100L6.7 75V25L50 0Z" />
              </svg>

              <h3 className="text-[20px] font-[750] text-about-navy-head mb-8">
                Other Ways to Connect
              </h3>

              <div className="flex flex-col gap-8 relative z-10">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-about-navy shrink-0 shadow-sm border border-about-border/50">
                    <Github size={20} strokeWidth={2} />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-bold text-about-navy-head mb-1"><a href="https://github.com/khandcar-Mishel/BioGenesis-AI-V1" className="hover:underline">GitHub</a></h4>
                    <p className="text-[14px] text-about-text leading-[1.5]">Check out our repositories, open issues, or start a discussion.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-about-green shrink-0 shadow-sm border border-about-border/50">
                    <MessageSquare size={20} strokeWidth={2} />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-bold text-about-navy-head mb-1"><a href="https://github.com/khandcar-Mishel/BioGenesis-AI-V1/discussions" className="hover:underline">Discussions</a></h4>
                    <p className="text-[14px] text-about-text leading-[1.5]">We are open to collaborations, research discussions, and feedback from the community.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-about-green shrink-0 shadow-sm border border-about-border/50">
                    <Mail size={20} strokeWidth={2} />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-bold text-about-navy-head mb-1"><a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">General Inquiries</a></h4>
                    <p className="text-[14px] text-about-text leading-[1.5]">Feel free to reach out through the contact form.</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-about-hero-cyan rounded-[14px] p-8 border border-about-border/50 flex flex-col sm:flex-row gap-5 items-start"
            >
              <div className="w-12 h-12 rounded-[12px] bg-white flex items-center justify-center text-about-green shrink-0 shadow-sm border border-about-border/50">
                <Lightbulb size={24} strokeWidth={2} />
              </div>
              <div>
                <h4 className="text-[16px] font-bold text-about-navy-head mb-2">
                  Have a Question or Feature Request?
                </h4>
                <p className="text-[14px] text-about-text leading-[1.6] mb-5">
                  Help us improve BioGen AI! Share your ideas, report issues, or suggest new features on our GitHub.
                </p>
                <a
                  href="https://github.com/khandcar-Mishel/BioGenesis-AI-V1/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white hover:bg-about-bg text-about-green font-semibold text-[14px] py-2 px-4 rounded-[6px] border border-about-green transition-colors inline-flex items-center gap-2"
                >
                  Open GitHub Issues &rarr;
                </a>
              </div>
            </motion.div>

          </div>

        </div>

      </div>
    </section>
  );
}
