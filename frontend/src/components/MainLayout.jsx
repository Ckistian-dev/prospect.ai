import React, { useState, useEffect, useMemo } from 'react';
import { useOutlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import api from '../api/axiosConfig';

const MainLayout = () => {
  const [userData, setUserData] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();

  // Estados de controle
  const [isLoading, setIsLoading] = useState(true);
  const [displayOutlet, setDisplayOutlet] = useState(null);

  // Busca inicial de dados do usuário
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await api.get('/auth/me');
        setUserData(response.data);
      } catch (error) {
        localStorage.removeItem('accessToken');
        navigate('/login');
      }
    };
    fetchUserData();
  }, [navigate]);

  // 1. Monitora a troca de rota para ativar o loading
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (!isLoading && outlet) {
      setDisplayOutlet(outlet);
    }
  }, [isLoading]); // Removido outlet para evitar loop infinito

  const isSuperUser = useMemo(() => userData?.is_superuser || userData?.is_admin, [userData]);

  return (
    <div className="flex h-screen bg-[#f8fafc] font-inter overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] lg:hidden transition-opacity duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar: Estrutura Base Fixa */}
      <Sidebar
        isSuperUser={isSuperUser}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header
          userData={userData}
          isSuperUser={isSuperUser}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />

        <main className="flex-1 relative overflow-hidden bg-[#f8fafc]">
          {/* Pageloader: Camada superior sólida que cobre a saída da página sem animação de blur */}
          <div
            className={`
              absolute inset-0 z-50 bg-[#f8fafc] flex items-center justify-center transition-opacity duration-300
              ${isLoading ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}
            `}
          >
            <div className="flex flex-col items-center gap-8">
              <div className="relative">
                <div className="w-14 h-14 border-4 border-[#356854]/10 border-t-[#356854] rounded-full animate-spin"></div>
                <div className="absolute inset-0 bg-[#356854]/5 blur-2xl rounded-full animate-pulse"></div>
              </div>
              <div className="text-center">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.4em] mb-2">Processando Requisição</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Acessando infraestrutura da página...</p>
              </div>
            </div>
          </div>

          {/* Conteúdo: Esconde instantaneamente e entra com animação premium (fade + zoom + blur) */}
          <div className={`h-full overflow-y-scroll custom-scrollbar-main ${isLoading ? 'opacity-0' : 'opacity-100 content-entry-animation'}`}>
            <div className="p-2 mx-auto min-h-full">
              {displayOutlet}
            </div>
          </div>
        </main>
      </div>

      <style>{`
        .custom-scrollbar-main::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar-main::-webkit-scrollbar-track { background: #f8fafc; }
        .custom-scrollbar-main::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar-main::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }

        @keyframes contentEntry {
          0% { opacity: 0; transform: scale(0.98); filter: blur(8px); }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        .content-entry-animation {
          animation: contentEntry 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default MainLayout;
