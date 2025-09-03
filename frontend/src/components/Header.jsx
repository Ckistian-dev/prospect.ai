import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom'; // Importa o hook para saber a URL atual
import { Mail, Ticket, User as UserIcon, AlertCircle, LogOut } from 'lucide-react';
import api from '../api/axiosConfig';

const Header = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const location = useLocation(); // Hook para obter a localização atual (URL)

  // Função para buscar os dados do usuário. Envolvida em useCallback para estabilidade.
  const fetchUserData = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (err) {
      console.error("Erro ao buscar/atualizar dados do usuário:", err);
      setError(true);
      // Se der erro na atualização, mantém os dados antigos para não quebrar a UI
    }
  }, []);

  // Efeito para buscar os dados iniciais do usuário (roda apenas uma vez)
  useEffect(() => {
    const loadInitialData = async () => {
        setLoading(true);
        await fetchUserData();
        setLoading(false);
    };
    loadInitialData();
  }, [fetchUserData]);

  // --- LÓGICA DE ATUALIZAÇÃO AUTOMÁTICA ---
  // Este efeito é responsável por iniciar e parar a atualização dos tokens
  useEffect(() => {
    let intervalId = null;

    // Verifique se a URL atual é a da página de prospecção.
    // AJUSTE '/prospects' se o caminho da sua página for diferente.
    const isProspectingPage = location.pathname.includes('/prospecting');

    if (isProspectingPage) {
      // Se estiver na página correta, cria um intervalo que chama a função de busca
      // a cada 5 segundos (5000 milissegundos).
      intervalId = setInterval(fetchUserData, 5000);
      console.log("Iniciando atualização de tokens...");
    }

    // A função de limpeza do useEffect. Ela é executada quando o usuário
    // sai da página de prospecção, parando as chamadas desnecessárias à API.
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        console.log("...Parando atualização de tokens.");
      }
    };
  }, [location.pathname, fetchUserData]); // Roda sempre que a URL ou a função de busca mudar

  // Função de logout simples (pode ser movida para um serviço se preferir)
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    // Redireciona para a página de login
    window.location.href = '/login';
  };

  const renderContent = () => {
    if (loading) {
      return <div className="h-6 bg-gray-200 rounded-md w-48 animate-pulse"></div>;
    }
    if (error || !user) {
      return (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle size={18} />
          <span>Não foi possível carregar os dados do usuário.</span>
        </div>
      );
    }
    return (
      <>
        <div className="flex items-center gap-2 text-gray-600" title="Seus tokens restantes">
          <Ticket size={20} className="text-brand-green" />
          <span className="font-semibold text-gray-800">{user.tokens}</span>
          <span className="text-sm hidden sm:inline">Tokens</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
          <UserIcon size={18} />
          <span className="font-medium">{user.email}</span>
        </div>
      </>
    );
  };

  return (
    <header className="bg-white p-4 border-b border-gray-200 flex justify-end items-center shadow-sm">
      <div className="flex items-center gap-4 sm:gap-6">
        {renderContent()}
      </div>
    </header>
  );
};

export default Header;

