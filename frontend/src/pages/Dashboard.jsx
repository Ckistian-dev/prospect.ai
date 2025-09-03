import React from 'react';
import { Users, Target, CheckCircle, Percent } from 'lucide-react';

const StatCard = ({ icon, title, value, change, color }) => {
    const Icon = icon;
    return (
        <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    <p className="text-3xl font-bold text-gray-800">{value}</p>
                </div>
                <div className={`p-3 rounded-full`} style={{ backgroundColor: `${color}20` }}>
                    <Icon size={24} style={{ color: color }} />
                </div>
            </div>
            {change && (
                <p className="text-xs text-gray-500 mt-2">
                    <span className={change.startsWith('+') ? 'text-green-500' : 'text-red-500'}>{change}</span> vs. último mês
                </p>
            )}
        </div>
    );
};

const Dashboard = () => {
    const stats = [
        { icon: Users, title: 'Total de Contatos', value: '1,432', change: '+12.5%', color: '#356854' },
        { icon: Target, title: 'Prospecções Ativas', value: '8', change: '+2', color: '#4A90E2' },
        { icon: CheckCircle, title: 'Respostas Obtidas', value: '312', change: '-5.2%', color: '#50E3C2' },
        { icon: Percent, title: 'Taxa de Conversão', value: '21.8%', change: '+1.8%', color: '#F5A623' },
    ];

    return (
        <div className="animate-fade-in p-6 md:p-10">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Dashboard</h1>
            <p className="text-gray-500 mb-8">Bem-vindo de volta! Aqui está um resumo da sua atividade.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {stats.map((stat, index) => (
                    <StatCard key={index} {...stat} />
                ))}
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Placeholder para Gráfico de Atividade */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md">
                    <h3 className="font-bold text-lg text-gray-800 mb-4">Atividade de Prospecção (Últimos 30 dias)</h3>
                    <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                        <p className="text-gray-400">Gráfico em breve...</p>
                    </div>
                </div>
                
                {/* Placeholder para Campanhas Recentes */}
                <div className="bg-white p-6 rounded-xl shadow-md">
                     <h3 className="font-bold text-lg text-gray-800 mb-4">Campanhas Recentes</h3>
                     <div className="space-y-4">
                        <div className="h-12 bg-gray-100 rounded-lg animate-pulse"></div>
                        <div className="h-12 bg-gray-100 rounded-lg animate-pulse" style={{animationDelay: '100ms'}}></div>
                        <div className="h-12 bg-gray-100 rounded-lg animate-pulse" style={{animationDelay: '200ms'}}></div>
                     </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
