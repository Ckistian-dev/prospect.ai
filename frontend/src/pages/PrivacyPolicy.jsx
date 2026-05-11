import React from 'react';
import { Shield, Lock, Eye, Mail, ArrowLeft, User, CheckCircle, Database, Globe, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@400;500;600&display=swap');
.privacy-page { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
.privacy-page h1, .privacy-page h2, .privacy-page h3 { font-family: 'Plus Jakarta Sans', sans-serif; }
.premium-card { background: #ffffff; border-radius: 3rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 40px 100px rgba(0,0,0,0.03); }
.section-badge { background: #356854; color: white; width: 2.5rem; height: 2.5rem; border-radius: 1rem; display: flex; items-center; justify-content: center; font-weight: 800; font-size: 0.875rem; }
.info-strip { background: rgba(53, 104, 84, 0.04); border-left: 4px solid #356854; padding: 1.5rem; border-radius: 1rem; }
`;

const PrivacyPolicy = () => {
  return (
    <div className="privacy-page min-h-screen py-20 px-6 relative overflow-hidden">
      <style>{DS_STYLE}</style>
      
      {/* Abstract Background Decoration */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[150px] -mr-96 -mt-96 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[150px] -ml-96 -mb-96 pointer-events-none" />

      <div className="max-w-4xl mx-auto relative">
        <Link to="/" className="inline-flex items-center gap-3 text-[#356854] font-black uppercase tracking-widest text-[10px] mb-12 hover:opacity-70 transition-all">
          <ArrowLeft size={18} /> Voltar para o início
        </Link>

        <div className="premium-card overflow-hidden">
          <header className="p-12 md:p-16 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-20 h-20 bg-white shadow-xl shadow-emerald-900/5 rounded-3xl flex items-center justify-center text-[#356854] border border-emerald-100/50">
                <Shield size={40} />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight leading-none mb-2">Segurança de Dados</h1>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Políticas de Privacidade e Proteção ProspectAI</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
              <CheckCircle size={14} className="text-emerald-500" /> Versão Atualizada: Março de 2026
            </div>
          </header>
          
          <div className="p-12 md:p-16 space-y-16 text-slate-600 leading-relaxed">
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-4 mb-6">
                <div className="section-badge flex items-center justify-center">01</div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Compromisso Ético</h2>
              </div>
              <p className="text-lg font-medium text-slate-500 mb-6">
                Na ProspectAI, a privacidade não é apenas um requisito legal, mas um pilar fundamental da nossa arquitetura de software. Estamos empenhados em garantir a transparência total sobre como seus dados são coletados e protegidos.
              </p>
            </section>

            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
              <div className="flex items-center gap-4 mb-8">
                <div className="section-badge flex items-center justify-center">02</div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Tratamento de Dados</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#356854] mb-4 shadow-sm"><User size={24} /></div>
                  <h3 className="font-black text-slate-800 text-sm mb-3">Identificação Pessoal</h3>
                  <p className="text-xs font-medium text-slate-500 leading-relaxed">Informações fornecidas para a criação da sua conta corporativa, como nome e e-mail institucional.</p>
                </div>
                <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#356854] mb-4 shadow-sm"><Lock size={24} /></div>
                  <h3 className="font-black text-slate-800 text-sm mb-3">Integração Google</h3>
                  <p className="text-xs font-medium text-slate-500 leading-relaxed">Acesso via OAuth2 restrito à sincronização de contatos e agenda, respeitando integralmente as políticas de Uso Limitado.</p>
                </div>
              </div>
            </section>

            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
              <div className="flex items-center gap-4 mb-6">
                <div className="section-badge flex items-center justify-center">03</div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Finalidade do Processamento</h2>
              </div>
              <div className="space-y-4">
                {[
                  "Personalização da inteligência artificial para o tom de voz da sua marca.",
                  "Sincronização em tempo real para automação de agendamentos via Google Agenda.",
                  "Segurança avançada anti-ban para operações automatizadas no WhatsApp.",
                  "Relatórios analíticos de performance de prospecção."
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-5 bg-emerald-50/30 rounded-2xl border border-emerald-100/30">
                    <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                    <span className="text-sm font-bold text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
              <div className="flex items-center gap-4 mb-6">
                <div className="section-badge flex items-center justify-center">04</div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Arquitetura de Segurança</h2>
              </div>
              <p className="font-medium text-slate-500 mb-8">
                Utilizamos encriptação de nível militar (AES-256) para todos os tokens de acesso e dados sensíveis. Seus dados nunca são compartilhados ou utilizados para treinamento de modelos de IA públicos.
              </p>
              <div className="info-strip flex items-start gap-5">
                <Eye size={28} className="text-[#356854] shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-[#356854] uppercase tracking-widest mb-1">Transparência Google</h4>
                  <p className="text-xs font-bold text-emerald-900/60 leading-relaxed italic">
                    "O uso de informações recebidas de APIs do Google pela ProspectAI seguirá as Políticas de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de Uso Limitado."
                  </p>
                </div>
              </div>
            </section>

            <footer className="pt-12 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <Mail size={20} className="text-[#356854]" />
                <span className="text-xs font-black text-slate-700">seguranca@prospectai.com</span>
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

export default PrivacyPolicy;