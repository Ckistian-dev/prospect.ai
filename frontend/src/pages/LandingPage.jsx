import React from 'react';
import { Link } from 'react-router-dom'; // Importante para navegação interna
import { Zap, Target, MessageSquare, Phone } from 'lucide-react';

function LandingPage() {
  // O HTML foi convertido para JSX (class -> className, etc.)
  // e os links <a> foram trocados por <Link> do React Router.
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {/* Botão Flutuante do WhatsApp */}
      <a 
        href="https://wa.me/5545999861237?text=Ol%C3%A1%21%20Gostaria%20de%20saber%20mais%20sobre%20o%20ProspectAI." 
        target="_blank" 
        rel="noopener noreferrer" 
        className="fixed bottom-6 right-6 bg-green-500 text-white p-4 rounded-full shadow-lg hover:bg-green-600 transition-transform hover:scale-110 z-50 flex items-center gap-2"
      >
        <Phone size={24} />
        <span className="hidden md:inline">Fale Conosco</span>
      </a>

      <div className="grid grid-cols-1 lg:grid-cols-2 max-w-5xl w-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        
        {/* Painel Esquerdo (Visual) - Reutilizado do Login */}
        <div className="hidden lg:flex flex-col items-center justify-center p-12 bg-brand-green text-white relative overflow-hidden">
          <div className="absolute -top-16 -left-16 w-48 h-48 bg-white/10 rounded-full mix-blend-overlay animate-pulse"></div>
          <div className="absolute -bottom-24 -right-10 w-64 h-64 bg-white/10 rounded-full mix-blend-overlay animate-pulse delay-500"></div>
          
          <div className="w-24 h-24 bg-brand-green-light/20 rounded-2xl flex items-center justify-center mb-6">
              <span className="text-5xl font-bold text-white">P</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">ProspectAI</h1>
          <p className="text-center text-white/80">Sua plataforma de prospecção inteligente de clientes.</p>
        </div>

        {/* Painel Direito (Conteúdo da Landing Page) */}
        <div className="p-8 md:p-12 flex flex-col justify-center">
            <div className="w-full">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-brand-green">Automatize sua Prospecção com Inteligência Artificial</h2>
                    <p className="text-gray-500 mt-3">
                        Transforme a maneira como você encontra e se conecta com novos clientes. O ProspectAI usa IA para otimizar suas campanhas de prospecção no WhatsApp.
                    </p>
                </div>

                <div className="space-y-5 my-10">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 bg-brand-green-light/20 rounded-lg flex items-center justify-center">
                            <Zap className="text-brand-green" size={20} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800">Prospecção Inteligente</h4>
                            <p className="text-sm text-gray-500">Use IA para analisar dados e encontrar os melhores leads para o seu negócio.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 bg-brand-green-light/20 rounded-lg flex items-center justify-center">
                            <MessageSquare className="text-brand-green" size={20} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800">Comunicação Personalizada</h4>
                            <p className="text-sm text-gray-500">Envie mensagens automáticas e personalizadas que geram respostas.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 bg-brand-green-light/20 rounded-lg flex items-center justify-center">
                            <Target className="text-brand-green" size={20} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800">Gestão Simplificada</h4>
                            <p className="text-sm text-gray-500">Acompanhe o status de cada contato em um dashboard intuitivo.</p>
                        </div>
                    </div>
                </div>

                <Link 
                    to="/login" 
                    className="w-full bg-brand-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-green-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all duration-300 shadow-lg hover:shadow-xl text-center"
                >
                    Acessar Plataforma
                </Link>
                
                <div className="text-center mt-12 space-y-4">
                    <p className="text-sm text-gray-500">
                        Desenvolvido por <a href="https://ckistian-programando-solucoes.vercel.app" target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-800 hover:underline">Ckistian Programando Soluções</a>
                    </p>
                    <div className="text-xs text-gray-400">
                        <Link to="/politicies" className="hover:underline hover:text-gray-600 transition-colors">Política de Privacidade</Link>
                        <span className="mx-2">·</span>
                        <Link to="/services-terms" className="hover:underline hover:text-gray-600 transition-colors">Termos de Serviço</Link>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
