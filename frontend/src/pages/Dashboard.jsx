import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Users, Target, CheckCircle, Percent, BarChart3, Clock, TrendingUp,
    Loader2, AlertCircle, Calendar as CalendarIcon, Send, Lightbulb, Zap,
    ArrowRight, FileDown
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api/axiosConfig';
import { subDays, startOfMonth, endOfMonth } from 'date-fns';
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

registerLocale('pt-BR', ptBR);

const AnalysisReport = ({ analysisData, onDownload }) => {
    const reportRef = useRef(null);

    const handleDownload = () => {
        const input = reportRef.current;
        if (input) {
            onDownload(input);
        }
    };

    const report = analysisData;

    const impactColors = {
        'Alto': 'bg-red-100 text-red-800',
        'Médio': 'bg-yellow-100 text-yellow-800',
        'Baixo': 'bg-blue-100 text-blue-800',
    };

    const Section = ({ icon, title, children }) => (
        <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                    {icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            </div>
            <div className="pl-11 space-y-4">{children}</div>
        </div>
    );

    return (
        <div className="mt-6 p-6 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Relatório de Análise da IA</h2>
                    <p className="text-sm text-gray-500">Análise gerada com base nos dados e na sua pergunta.</p>
                </div>
                <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg shadow-sm text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                    <FileDown size={16} /> Baixar PDF
                </button>
            </div>
            <div ref={reportRef} className="p-4 bg-white">
                {report.diagnostico_geral && (
                    <Section icon={<BarChart3 size={16} />} title="Diagnóstico Geral">
                        <p className="text-gray-600 text-sm leading-relaxed">{report.diagnostico_geral}</p>
                    </Section>
                )}
                {report.principais_pontos_de_friccao?.length > 0 && (
                    <Section icon={<AlertCircle size={16} />} title="Principais Pontos de Fricção">
                        <div className="space-y-4">
                            {report.principais_pontos_de_friccao.map((item, index) => (
                                <div key={index} className="p-4 bg-white border border-gray-200 rounded-lg">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-semibold text-gray-700">{item.area}</h4>
                                        {item.impacto_na_conversao && (
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${impactColors[item.impacto_na_conversao] || 'bg-gray-100 text-gray-800'}`}>
                                                Impacto: {item.impacto_na_conversao}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-2">{item.observacoes}</p>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
                {report.insights_acionaveis?.length > 0 && (
                    <Section icon={<Lightbulb size={16} />} title="Insights e Sugestões">
                        <div className="space-y-4">
                            {report.insights_acionaveis.map((insight, index) => (
                                <div key={index} className="p-4 bg-white border border-gray-200 rounded-lg">
                                    <h4 className="font-semibold text-gray-700 mb-2">{insight.titulo}</h4>
                                    <ul className="list-disc list-inside space-y-1">
                                        {insight.sugestoes.map((sugestao, sIndex) => (
                                            <li key={sIndex} className="text-sm text-gray-600">{sugestao}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
                {report.proximos_passos_recomendados && (
                    <Section icon={<Zap size={16} />} title="Próximos Passos Recomendados">
                        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                            <ArrowRight size={20} className="text-blue-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-blue-800">{report.proximos_passos_recomendados}</p>
                        </div>
                    </Section>
                )}
            </div>
        </div>
    );
};

const StatCard = ({ icon: Icon, title, value, color }) => (
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

const DateRangeFilter = ({ onDateChange }) => {
    const [active, setActive] = useState('30d');
    const [customRange, setCustomRange] = useState([subDays(new Date(), 29), new Date()]);
    const [showCustomPicker, setShowCustomPicker] = useState(false);

    const ranges = {
        '7d': { label: 'Últimos 7 dias', days: 6 },
        '30d': { label: 'Últimos 30 dias', days: 29 },
        'this_month': { label: 'Este Mês' },
        'custom': { label: 'Personalizado' }
    };

    const handleSelect = (key) => {
        setActive(key);
        let start, end = new Date();

        if (key === 'this_month') {
            setShowCustomPicker(false);
            start = startOfMonth(end);
        } else if (key === 'custom') {
            setShowCustomPicker(!showCustomPicker);
            return;
        } else {
            start = subDays(end, ranges[key].days);
        }
        onDateChange(start, end);
    };

    return (
        <div className="relative">
            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                {Object.entries(ranges).map(([key, { label }]) => (
                    <button
                        key={key}
                        onClick={() => handleSelect(key)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${active === key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                    >
                        {key === 'custom' && <CalendarIcon size={14} />}
                        {label}
                    </button>
                ))}
            </div>
            {showCustomPicker && (
                <div className="absolute top-full right-0 mt-2 bg-white p-4 rounded-xl shadow-lg border border-gray-200 z-20 w-80">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Selecione um período</p>
                    <DatePicker
                        selectsRange={true}
                        startDate={customRange[0]}
                        endDate={customRange[1]}
                        onChange={(update) => setCustomRange(update)}
                        inline
                        locale="pt-BR"
                        dateFormat="dd/MM/yyyy"
                        maxDate={new Date()}
                    />
                    <div className="flex justify-end gap-2 mt-3">
                        <button onClick={() => setShowCustomPicker(false)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200">
                            Cancelar
                        </button>
                        <button
                            onClick={() => {
                                if (customRange[0] && customRange[1]) {
                                    onDateChange(customRange[0], customRange[1]);
                                    setShowCustomPicker(false);
                                }
                            }}
                            className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300"
                            disabled={!customRange[0] || !customRange[1]}>
                            Aplicar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const AIAnalyzer = ({ onAnalyze, isLoading, analysis, error, onDownloadPdf }) => {
    const [question, setQuestion] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (question.trim()) {
            onAnalyze(question);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Análise com IA</h3>
            <p className="text-gray-500 mb-6">
                Faça uma pergunta e a IA irá analisar os dados de prospecção do <strong className="font-semibold text-gray-700">período selecionado</strong> para gerar insights.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ex: Como posso melhorar minha taxa de resposta?"
                    className="flex-grow px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green"
                    disabled={isLoading}
                />
                <button type="submit" className="px-6 py-3 bg-brand-green text-white rounded-lg font-semibold hover:bg-brand-green-dark transition-colors flex items-center gap-2 disabled:bg-green-300" disabled={isLoading}>
                    {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                    Analisar
                </button>
            </form>

            {isLoading && (
                <div className="mt-6 flex items-center justify-center text-gray-500">
                    <Loader2 size={24} className="animate-spin mr-3" />
                    <span>A IA está pensando... Isso pode levar alguns segundos.</span>
                </div>
            )}
            {error && (
                <div className="mt-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-3">
                    <AlertCircle size={20} />
                    <div>
                        <p className="font-semibold">Ocorreu um erro</p>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            )}
            {analysis && !isLoading && (
                <AnalysisReport analysisData={analysis} onDownload={onDownloadPdf} />
            )}
        </div>
    );
};

// --- COMPONENTE PRINCIPAL DO DASHBOARD ---
const Dashboard = () => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [dateRange, setDateRange] = useState({ startDate: subDays(new Date(), 29), endDate: new Date() });
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [analysisError, setAnalysisError] = useState('');

    const fetchData = useCallback(async (startDate, endDate) => {
        setIsLoading(true);
        setError('');
        try {
            const params = {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
            };
            const response = await api.get('/dashboard/', { params });
            setData(response.data);
        } catch (err) {
            console.error("Erro ao carregar dados do dashboard:", err);
            setError('Não foi possível carregar os dados do dashboard. Tente novamente mais tarde.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData(dateRange.startDate, dateRange.endDate);
    }, [fetchData, dateRange]);

    const handleDateChange = (startDate, endDate) => {
        setDateRange({ startDate, endDate });
    };

    const handleAIAnalysis = async (question) => {
        setIsAnalyzing(true);
        setAnalysisResult(null);
        setAnalysisError('');
        try {
            const response = await api.post('/dashboard/analyze', {
                question,
                start_date: dateRange.startDate.toISOString(),
                end_date: dateRange.endDate.toISOString(),
            });
            setAnalysisResult(response.data.analysis);
        } catch (err) {
            console.error("Erro na análise da IA:", err);
            setAnalysisError(err.response?.data?.detail || 'Falha ao se comunicar com o serviço de análise.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleDownloadPdf = (element) => {
        html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const imgWidth = pdfWidth - 20;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
            pdf.save(`relatorio-prospectai-${new Date().toISOString().split('T')[0]}.pdf`);
        });
    };

    if (isLoading && !data) {
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
        return <div className="flex h-full items-center justify-center text-red-600 p-10">{error}</div>;
    }

    if (!data) {
        return <div className="flex h-full items-center justify-center text-gray-500 p-10">Nenhum dado para exibir.</div>;
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Dashboard de Prospecção</h1>
                    <p className="text-gray-500 mt-1">Bem-vindo(a) de volta! Aqui está um resumo da sua atividade.</p>
                </div>
                <DateRangeFilter onDateChange={handleDateChange} />
            </div>

            {isLoading && <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10"><Loader2 size={32} className="animate-spin text-brand-green" /></div>}

            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    {stats.map((stat, index) => (
                        <StatCard key={index} {...stat} />
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center">
                            <BarChart3 size={20} className="mr-2 text-gray-500" />
                            Atividade por Dia
                        </h3>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data.activityChart} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip />
                                    <Legend wrapperStyle={{ fontSize: "14px" }} />
                                    <Line type="monotone" dataKey="contatos" name="Contatos Enviados" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="respostas" name="Respostas Recebidas" stroke="#10b981" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-lg text-gray-800 mb-4">Campanhas Recentes</h3>
                        <div className="space-y-2">
                            {data.recentCampaigns.length > 0 ? data.recentCampaigns.map((campaign, index) => (
                               <RecentCampaignItem key={index} {...campaign} /> 
                            )) : <p className="text-center text-gray-500 py-8">Nenhuma campanha recente.</p>}
                        </div>
                    </div>
                </div>

                <AIAnalyzer
                    onAnalyze={handleAIAnalysis}
                    isLoading={isAnalyzing}
                    analysis={analysisResult}
                    error={analysisError}
                    onDownloadPdf={handleDownloadPdf}
                />
            </div>
        </div>
    );
};

export default Dashboard;
