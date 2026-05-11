import React from 'react';
import { Link } from 'react-router-dom';
import { Zap, Target, MessageSquare, Phone, ArrowRight, ShieldCheck, BarChart, Users, Sparkles, Globe, Cpu, Layout, CheckCircle, Database, Shield, Activity, Star } from 'lucide-react';

const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
.landing-page { font-family: 'Inter', sans-serif; scroll-behavior: smooth; background-color: #0f172a; }
.landing-page h1, .landing-page h2, .landing-page h3, .landing-page h4 { font-family: 'Plus Jakarta Sans', sans-serif; }
.hero-gradient { background: radial-gradient(circle at top right, #1e293b, #0f172a); }
.glass-nav { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.feature-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); backdrop-filter: blur(10px); }
.feature-card:hover { transform: translateY(-12px); background: rgba(255, 255, 255, 0.05); border-color: #356854; box-shadow: 0 30px 60px rgba(0,0,0,0.3); }
.text-gradient { background: linear-gradient(135deg, #10b981, #356854); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.btn-premium { background: linear-gradient(135deg, #10b981 0%, #356854 100%); transition: all 0.3s ease; }
.btn-premium:hover { transform: scale(1.05); box-shadow: 0 20px 40px rgba(16, 185, 129, 0.2); }
@keyframes float { 0% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-20px) rotate(2deg); } 100% { transform: translateY(0px) rotate(0deg); } }
.animate-float { animation: float 8s ease-in-out infinite; }
.hero-blob { position: absolute; width: 600px; height: 600px; background: #356854; filter: blur(150px); opacity: 0.15; border-radius: 50%; z-index: 0; }
`;

function LandingPage() {
  return (
    <div className="landing-page min-h-screen text-slate-100 overflow-x-hidden">
      <style>{DS_STYLE}</style>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-nav h-20">
        <div className="container mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-emerald-500/20">P</div>
            <span className="text-xl font-black tracking-tight text-white uppercase tracking-[0.2em]">ProspectAI</span>
          </div>
          <div className="hidden md:flex items-center gap-10">
            <a href="#features" className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all">Recursos</a>
            <a href="#how-it-works" className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all">Como Funciona</a>
            <Link to="/login" className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all">Entrar</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative hero-gradient pt-48 pb-32 lg:pt-64 lg:pb-56 overflow-hidden">
        <div className="hero-blob -top-24 -right-24"></div>
        <div className="hero-blob bottom-0 -left-24 opacity-10"></div>
        
        <div className="container mx-auto px-6 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                <div className="text-center lg:text-left">
                    <div className="inline-flex items-center gap-3 px-6 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] mb-10 animate-fade-in">
                        <Sparkles size={14} /> Next-Gen AI Automation
                    </div>
                    <h1 className="text-5xl lg:text-8xl font-black text-white leading-[1.1] mb-10">
                        O futuro da <br/> <span className="text-gradient">Prospecção</span>
                    </h1>
                    <p className="text-lg text-slate-400 mb-12 leading-relaxed max-w-xl mx-auto lg:mx-0">
                        Converta leads frios em clientes apaixonados com a nossa IA ultra-avançada. 
                        Personalização profunda, escala infinita e inteligência conversacional no WhatsApp.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-6 justify-center lg:justify-start">
                        <Link to="/login" className="btn-premium h-16 px-10 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-2xl flex items-center justify-center gap-3 group">
                            Começar Agora <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                        </Link>
                        <a href="#features" className="h-16 px-10 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs rounded-2xl border border-white/10 backdrop-blur-md transition-all flex items-center justify-center">
                            Ver Tour
                        </a>
                    </div>
                    <div className="mt-16 flex items-center justify-center lg:justify-start gap-8 opacity-40">
                        <div className="flex items-center gap-2"><Star size={14} className="text-emerald-400" /><span className="text-[10px] font-bold uppercase tracking-widest">4.9/5 Rating</span></div>
                        <div className="flex items-center gap-2"><Users size={14} className="text-emerald-400" /><span className="text-[10px] font-bold uppercase tracking-widest">10k+ Users</span></div>
                    </div>
                </div>
                
                <div className="relative hidden lg:block animate-float">
                    <div className="relative z-10 p-4 bg-white/5 border border-white/10 backdrop-blur-3xl rounded-[3rem] shadow-2xl overflow-hidden">
                        <div className="bg-[#0f172a] rounded-[2.5rem] p-10 border border-white/5 aspect-square flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400"><Activity size={32} /></div>
                                <div className="text-right">
                                    <div className="text-4xl font-black text-white leading-none">+84%</div>
                                    <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-2">Conversion Rate</div>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden"><div className="h-full w-3/4 bg-emerald-500 rounded-full"></div></div>
                                <div className="h-2 w-1/2 bg-white/5 rounded-full overflow-hidden"><div className="h-full w-1/2 bg-emerald-500 rounded-full"></div></div>
                                <div className="h-2 w-2/3 bg-white/5 rounded-full overflow-hidden"><div className="h-full w-full bg-emerald-500 rounded-full"></div></div>
                            </div>
                            <div className="p-6 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400"><Sparkles size={20} /></div>
                                    <div><p className="text-xs font-black text-white leading-tight">AI Agent Active</p><p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mt-1">Processing context...</p></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl"></div>
                </div>
            </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 lg:py-56 relative bg-slate-900">
        <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-32">
                <h2 className="text-4xl lg:text-6xl font-black text-white mb-8">Tecnologia que <br/><span className="text-gradient">escala o seu tempo</span>.</h2>
                <p className="text-slate-400 text-lg leading-relaxed">Desenvolvemos ferramentas de elite para que você foque no que realmente importa: fechar o negócio.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                <FeatureCard icon={Zap} title="Brain IA v3.0" desc="Motor conversacional treinado para replicar seu tom de voz e lidar com objeções em tempo real." />
                <FeatureCard icon={Target} title="Smart Filtering" desc="Algoritmos que segmentam seus leads por nível de interesse e prontidão para compra." />
                <FeatureCard icon={ShieldCheck} title="Enterprise Security" desc="Sua conta protegida com as melhores práticas de anti-ban e criptografia ponta-a-ponta." />
                <FeatureCard icon={BarChart} title="Deep Analytics" desc="Insights estratégicos que mostram exatamente onde seu funil está perdendo eficiência." />
                <FeatureCard icon={Globe} title="Cloud Sync" desc="Toda sua operação sincronizada instantaneamente com Google Drive, Sheets e Agenda." />
                <FeatureCard icon={Cpu} title="API Integrations" desc="Desenvolvido para crescer. Conecte com qualquer sistema externo através da nossa robusta API." />
            </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 lg:py-56 bg-emerald-500 relative overflow-hidden">
          <div className="absolute inset-0 bg-[#1b3d2f] opacity-20"></div>
          <div className="container mx-auto px-6 relative z-10 text-center">
              <h2 className="text-5xl lg:text-8xl font-black text-[#0f172a] leading-none mb-10 italic">DOMINE O MERCADO.</h2>
              <p className="text-xl text-[#0f172a] font-medium mb-16 max-w-2xl mx-auto opacity-80">Junte-se a centenas de empresas que já transformaram seu WhatsApp em uma máquina de lucro.</p>
              <Link to="/login" className="h-20 px-16 bg-[#0f172a] text-white font-black uppercase tracking-widest text-xs rounded-3xl shadow-3xl hover:scale-105 transition-all inline-flex items-center gap-4">
                  Criar Conta Grátis <ArrowRight size={24} />
              </Link>
          </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0f172a] py-32 text-slate-400 border-t border-white/5">
        <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-20 mb-24">
                <div className="lg:col-span-2">
                    <div className="flex items-center gap-4 mb-10">
                        <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-xl shadow-emerald-500/20">P</div>
                        <span className="text-2xl font-black tracking-[0.2em] text-white">PROSPECTAI</span>
                    </div>
                    <p className="max-w-md leading-relaxed text-lg mb-12">
                        A plataforma definitiva para automação inteligente de vendas. 
                        Acelerando o futuro da prospecção digital.
                    </p>
                    <div className="flex gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all cursor-pointer"><Globe size={20} /></div>
                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all cursor-pointer"><Smartphone size={20} /></div>
                    </div>
                </div>
                
                <div>
                    <h4 className="font-black text-white text-xs uppercase tracking-[0.2em] mb-10">Plataforma</h4>
                    <ul className="space-y-6 text-sm font-bold">
                        <li><Link to="/login" className="hover:text-emerald-400 transition-colors">Sistema</Link></li>
                        <li><a href="#features" className="hover:text-emerald-400 transition-colors">Recursos</a></li>
                        <li><a href="#how-it-works" className="hover:text-emerald-400 transition-colors">Tecnologia</a></li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-black text-white text-xs uppercase tracking-[0.2em] mb-10">Suporte</h4>
                    <ul className="space-y-6 text-sm font-bold">
                        <li><Link to="/politicies" className="hover:text-emerald-400 transition-colors">Privacidade</Link></li>
                        <li><Link to="/services-terms" className="hover:text-emerald-400 transition-colors">Termos</Link></li>
                        <li><a href="mailto:contato@prospectai.com" className="hover:text-emerald-400 transition-colors">Contato</a></li>
                    </ul>
                </div>
            </div>
            
            <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-40">© 2026 ProspectAI Enterprise. Built by CJS Soluções.</p>
                <div className="flex items-center gap-10 opacity-20">
                    <Zap size={20} />
                    <Target size={20} />
                    <Shield size={20} />
                    <Database size={20} />
                </div>
            </div>
        </div>
      </footer>
    </div>
  );
}

const FeatureCard = ({ icon: Icon, title, desc }) => (
    <div className="feature-card p-12 rounded-[3rem] flex flex-col items-start gap-10">
        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-inner">
            <Icon size={32} />
        </div>
        <div>
            <h3 className="text-2xl font-black text-white mb-6 leading-tight">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">{desc}</p>
        </div>
    </div>
);

export default LandingPage;
