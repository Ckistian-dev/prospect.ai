import React, { useState, useEffect, useCallback } from 'react';
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import { Ticket, User as UserIcon, AlertCircle, Zap, Activity } from 'lucide-react';
import api from '../api/axiosConfig';

// --- Sub-componente para o Ticker de Atividade ---
const ActivityTicker = ({ activity }) => {
    if (!activity) {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                <Activity size={16} />
                <span className="font-medium hidden sm:inline">Nenhuma atividade recente</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 text-sm text-gray-600 px-2 py-1" title={`Observação: ${activity.observacao || 'N/A'}`}>
            <Activity size={16} className="text-brand-green" />
            <div className="font-normal hidden sm:flex items-center gap-1.5">
                <span className="text-gray-500">{activity.campaignName} -</span>
                <span className="font-medium text-gray-700">{activity.contactName}:</span>
                <span className="font-semibold text-gray-800">{activity.situacao}</span>
            </div>
        </div>
    );
};

const Header = () => {
  const [user, setUser] = useState(null);
  const [latestActivity, setLatestActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Usamos Promise.all para buscar os dados em paralelo
      const [userRes, dashboardRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/dashboard/')
      ]);

      setUser(userRes.data);

      const newActivity = dashboardRes.data.recentActivity?.[0];
      
      // Usando a forma funcional do setState para evitar dependência desnecessária no useCallback
      setLatestActivity(currentActivity => {
        if (newActivity && JSON.stringify(newActivity) !== JSON.stringify(currentActivity)) {
          return newActivity;
        }
        return currentActivity;
      });

    } catch (err) {
      console.error("Erro ao buscar dados do header:", err);
      setError(true);
    }
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
        setLoading(true);
        await fetchData();
        setLoading(false);
    };
    loadInitialData();
  }, [fetchData]);

  // Atualiza os dados periodicamente e ao focar na aba
  useEffect(() => {
    let isMounted = true;
    let intervalId = null;

    const poll = async () => {
      if (document.visibilityState === 'visible' && isMounted) { // Só busca se a aba estiver visível
        await fetchData();
      }
    };

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && isMounted) {
            poll(); // Chama o poll imediatamente ao voltar para a aba
        }
    };

    // Inicia o polling
    intervalId = setInterval(poll, 5000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  const renderContent = () => {
    if (loading) {
      return <div className="h-8 bg-gray-200 rounded-full w-full animate-pulse"></div>;
    }
    if (error) {
      return (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle size={18} />
          <span>Erro ao carregar.</span>
        </div>
      );
    }
    return (
        <div className="w-full flex justify-between items-center">
            {/* Lado Esquerdo */}
            <div className="flex items-center gap-4 sm:gap-5">
                <style jsx global>{`
                    .activity-ticker-wrapper {
                        position: relative;
                        height: 34px;
                        overflow: hidden;
                    }
                    .fade-enter { opacity: 0; transform: translateY(-20px); }
                    .fade-enter-active { opacity: 1; transform: translateY(0); transition: all 400ms ease-out; }
                    .fade-exit { opacity: 1; transform: translateY(0); }
                    .fade-exit-active { opacity: 0; transform: translateY(20px); transition: all 400ms ease-in; }
                `}</style>
                <SwitchTransition mode="out-in">
                    <CSSTransition
                        key={latestActivity?.id || 'no-activity'}
                        timeout={500}
                        classNames="fade"
                    >
                        <div className="activity-ticker-wrapper">
                            <ActivityTicker activity={latestActivity} />
                        </div>
                    </CSSTransition>
                </SwitchTransition>
            </div>

            {/* Lado Direito */}
            <div className="flex items-center gap-4 sm:gap-5">
                <div className="flex items-center gap-2 text-gray-600" title="Seus tokens restantes">
                    <Ticket size={20} className="text-brand-green" />
                    <span className="font-semibold text-gray-800">{user?.tokens ?? '...'}</span>
                    <span className="text-sm hidden sm:inline">Tokens</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                    <UserIcon size={18} />
                    <span className="font-medium">{user?.email ?? '...'}</span>
                </div>
            </div>
        </div>
    );
  };

  return (
    <header className="bg-white p-4 border-b border-gray-200 flex items-center shadow-sm">
      {renderContent()}
    </header>
  );
};

export default Header;
