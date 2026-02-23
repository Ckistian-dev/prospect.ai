import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// --- Sub-componente para Animação de Números (Efeito Cassino) ---
const CountUp = ({ end, duration = 1500 }) => {
    const [count, setCount] = useState(0);
    const countRef = useRef(0);
    const requestRef = useRef();
    const startTimeRef = useRef();

    useEffect(() => {
        const startValue = countRef.current;
        const endValue = end;

        if (startValue === endValue) return;

        startTimeRef.current = null;

        const animate = (time) => {
            if (!startTimeRef.current) startTimeRef.current = time;
            const progress = time - startTimeRef.current;
            const percentage = Math.min(progress / duration, 1);
            
            // Easing: easeOutQuart para um efeito suave de desaceleração
            const ease = 1 - Math.pow(1 - percentage, 4);
            
            const currentCount = Math.floor(startValue + (endValue - startValue) * ease);

            setCount(currentCount);
            countRef.current = currentCount;

            if (progress < duration) {
                requestRef.current = requestAnimationFrame(animate);
            } else {
                setCount(endValue);
                countRef.current = endValue;
            }
        };

        requestRef.current = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(requestRef.current);
    }, [end, duration]);

    return new Intl.NumberFormat('pt-BR').format(count);
};

const Header = ({ isSuperUser }) => {
  const [user, setUser] = useState(null);
  const [latestActivity, setLatestActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    if (isSuperUser) return;
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
      setError(true);
    }
  }, [isSuperUser]);

  useEffect(() => {
    if (isSuperUser) {
        setLoading(false);
        return;
    }
    const loadInitialData = async () => {
        setLoading(true);
        await fetchData();
        setLoading(false);
    };
    loadInitialData();
  }, [fetchData, isSuperUser]);

  // Atualiza os dados periodicamente e ao focar na aba
  useEffect(() => {
    if (isSuperUser) return;
    let isMounted = true;
    let timeoutId;

    const poll = async () => {
      if (!document.hidden && isMounted) { // Só busca se a aba estiver visível
        await fetchData();
      }
      if (isMounted) {
        timeoutId = setTimeout(poll, 5000);
      }
    };

    poll();

    const handleVisibilityChange = () => {
        if (!document.hidden && isMounted) {
            clearTimeout(timeoutId);
            poll(); // Chama o poll imediatamente ao voltar para a aba
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData, isSuperUser]);

  const renderContent = () => {
    if (isSuperUser) {
      return <div className="h-8"></div>;;
    }
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
                <style>{`
                    .activity-ticker-wrapper {
                        position: relative;
                        height: 34px;
                        overflow: hidden;
                    }
                    .fade-enter { opacity: 0; transform: translateY(-100%); }
                    .fade-enter-active { opacity: 1; transform: translateY(0); transition: all 500ms ease-out; }
                    .fade-exit { opacity: 1; transform: translateY(0); }
                    .fade-exit-active { opacity: 0; transform: translateY(100%); transition: all 500ms ease-in; }
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
                    <span className="font-semibold text-gray-800">
                        {user?.tokens !== undefined && user?.tokens !== null
                            ? <CountUp end={user.tokens} />
                            : '...'}
                    </span>
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
