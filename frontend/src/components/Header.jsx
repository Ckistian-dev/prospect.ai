import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import { Ticket, User as UserIcon, AlertCircle, Zap, Activity, Menu } from 'lucide-react';
import api from '../api/axiosConfig';

// --- Sub-componente para o Ticker de Atividade ---
const ActivityTicker = ({ activity }) => {
    if (!activity) {
        return (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-bold uppercase tracking-widest px-3 py-1 bg-slate-50 rounded-lg border border-slate-100">
                <Activity size={12} className="animate-pulse" />
                <span className="hidden sm:inline">Monitorando Atividade...</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 text-xs px-3 py-1 bg-white border border-slate-100 rounded-lg shadow-sm animate-in fade-in slide-in-from-top-1 duration-300" title={`Observação: ${activity.observacao || 'N/A'}`}>
            <div className="flex items-center justify-center w-5 h-5 bg-emerald-50 text-[#356854] rounded-md">
                <Activity size={12} />
            </div>
            <div className="font-medium text-slate-600 truncate max-w-[200px] sm:max-w-[400px]">
                <span className="text-slate-400 font-bold mr-1">{activity.campaignName}</span>
                <span className="text-slate-800">{activity.contactName}:</span>
                <span className="ml-1 text-[#356854] font-bold">{activity.situacao}</span>
            </div>
        </div>
    );
};

// --- Sub-componente para Animação de Números ---
const CountUp = ({ end, duration = 1200 }) => {
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
            const ease = 1 - Math.pow(1 - percentage, 4);
            const currentCount = Math.floor(startValue + (endValue - startValue) * ease);
            setCount(currentCount);
            countRef.current = currentCount;
            if (progress < duration) requestRef.current = requestAnimationFrame(animate);
            else { setCount(endValue); countRef.current = endValue; }
        };
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    }, [end, duration]);

    return <span>{new Intl.NumberFormat('pt-BR').format(count)}</span>;
};

const Header = memo(({ userData, isSuperUser, setIsMobileMenuOpen }) => {
  const [latestActivity, setLatestActivity] = useState(null);

  const fetchActivity = useCallback(async () => {
    if (isSuperUser) return;
    try {
      const response = await api.get('/dashboard/');
      const newActivity = response.data.recentActivity?.[0];
      setLatestActivity(currentActivity => {
        if (newActivity && JSON.stringify(newActivity) !== JSON.stringify(currentActivity)) return newActivity;
        return currentActivity;
      });
    } catch (err) { }
  }, [isSuperUser]);

  useEffect(() => {
    if (isSuperUser) return;
    fetchActivity();
    let isMounted = true;
    let timeoutId;
    const poll = async () => {
      if (!document.hidden && isMounted) await fetchActivity();
      if (isMounted) timeoutId = setTimeout(poll, 15000); // Polling even slower to reduce re-renders
    };
    poll();
    return () => { isMounted = false; clearTimeout(timeoutId); };
  }, [fetchActivity, isSuperUser]);

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shadow-sm sticky top-0 z-40">
      <div className="flex items-center gap-4 flex-1">
        <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
          <Menu size={20} />
        </button>

        {!isSuperUser && (
          <div className="hidden md:block min-w-[300px]">
            <SwitchTransition mode="out-in">
              <CSSTransition
                key={latestActivity?.id || 'no-activity'}
                timeout={400}
                classNames={{
                  enter: 'opacity-0 -translate-y-2',
                  enterActive: 'opacity-100 translate-y-0 transition-all duration-400',
                  exit: 'opacity-100 translate-y-0',
                  exitActive: 'opacity-0 translate-y-2 transition-all duration-400'
                }}
              >
                <div><ActivityTicker activity={latestActivity} /></div>
              </CSSTransition>
            </SwitchTransition>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {!isSuperUser && userData && (
          <>
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100 group transition-all hover:bg-emerald-100" title="Tokens Disponíveis">
              <Ticket size={14} className="text-[#356854] group-hover:rotate-12 transition-transform" />
              <span className="text-xs font-black text-slate-700">
                <CountUp end={userData.tokens || 0} />
              </span>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Tokens</span>
            </div>
            
            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>
          </>
        )}

        <div className="flex items-center gap-2 px-2 py-1 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            {userData ? <UserIcon size={14} /> : <div className="w-3 h-3 bg-slate-200 rounded-full animate-pulse" />}
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="text-[11px] font-black text-slate-800 leading-tight truncate max-w-[120px]">
                {userData?.email || '...'}
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">
                {userData ? (isSuperUser ? 'Administrador' : 'Usuário') : 'Autenticando'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
});

export default Header;
