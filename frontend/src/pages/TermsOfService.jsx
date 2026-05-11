import React from 'react';
import { ScrollText, CheckCircle, AlertCircle, RefreshCw, Mail, ArrowLeft, Shield, Zap, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';

const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@400;500;600&display=swap');
.terms-page { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
.terms-page h1, .terms-page h2, .terms-page h3 { font-family: 'Plus Jakarta Sans', sans-serif; }
.premium-card { background: #ffffff; border-radius: 3rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 40px 100px rgba(0,0,0,0.03); }
.section-badge { background: #356854; color: white; width: 2.5rem; height: 2.5rem; border-radius: 1rem; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.875rem; }
.warning-strip { background: rgba(244, 63, 94, 0.04); border-left: 4px solid #f43f5e; padding: 1.5rem; border-radius: 1rem; }
`;

const TermsOfService = () => {
  return (
    <div className="terms-page min-h-screen py-20 px-6 relative overflow-hidden">
      <style>{DS_STYLE}</style>
      
      {/* Abstract Background Decoration */}
      <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[150px] -ml-96 -mt-96 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[150px] -mr-96 -mb-96 pointer-events-none" />

      <div className="max-w-4xl mx-auto relative">
        <Link to="/" className="inline-flex items-center gap-3 text-[#356854] font-black uppercase tracking-widest text-[10px] mb-12 hover:opacity-70 transition-all">
          <ArrowLeft size={18} /> Voltar para o início
        </Link>

        <div className="premium-card overflow-hidden">
          <header className="p-12 md:p-16 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-20 h-20 bg-white shadow-xl shadow-emerald-900/5 rounded-3xl flex items-center justify-center text-[#356854] border border-emerald-100/50">
                <ScrollText size={40} />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight leading-none mb-2">Termos de Uso</h1>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Condições e Acordos ProspectAI Enterprise</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
              <CheckCircle size={14} className="text-emerald-500" /> Atualizado em: Março de 2026
            </div>
          </header>
          
          <div className="p-12 md:p-16 space-y-16 text-slate-600 leading-relaxed">
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-4 mb-6">
                <div className="section-badge">01</div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Acordo de Utilização</h2>
              </div>
              <p className="text-lg font-medium text-slate-500 mb-6">
                Ao acessar e utilizar a ProspectAI, você concorda legalmente com os termos aqui descritos. Este ecossistema foi desenvolvido para potencializar vendas através de inteligência artificial, exigindo conformidade absoluta com as leis de proteção de dados.
              </p>
            </section>

            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
              <div className="flex items-center gap-4 mb-8">
                <div className="section-badge">02</div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Escopo Tecnológico</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  { icon: Shield, title: "Compliance", desc: "Segurança de dados e LGPD." },
                  { icon: Zap, title: "Escala", desc: "Automação via IA avançada." },
                  { icon: RefreshCw, title: "Sincronia", desc: "Integração nativa Google." }
                ].map((item, i) => (
                  <div key={i} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 text-center">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#356854] mx-auto mb-4 shadow-sm"><item.icon size={24} /></div>
                    <h3 className="font-black text-slate-800 text-xs mb-2">{item.title}</h3>
                    <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-tight">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
              <div className="flex items-center gap-4 mb-6">
                <div className="section-badge">03</div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Ética e Conformidade</h2>
              </div>
              <p className="font-medium text-slate-500 mb-8">
                Nossa plataforma promove o relacionamento interpessoal inteligente. O uso de técnicas de SPAM, mensagens em massa não solicitadas ou qualquer prática que viole os termos de uso do WhatsApp resultará no bloqueio imediato da conta sem aviso prévio.
              </p>
              <div className="warning-strip flex items-start gap-5">
                <AlertCircle size={28} className="text-rose-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-rose-800 uppercase tracking-widest mb-1">Políticas Anti-Spam</h4>
                  <p className="text-xs font-bold text-rose-900/60 leading-relaxed italic">
                    "Monitoramos proativamente o índice de denúncias e o comportamento conversacional para garantir a integridade da rede e a reputação das nossas instâncias."
                  </p>
                </div>
              </div>
            </section>

            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
              <div className="flex items-center gap-4 mb-6">
                <div className="section-badge">04</div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Soberania dos Dados</h2>
              </div>
              <p className="font-medium text-slate-500 mb-6">
                Você mantém a propriedade integral sobre todos os leads e conversas processados. A ProspectAI atua como operadora dos dados, implementando as melhores práticas de criptografia e backup redundante.
              </p>
            </section>

            <footer className="pt-12 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <Mail size={20} className="text-[#356854]" />
                <span className="text-xs font-black text-slate-700">juridico@prospectai.com</span>
              </div>
              <div className="flex items-center gap-3">
                <Globe size={16} className="text-slate-300" />
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">© 2026 PROSPECTAI ENTERPRISE</p>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;