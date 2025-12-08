import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, MessageSquareQuote, Bot, Settings, GitBranch, LogOut, Rocket, BluetoothConnectedIcon, Phone, Link } from 'lucide-react';

const Sidebar = () => {
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
        { icon: Rocket, name: 'Principal', path: '/prospecting' },
    ];

    return (
        <aside 
            className={`relative h-screen bg-brand-green-dark text-white p-4 flex flex-col transition-all duration-300 ease-in-out ${isExpanded ? 'w-64' : 'w-20'}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            {/* MODIFICADO: Seção do Logo/Título */}
            <div className="flex items-center mb-10" style={{ height: '40px' }}>
                {/* Ícone 'P' - sempre presente, mas o texto ao lado depende do estado */}
                <div className="bg-brand-green-light/20 w-12 h-12 flex items-center justify-center rounded-lg flex-shrink-0">
                    <span className="font-bold text-2xl text-white">P</span>
                </div>
                {/* Texto 'Prospect' - aparece suavemente ao expandir */}
                <span className={`font-bold text-2xl whitespace-nowrap overflow-hidden transition-all duration-300 ${isExpanded ? 'w-auto opacity-100 ml-3' : 'w-0 opacity-0'}`}>
                    rospectAI
                </span>
            </div>
            
            <nav className="flex-1 flex flex-col space-y-2">
                {navItems.map(item => (
                    <NavLink
                        key={item.name}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex items-center p-3 rounded-lg transition-colors duration-200 ${
                            isActive ? 'bg-brand-green-light/30' : 'hover:bg-brand-green-light/20'
                        }`
                        }
                    >
                        <item.icon size={24} className="flex-shrink-0" />
                        <span className={`ml-4 font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ${isExpanded ? 'opacity-100 w-full' : 'opacity-0 w-0'}`}>
                            {item.name}
                        </span>
                    </NavLink>
                ))}
            </nav>

            <div className="border-t border-white/20 pt-4">
                 <button onClick={handleLogout} className="flex items-center p-3 rounded-lg w-full hover:bg-brand-green-light/20 transition-colors duration-200">
                    <LogOut size={24} className="flex-shrink-0" />
                    <span className={`ml-4 font-medium whitespace-nowrap text-start overflow-hidden transition-all duration-200 ${isExpanded ? 'opacity-100 w-full' : 'opacity-0 w-0'}`}>
                        Sair
                    </span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;

