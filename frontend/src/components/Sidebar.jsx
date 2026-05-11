import React, { useState, memo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
    LayoutDashboard, Users, Bot, GitBranch, 
    LogOut, Rocket, Link, MessageSquareText, 
    Settings, ChevronRight, Zap, Menu, X
} from 'lucide-react';

const Sidebar = memo(({ isSuperUser, isMobileMenuOpen, setIsMobileMenuOpen }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        navigate('/login');
    };

    const navItems = [
        { icon: LayoutDashboard, name: 'Dashboard', path: '/dashboard' },
        { icon: Users, name: 'Contatos', path: '/contacts' },
        { icon: GitBranch, name: 'Prospecções', path: '/prospects' },
        { icon: Bot, name: 'Contexto', path: '/configs' },
        { icon: Link, name: 'Conexão', path: '/whatsapp' },
        { icon: MessageSquareText, name: 'Mensagens', path: '/mensagens' },
        { icon: Rocket, name: 'Campanhas', path: '/prospecting' },
    ];

    return (
        <aside 
            className={`
                fixed inset-y-0 left-0 z-50 flex flex-col bg-[#12281f] border-r border-[#ffffff0a] transition-all duration-300 ease-in-out
                lg:static lg:translate-x-0
                ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
                ${isExpanded ? 'lg:w-64' : 'lg:w-[72px]'}
            `}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            {/* Background Texture/Overlay */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(53,104,84,0.15),transparent_70%)] pointer-events-none" />

            {/* Logo Section */}
            <div className="flex items-center h-16 px-4 shrink-0 overflow-hidden border-b border-[#ffffff0a] relative z-10">
                <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-[#356854] to-[#1b3d2f] rounded-xl shadow-lg shadow-emerald-900/40 shrink-0 border border-[#ffffff10]">
                    <Zap size={20} className="text-white fill-white/20" />
                </div>
                <span className={`
                    ml-3 font-black text-xl text-white tracking-tight transition-all duration-300 whitespace-nowrap
                    ${isExpanded || isMobileMenuOpen ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0'}
                `}>
                    Prospect<span className="text-[#4ade80]">AI</span>
                </span>
                
                {isMobileMenuOpen && (
                    <button onClick={() => setIsMobileMenuOpen(false)} className="ml-auto text-slate-400 hover:text-white lg:hidden">
                        <X size={20} />
                    </button>
                )}
            </div>
            
            {/* Navigation */}
            <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto custom-scrollbar overflow-x-hidden relative z-10">
                {!isSuperUser && navItems.map(item => (
                    <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={({ isActive }) => `
                            flex items-center h-11 px-3 rounded-xl transition-all duration-200 group relative
                            ${isActive 
                                ? 'bg-[#356854]/30 text-white shadow-sm' 
                                : 'text-[#a7f3d0]/60 hover:bg-[#ffffff08] hover:text-white'}
                        `}
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon size={20} className={`shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                                <span className={`
                                    ml-3 text-[13px] font-bold transition-all duration-300 whitespace-nowrap overflow-hidden
                                    ${isExpanded || isMobileMenuOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0'}
                                `}>
                                    {item.name}
                                </span>
                                
                                {isActive && (
                                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-[#4ade80] rounded-r-full shadow-[0_0_12px_rgba(74,222,128,0.5)]" />
                                )}

                                {/* Collapsed Tooltip */}
                                {!isExpanded && !isMobileMenuOpen && (
                                    <div className="fixed left-[80px] bg-[#12281f] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-2xl z-[100] whitespace-nowrap border border-[#ffffff10]">
                                        {item.name}
                                    </div>
                                )}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Footer / Logout */}
            <div className="p-3 border-t border-[#ffffff0a] relative z-10">
                <button 
                    onClick={handleLogout} 
                    className="flex items-center w-full h-11 px-3 rounded-xl text-[#fda4af]/60 hover:bg-rose-500/10 hover:text-rose-400 transition-all group relative"
                >
                    <LogOut size={20} className="shrink-0" />
                    <span className={`
                        ml-3 text-[13px] font-bold transition-all duration-300 whitespace-nowrap overflow-hidden
                        ${isExpanded || isMobileMenuOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0'}
                    `}>
                        Sair do Sistema
                    </span>
                    {!isExpanded && !isMobileMenuOpen && (
                        <div className="fixed left-[80px] bg-rose-950 text-rose-100 text-[11px] font-bold px-3 py-1.5 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-2xl z-[100] whitespace-nowrap border border-rose-900/30">
                            Sair
                        </div>
                    )}
                </button>
            </div>
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #35685450; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #35685480; }
            `}</style>
        </aside>
    );
});

export default Sidebar;
