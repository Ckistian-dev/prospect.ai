import React from 'react';
import { Link } from 'react-router-dom'; // Importante para navegação interna

function LandingPage() {
  // O HTML foi convertido para JSX (class -> className, etc.)
  // e os links <a> foram trocados por <Link> do React Router.
  return (
    <div className="bg-gray-50 text-gray-800 antialiased">
        {/* Botão Flutuante do WhatsApp */}
        <a href="https://wa.me/5545999861237?text=Ol%C3%A1%21%20Gostaria%20de%20saber%20mais%20sobre%20o%20Prospect%20Client%20System." target="_blank" rel="noopener noreferrer" className="fixed bottom-6 right-6 bg-green-500 text-white p-4 rounded-full shadow-lg hover:bg-green-600 transition-transform hover:scale-110 z-50 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            <span className="hidden md:inline">Fale Conosco</span>
        </a>

        {/* Cabeçalho */}
        <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-40 border-b border-gray-200">
            <div className="container mx-auto px-6 py-4 flex justify-between items-center">
            <a href="#" className="flex items-center gap-2">
                <svg className="h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d='M20 10 L80 50 L20 90 Z' fill='currentColor'/></svg>
                <span className="text-xl font-bold text-gray-800">Prospect System</span>
            </a>
            <nav className="hidden md:flex items-center gap-8">
                <a href="#features" className="text-gray-600 hover:text-green-600 transition-colors">Recursos</a>
                <a href="#how-it-works" className="text-gray-600 hover:text-green-600 transition-colors">Como Funciona</a>
                <a href="#cta" className="text-gray-600 hover:text-green-600 transition-colors">Começar</a>
            </nav>
            <Link to="/login" className="bg-green-600 text-white font-semibold py-2 px-5 rounded-lg shadow-md hover:bg-green-700 transition-all duration-300">
                Acessar Plataforma
            </Link>
            </div>
        </header>

        <main>
            {/* Seções da Landing Page (Herói, Recursos, etc.) */}
            {/* ... (todo o conteúdo da main que eu te enviei antes) ... */}
        </main>

        <footer className="bg-gray-800 text-white py-12">
            <div className="container mx-auto px-6 text-center">
                <div className="flex justify-center gap-x-6 mb-6">
                    <Link to="/politicies" className="text-gray-400 hover:text-white transition-colors">Política de Privacidade</Link>
                    <Link to="/services-terms" className="text-gray-400 hover:text-white transition-colors">Termos de Serviço</Link>
                </div>
                <p>&copy; 2025 Prospect Client System. Todos os direitos reservados.</p>
                <p className="text-sm text-gray-400 mt-2">Uma solução de prospecção inteligente para o seu negócio.</p>
            </div>
        </footer>
    </div>
  );
}

export default LandingPage;
