import { motion } from 'framer-motion';
import { Github, FlaskConical, Code2 } from 'lucide-react';

export default function AboutTeam() {
  const team = [
    {
      name: "Khandcar Mishel",
      badge: "Founder",
      role: "CADD & Bioinformatic Researcher",
      description: "Passionate about computational biology, protein design, and the intersection of pharmacy and artificial intelligence.",
      github: "https://github.com/khandcar-Mishel",
      tagsIcon: <FlaskConical size={16} strokeWidth={2} />,
      tagsText: "Computational Biology | Protein Design"
    },
    {
      name: "Tanvir Hasan Abir",
      badge: "Web Developer",
      role: "Full Stack AI Engineer",
      description: "Builds intuitive and scalable web applications to make computational tools accessible to researchers.",
      github: "https://github.com/thabir303",
      tagsIcon: <Code2 size={16} strokeWidth={2} />,
      tagsText: "Web Development | UI/UX"
    }
  ];

  return (
    <section className="bg-white pb-16 lg:pb-24">
      <div className="max-w-[1240px] mx-auto px-6 sm:px-8">

        <div className="mb-10 lg:mb-12">
          <h2 className="text-[30px] sm:text-[34px] font-[750] text-about-navy-head mb-3 tracking-tight">
            Meet the Team
          </h2>
          <p className="text-[16px] text-about-text max-w-[700px]">
            A small but passionate team working to bring computational protein design to the research community.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {team.map((member, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="bg-white border border-about-border rounded-[12px] p-5 sm:p-6 flex flex-col sm:flex-row gap-6 shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              <div className="w-full sm:w-[145px] h-[200px] shrink-0 rounded-[10px] overflow-hidden bg-about-bg">
                {member.name === "Khandcar Mishel" ? <img src="/kh-mishel.jpeg" alt="Khandcar Mishel" className="w-full h-full object-cover" /> : <div role="img" aria-label={member.name} className="w-full h-full flex items-center justify-center bg-about-cyan text-about-green text-5xl font-semibold">{member.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div>}
              </div>

              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-[20px] font-[750] text-about-navy-head">
                    {member.name}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-about-cyan text-about-green text-[11px] font-bold tracking-wide uppercase">
                    {member.badge}
                  </span>
                </div>

                <h4 className="text-[14px] font-medium text-about-text mb-4">
                  {member.role}
                </h4>

                <p className="text-[14px] text-about-text leading-[1.6] mb-6 flex-1">
                  {member.description}
                </p>

                <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-about-border/50">
                  <a href={member.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[13px] font-semibold text-about-navy hover:text-about-green transition-colors w-fit">
                    <Github size={16} strokeWidth={2} />
                    View GitHub Profile &rarr;
                  </a>

                  <div className="flex items-center gap-2 text-[13px] text-about-muted">
                    {member.tagsIcon}
                    <span>{member.tagsText}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
