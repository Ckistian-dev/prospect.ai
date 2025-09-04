import React, { useState, useEffect } from 'react';
import { Users, Target, CheckCircle, Percent, BarChart, Clock, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/axiosConfig'; // Presumindo que você tem um arquivo de configuração do Axios

// --- COMPONENTES AUXILIARES (sem alterações) ---
const StatCard = ({ icon: Icon, title, value, change, color }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
        <div className="flex items-start justify-between">
            <div className="flex flex-col">
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
            </div>
            <div className={`p-3 rounded-xl bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon size={24} style={{ color }} />
            </div>
        </div>
        {change && (
            <p className="text-xs text-gray-500 mt-3 flex items-center">
                <TrendingUp size={14} className={change.startsWith('+') ? 'text-green-500 mr-1' : 'text-red-500 mr-1'} />
                <span className={change.startsWith('+') ? 'text-green-600' : 'text-red-600'}>{change}</span>
                <span className="ml-1">vs. último período</span>
            </p>
        )}
    </div>
);

const RecentCampaignItem = ({ name, status, timeAgo }) => {
    const statusStyles = {
        'Concluído': 'bg-green-100 text-green-700',
        'Em Andamento': 'bg-blue-100 text-blue-700 animate-pulse',
        'Pendente': 'bg-yellow-100 text-yellow-700',
        'Parado': 'bg-red-100 text-red-700',
    };
    const formatTimeAgo = (days) => {
        if (days === 0) return 'hoje';
        if (days === 1) return 'há 1 dia';
        return `há ${days} dias`;
    }
    return (
        <div className="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-gray-50">
            <div>
                <p className="font-semibold text-gray-800 text-sm">{name}</p>
                <p className="text-xs text-gray-500 flex items-center mt-1">
                    <Clock size={12} className="mr-1.5" />
                    {formatTimeAgo(timeAgo)}
                </p>
            </div>
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${statusStyles[status] || 'bg-gray-100 text-gray-700'}`}>
                {status}
            </span>
        </div>
    );
};


// --- COMPONENTE PRINCIPAL DO DASHBOARD ---
const Dashboard = () => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                setIsLoading(true);
                // --- CHAMADA REAL DA API ---
                const response = await api.get('/dashboard/');
                setData(response.data);
                setError(null);
            } catch (err) {
                console.error("Erro ao buscar dados do dashboard:", err);
                setError("Não foi possível carregar os dados do dashboard.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchDashboardData();
    }, []);
    
    if (isLoading) {
        return (
            <div className="animate-fade-in p-6 md:p-10">
                 <div className="h-10 w-1/3 bg-gray-200 rounded-lg animate-pulse mb-2"></div>
                 <div className="h-4 w-1/2 bg-gray-200 rounded-lg animate-pulse mb-8"></div>
                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 animate-pulse">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-200 rounded-2xl"></div>)}
                 </div>
                 <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
                    <div className="lg:col-span-2 h-80 bg-gray-200 rounded-2xl"></div>
                    <div className="h-80 bg-gray-200 rounded-2xl"></div>
                 </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-10 text-center text-red-500">
                <p>{error}</p>
            </div>
        )
    }

    // Mapeia os dados da API para o formato dos StatCards
    const stats = [
        { icon: Users, title: 'Total de Contatos', value: data.stats.totalContacts, color: '#3b82f6' },
        { icon: Target, title: 'Prospecções Ativas', value: data.stats.activeProspects, color: '#10b981' },
        { icon: CheckCircle, title: 'Leads Qualificados', value: data.stats.qualifiedLeads, color: '#f59e0b' },
        { icon: Percent, title: 'Taxa de Resposta', value: data.stats.responseRate, color: '#ef4444' },
    ];

    return (
        <div className="animate-fade-in p-6 md:p-10 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Dashboard de Prospecção</h1>
            <p className="text-gray-500 mb-8">Bem-vindo(a) de volta! Aqui está um resumo da sua atividade.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {stats.map((stat, index) => (
                    <StatCard key={index} {...stat} />
                ))}
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center">
                        <BarChart size={20} className="mr-2 text-gray-500" />
                        Atividade (Aproximação)
                    </h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.activityChart} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorContatos" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorRespostas" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                                <YAxis stroke="#6b7280" fontSize={12} />
                                <Tooltip contentStyle={{ borderRadius: "12px", borderColor: "#e5e7eb" }} />
                                <Area type="monotone" dataKey="contatos" name="Contatos Enviados" stroke="#3b82f6" fillOpacity={1} fill="url(#colorContatos)" />
                                <Area type="monotone" dataKey="respostas" name="Respostas Recebidas" stroke="#10b981" fillOpacity={1} fill="url(#colorRespostas)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                     <h3 className="font-bold text-lg text-gray-800 mb-4">Campanhas Recentes</h3>
                     <div className="space-y-2">
                        {data.recentCampaigns.map((campaign, index) => (
                           <RecentCampaignItem key={index} {...campaign} />
                        ))}
                     </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

