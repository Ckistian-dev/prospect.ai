import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../api/axiosConfig';
import PageLoader from '../components/common/PageLoader';

import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { subDays, startOfMonth, endOfMonth, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { LLM_MODELS, DEFAULT_MODEL } from '../constants/models';
import {
    Loader2, TrendingUp, CheckCircle, Percent, Cpu, Send, AlertCircle,
    Calendar as CalendarIcon, Lightbulb, Zap, ArrowRight, BarChart3,
    AlertTriangle, FileDown, Target, Activity, Clock, Users, Star,
    TrendingDown, CheckCircle2, XCircle, Sparkles, LayoutGrid, Radio,
    PieChart as PieIcon, BarChart2, Brain, ChevronUp, ChevronDown, Minus, Info, Filter, ChevronRight
} from 'lucide-react';

registerLocale('pt-BR', ptBR);

// ─── DESIGN SYSTEM ───────────────────────────────────────────────────────────
const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
.dashboard-page { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
.dashboard-page h1, .dashboard-page h2, .dashboard-page h3, .dashboard-page h4 { font-family: 'Plus Jakarta Sans', sans-serif; }
.ds-surface { background: #ffffff; border-radius: 2.5rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 30px rgba(0,0,0,0.02); }
.ds-card { background: #ffffff; border-radius: 2rem; border: 1px solid rgba(0,0,0,0.05); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
.ds-card:hover { transform: translateY(-8px); box-shadow: 0 20px 40px rgba(15,23,42,0.08); border-color: rgba(53,104,84,0.1); }
.stat-value { font-family: 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.04em; }
.ai-gradient { background: linear-gradient(135deg, #1b3d2f 0%, #356854 100%); }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
`;

// ─── PALETA E MAPS ───────────────────────────────────────────────────────────
const CHART_PALETTE = ['#356854', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#ef4444'];

const COR_MAP = {
    verde: { pill: 'bg-emerald-100 text-emerald-700', icon: 'bg-emerald-500', ring: 'ring-emerald-200' },
    vermelho: { pill: 'bg-red-100 text-red-700', icon: 'bg-red-500', ring: 'ring-red-200' },
    amarelo: { pill: 'bg-amber-100 text-amber-700', icon: 'bg-amber-500', ring: 'ring-amber-200' },
    azul: { pill: 'bg-blue-100 text-blue-700', icon: 'bg-blue-500', ring: 'ring-blue-200' },
    roxo: { pill: 'bg-violet-100 text-violet-700', icon: 'bg-violet-500', ring: 'ring-violet-200' },
};

const ICON_MAP = {
    trending: <TrendingUp size={18} />,
    alert: <AlertTriangle size={18} />,
    lightbulb: <Lightbulb size={18} />,
    target: <Target size={18} />,
    zap: <Zap size={18} />,
    percent: <Percent size={18} />,
    users: <Users size={18} />,
    clock: <Clock size={18} />,
    activity: <Activity size={18} />,
};

const PRIORIDADE_CONFIG = {
    alta: { label: 'Alta', border: 'border-l-red-500', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700' },
    media: { label: 'Média', border: 'border-l-amber-500', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
    baixa: { label: 'Baixa', border: 'border-l-emerald-400', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700' },
};

const IMPACTO_CONFIG = {
    Alto: { pill: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
    Médio: { pill: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
    Baixo: { pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

const ESTILO_CONFIG = {
    diagnostico: { icon: <Brain size={16} />, border: 'border-l-[#356854]', bg: 'bg-emerald-50/50', label: 'Diagnóstico', text: 'text-[#356854]' },
    estrategia: { icon: <Target size={16} />, border: 'border-l-violet-500', bg: 'bg-violet-50', label: 'Estratégia', text: 'text-violet-600' },
    conclusao: { icon: <CheckCircle2 size={16} />, border: 'border-l-emerald-500', bg: 'bg-emerald-50', label: 'Conclusão', text: 'text-emerald-600' },
};

// ─── COMPONENTES AUXILIARES ───────────────────────────────────────────────────
const TypingText = ({ text, speed = 15 }) => {
    const [displayedText, setDisplayedText] = useState('');
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (index < text.length) {
            const timeout = setTimeout(() => {
                setDisplayedText(prev => prev + text[index]);
                setIndex(prev => prev + 1);
            }, speed);
            return () => clearTimeout(timeout);
        }
    }, [index, text, speed]);

    return <span>{displayedText}</span>;
};

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3 shadow-xl border border-slate-100 text-sm">
            {label && <p className="text-slate-500 text-xs mb-2 font-semibold">{label}</p>}
            {payload.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color || entry.fill }} />
                    <span className="text-slate-800 font-bold">{entry.value?.toLocaleString('pt-BR')}</span>
                    <span className="text-slate-400">{entry.name}</span>
                </div>
            ))}
        </div>
    );
};

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

// ─── MÓDULOS IA ───────────────────────────────────────────────────────────────
const HeroStatModule = ({ modulo }) => {
    const trendMap = {
        alta: { icon: <ChevronUp size={20} />, class: 'text-emerald-400 bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Crescimento' },
        baixa: { icon: <ChevronDown size={20} />, class: 'text-rose-400 bg-rose-500/10', border: 'border-rose-500/20', label: 'Queda' },
        neutro: { icon: <Minus size={20} />, class: 'text-emerald-400 bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Estável' },
    };
    const trend = trendMap[modulo.tendencia] || trendMap.neutro;
    
    return (
        <div className="relative overflow-hidden rounded-[32px] p-8 sm:p-12 shadow-2xl transition-all duration-500 border border-white/20 bg-gradient-to-br from-[#1b3d2f] via-[#2d5746] to-[#356854] group">
            <div className="absolute top-[-100px] right-[-100px] w-80 h-80 rounded-full bg-emerald-400/20 blur-[100px]" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-10">
                <div className="space-y-4">
                    <div className="inline-flex items-center gap-2.5 px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/20">
                        <Sparkles size={14} className="text-emerald-200 animate-pulse" />
                        <p className="text-emerald-100 text-[11px] font-black uppercase tracking-[0.2em]">Insight de Performance</p>
                    </div>
                    <div>
                        <p className="text-white text-7xl sm:text-8xl font-black tracking-tighter leading-none">{modulo.valor}</p>
                        <p className="text-emerald-100/90 text-2xl sm:text-3xl font-bold mt-2">{modulo.label}</p>
                    </div>
                </div>
                <div className="flex flex-col gap-6 items-start md:items-end">
                    <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black border backdrop-blur-xl shadow-xl ${trend.border} ${trend.class}`}>
                        {trend.icon} <span>{trend.label}</span>
                    </div>
                    {modulo.descricao && (
                        <p className="text-emerald-50/70 text-base max-w-[280px] md:text-right leading-relaxed font-medium italic">"{modulo.descricao}"</p>
                    )}
                </div>
            </div>
        </div>
    );
};

const MetricGridModule = ({ modulo }) => (
    <div className="rounded-[32px] bg-white p-8 shadow-2xl shadow-slate-200/40 border border-slate-100">
        {modulo.titulo && (
            <div className="flex items-center gap-3 mb-8">
                <div className="p-2.5 bg-emerald-50 rounded-2xl"><LayoutGrid size={22} className="text-[#356854]" /></div>
                <h3 className="text-slate-900 font-black text-xl tracking-tight">{modulo.titulo}</h3>
            </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(modulo.metricas || []).map((m, i) => {
                const cor = COR_MAP[m.cor] || COR_MAP.verde;
                return (
                    <div key={i} className="group relative rounded-[28px] p-6 bg-slate-50/50 hover:bg-white hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-500 border border-transparent hover:border-emerald-100">
                        <div className={`w-12 h-12 rounded-2xl ${cor.icon} text-white flex items-center justify-center mb-5 shadow-lg`}>
                            {ICON_MAP[m.icone] || <Activity size={22} />}
                        </div>
                        <p className="text-4xl font-black text-slate-900 tracking-tighter leading-none mb-2">{m.valor}</p>
                        <p className="text-slate-500 text-[11px] font-black uppercase tracking-[0.15em] leading-snug">{m.label}</p>
                    </div>
                );
            })}
        </div>
    </div>
);

const FrictionCardsModule = ({ modulo }) => (
    <div className="rounded-[32px] bg-white p-8 shadow-2xl shadow-slate-200/40 border border-slate-100">
        <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-rose-50 rounded-2xl"><AlertTriangle size={22} className="text-rose-600" /></div>
            <h3 className="text-slate-900 font-black text-xl tracking-tight">{modulo.titulo || 'Pontos de Fricção'}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(modulo.itens || []).map((item, i) => {
                const cfg = IMPACTO_CONFIG[item.impacto] || IMPACTO_CONFIG['Baixo'];
                return (
                    <div key={i} className="group rounded-[28px] p-6 bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-2xl transition-all duration-500">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <h4 className="text-slate-800 font-black text-base leading-tight flex-1">{item.area}</h4>
                            <span className={`shrink-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${cfg.pill} border border-current/10`}>
                                <span className={`w-2 h-2 rounded-full ${cfg.dot} animate-pulse`} /> {item.impacto}
                            </span>
                        </div>
                        <p className="text-slate-500 text-sm leading-relaxed font-medium mb-6">{item.observacoes}</p>
                    </div>
                );
            })}
        </div>
    </div>
);

const InsightCardsModule = ({ modulo }) => (
    <div className="rounded-[32px] bg-white p-8 shadow-2xl shadow-slate-200/40 border border-slate-100">
        <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-amber-50 rounded-2xl"><Sparkles size={22} className="text-amber-600" /></div>
            <h3 className="text-slate-900 font-black text-xl tracking-tight">{modulo.titulo || 'Insights Estratégicos'}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(modulo.itens || []).map((item, i) => {
                const pri = PRIORIDADE_CONFIG[item.prioridade] || PRIORIDADE_CONFIG.media;
                return (
                    <div key={i} className={`group relative rounded-[28px] p-7 border-l-8 ${pri.border} ${pri.bg} transition-all duration-500`}>
                        <div className="flex items-start gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-white flex-shrink-0 flex items-center justify-center text-slate-600 shadow-lg">
                                {ICON_MAP[item.icone] || <Lightbulb size={24} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-3 flex-wrap">
                                    <h4 className="text-slate-900 font-black text-base tracking-tight">{item.titulo}</h4>
                                    <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${pri.badge} shadow-sm border border-black/5`}>Prioridade {pri.label}</span>
                                </div>
                                <p className="text-slate-600 text-sm leading-relaxed font-medium">{item.descricao}</p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

const TextSectionModule = ({ modulo }) => {
    const cfg = ESTILO_CONFIG[modulo.estilo] || ESTILO_CONFIG.diagnostico;
    return (
        <div className={`rounded-[32px] border-l-[12px] border border-slate-100 ${cfg.border} ${cfg.bg} p-10 shadow-xl shadow-slate-200/20`}>
            <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg ${cfg.text}`}>{cfg.icon}</div>
                <div>
                    <span className={`text-xs font-black uppercase tracking-[0.25em] ${cfg.text}`}>{cfg.label}</span>
                    {modulo.titulo && <h4 className="text-slate-900 font-black text-xl tracking-tight mt-1">{modulo.titulo}</h4>}
                </div>
            </div>
            <p className="text-slate-700 leading-relaxed text-lg font-medium italic">"{modulo.conteudo}"</p>
        </div>
    );
};

const ModuleRenderer = ({ modulo, index }) => {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setVisible(true), index * 100);
        return () => clearTimeout(t);
    }, [index]);

    const style = {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.98)',
        transition: `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.1}s`,
    };

    const node = (() => {
        switch (modulo.tipo) {
            case 'hero_stat': return <HeroStatModule modulo={modulo} />;
            case 'metric_grid': return <MetricGridModule modulo={modulo} />;
            case 'friction_cards': return <FrictionCardsModule modulo={modulo} />;
            case 'insight_cards': return <InsightCardsModule modulo={modulo} />;
            case 'text_section': return <TextSectionModule modulo={modulo} />;
            default:
                return (
                    <div className="rounded-[32px] p-6 bg-slate-50 border border-dashed border-slate-200">
                        <p className="text-slate-400 text-sm font-mono flex items-center gap-2"><Info size={14} /> Módulo: {modulo.tipo}</p>
                    </div>
                );
        }
    })();

    return <div style={style}>{node}</div>;
};

// ─── ANÁLISE IA - RELATÓRIO ───────────────────────────────────────────────────
const AnalysisReport = ({ analysisData }) => {
    const reportRef = useRef(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const resposta_direta = analysisData?.resposta_direta || '';
    const modulos = analysisData?.modulos || [];

    const normalizedModulos = useMemo(() => {
        if (modulos.length > 0) return modulos;
        const ac = analysisData; 
        const fallback = [];
        if (ac.diagnostico_geral) fallback.push({ tipo: 'text_section', titulo: 'Diagnóstico', conteudo: ac.diagnostico_geral, estilo: 'diagnostico' });
        if (ac.principais_pontos_de_friccao?.length) fallback.push({
            tipo: 'friction_cards', titulo: 'Pontos de Fricção',
            itens: ac.principais_pontos_de_friccao.map(p => ({ area: p.area, observacoes: p.observacoes, impacto: p.impacto_na_conversao }))
        });
        if (ac.insights_acionaveis?.length) fallback.push({
            tipo: 'insight_cards', titulo: 'Insights',
            itens: ac.insights_acionaveis.map(ins => ({ titulo: ins.titulo, descricao: (ins.sugestoes || []).join(' '), prioridade: 'media', icone: 'lightbulb' }))
        });
        return fallback;
    }, [modulos, analysisData]);

    const handleDownloadPdf = async () => {
        if (!reportRef.current) return;
        setIsDownloading(true);
        try {
            const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = pdf.internal.pageSize.getHeight();
            const imgW = pdfW - 20;
            let imgH = imgW / (canvas.width / canvas.height);
            let heightLeft = imgH;
            let pos = 10;
            pdf.addImage(imgData, 'PNG', 10, pos, imgW, imgH);
            heightLeft -= (pdfH - 20);
            while (heightLeft > 0) {
                pdf.addPage();
                pos = heightLeft - imgH + 10;
                pdf.addImage(imgData, 'PNG', 10, pos, imgW, imgH);
                heightLeft -= (pdfH - 20);
            }
            pdf.save(`relatorio-prospectai-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
        } catch { alert("Erro ao gerar PDF."); }
        finally { setIsDownloading(false); }
    };

    return (
        <div className="mt-10 space-y-8 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-2">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#1b3d2f] to-[#356854] flex items-center justify-center shadow-xl shadow-emerald-200">
                        <Brain size={28} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-slate-900 font-black text-2xl tracking-tight">Relatório ProspectAI</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{format(new Date(), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleDownloadPdf}
                    disabled={isDownloading}
                    className="flex items-center gap-3 px-6 py-3.5 bg-white text-slate-700 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-xl shadow-slate-200/50 border border-slate-100"
                >
                    {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                    {isDownloading ? 'Gerando...' : 'Exportar PDF'}
                </button>
            </div>

            {resposta_direta && (
                <div className="relative group overflow-hidden p-8 rounded-[32px] bg-gradient-to-br from-emerald-50/50 to-white border border-emerald-100 shadow-xl transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles size={120} className="text-[#356854]" /></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2.5 mb-4">
                            <Sparkles size={18} className="text-[#356854]" />
                            <p className="text-[#356854] text-xs font-black uppercase tracking-[0.25em]">Resposta da IA</p>
                        </div>
                        <p className="text-slate-800 font-bold text-lg sm:text-xl leading-relaxed italic">
                            <TypingText text={resposta_direta} speed={10} />
                        </p>
                    </div>
                </div>
            )}

            <div ref={reportRef} className="flex flex-col gap-8 rounded-[40px] p-2 sm:p-4 bg-slate-50/50">
                {normalizedModulos.map((modulo, i) => <ModuleRenderer key={i} modulo={modulo} index={i} />)}
            </div>
        </div>
    );
};

// ─── AI ANALYZER PANEL ────────────────────────────────────────────────────────
const AIAnalyzer = ({ onAnalyze, isLoading, analysis, error }) => {
    const [question, setQuestion] = useState('');
    const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
    const [useAllContacts, setUseAllContacts] = useState(false);

    const predefined = [
        { q: "Resumo dos atendimentos e status?", icon: <Users size={13} />, color: 'text-[#356854]' },
        { q: "Por que perdemos conversão?", icon: <AlertTriangle size={13} />, color: 'text-rose-500' },
        { q: "Identifique gargalos operacionais.", icon: <Clock size={13} />, color: 'text-amber-500' },
        { q: "Sugira ações para converter mais.", icon: <TrendingUp size={13} />, color: 'text-emerald-500' },
    ];

    const handleSubmit = (e) => {
        e.preventDefault();
        if (question.trim()) onAnalyze(question, selectedModel, useAllContacts);
    };

    return (
        <div className="relative group overflow-hidden bg-white rounded-[40px] p-6 sm:p-10 mt-12 border border-slate-100 shadow-2xl shadow-slate-200/60 transition-all duration-500">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#1b3d2f] via-[#356854] to-emerald-500" />
            
            <div className="relative z-10 flex flex-col lg:flex-row items-center lg:items-start gap-8 mb-12">
                <div className="w-20 h-20 rounded-[28px] bg-gradient-to-tr from-[#1b3d2f] via-[#356854] to-emerald-500 flex items-center justify-center shadow-2xl ring-4 ring-emerald-50">
                    <Brain size={36} className="text-white animate-pulse" />
                </div>
                <div className="flex-1 text-center lg:text-left">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-4">
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <h3 className="text-slate-900 font-black text-2xl tracking-tighter uppercase italic">Centro de Comando IA</h3>
                            <div className="px-3 py-1 rounded-full bg-emerald-50 text-[#356854] text-[10px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1.5">
                                <Sparkles size={10} /> Ativo
                            </div>
                        </div>

                        <button 
                            type="button"
                            onClick={() => setUseAllContacts(!useAllContacts)}
                            className={`group flex items-center gap-5 px-6 py-3 rounded-[20px] transition-all duration-300 border-2 ${useAllContacts ? 'bg-emerald-50/50 border-emerald-200 shadow-sm' : 'bg-white border-slate-100 hover:border-emerald-100'}`}
                        >
                            <div className="flex flex-col items-end">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${useAllContacts ? 'text-[#356854]' : 'text-slate-400 group-hover:text-slate-600'}`}>Base de Dados Estendida</span>
                                <span className="text-[9px] font-bold text-slate-400">Incluir todos os contatos</span>
                            </div>
                            <div className={`w-12 h-6 rounded-full p-1 transition-all duration-500 flex items-center ${useAllContacts ? 'bg-[#356854]' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-500 ${useAllContacts ? 'translate-x-6' : 'translate-x-0'}`} />
                            </div>
                        </button>
                    </div>
                    <p className="text-slate-500 text-base font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
                        Analise padrões ocultos e receba recomendações estratégicas baseadas em inteligência conversacional profunda.
                    </p>
                </div>
            </div>

            <div className="relative z-10 flex flex-col gap-8">
                <div className="flex flex-col xl:flex-row gap-6 items-stretch xl:items-end">
                    <div className="w-full xl:w-72 space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-2">Modelo de IA</label>
                        <select
                            value={selectedModel}
                            onChange={e => setSelectedModel(e.target.value)}
                            className="w-full bg-slate-50 border-2 border-slate-100 text-slate-800 text-sm rounded-[20px] px-5 py-4 focus:outline-none focus:border-[#356854] font-bold appearance-none cursor-pointer"
                        >
                            {LLM_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>

                    <form onSubmit={handleSubmit} className="flex-1 flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Send size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                                type="text"
                                value={question}
                                onChange={e => setQuestion(e.target.value)}
                                placeholder="O que você quer analisar hoje?"
                                className="w-full bg-slate-50 border-2 border-slate-100 text-slate-900 placeholder-slate-400 text-base font-bold rounded-[24px] pl-14 pr-6 py-4 focus:outline-none focus:border-[#356854]"
                                disabled={isLoading}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading || !question.trim()}
                            className="w-full sm:w-auto px-10 py-4 bg-[#1b3d2f] text-white rounded-[24px] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#356854] transition-all shadow-xl disabled:opacity-30"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                            <span>{isLoading ? 'Analisando' : 'Processar'}</span>
                        </button>
                    </form>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {predefined.map(({ q, icon, color }, i) => (
                        <button
                            key={i}
                            onClick={() => setQuestion(q)}
                            disabled={isLoading}
                            className="flex items-center gap-3 text-[11px] font-black uppercase tracking-wider px-5 py-3 rounded-2xl bg-white border-2 border-slate-100 text-slate-500 hover:text-[#356854] hover:border-emerald-100 transition-all disabled:opacity-50"
                        >
                            <span className={color}>{icon}</span> {q}
                        </button>
                    ))}
                </div>
            </div>

            {error && !isLoading && (
                <div className="mt-8 p-6 bg-rose-50 border border-rose-100 rounded-[28px] flex items-center gap-4">
                    <AlertCircle size={24} className="text-rose-500" />
                    <div>
                        <p className="text-rose-900 font-black text-sm uppercase tracking-tight">Falha na análise</p>
                        <p className="text-rose-700 text-xs font-bold">{error}</p>
                    </div>
                </div>
            )}

            {isLoading && (
                <div className="mt-12 py-20 flex flex-col items-center justify-center gap-8">
                    <div className="relative">
                        <div className="absolute inset-0 w-24 h-24 bg-emerald-500/20 rounded-full animate-ping" />
                        <div className="relative w-24 h-24 rounded-[32px] bg-white shadow-2xl flex items-center justify-center border border-emerald-50">
                            <Brain size={48} className="text-[#356854] animate-bounce" />
                        </div>
                    </div>
                    <p className="text-slate-900 font-black text-2xl tracking-tight">Sincronizando Insights...</p>
                </div>
            )}

            {analysis && !isLoading && <AnalysisReport analysisData={analysis} />}
        </div>
    );
};

// ─── DASHBOARD PRINCIPAL ──────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, title, value, color, description }) => (
    <div className="ds-card p-10 flex flex-col justify-between min-h-[220px]">
        <div className="flex items-center justify-between">
            <div className="w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl" style={{ background: color, boxShadow: `0 15px 30px ${color}33` }}>
                <Icon size={32} />
            </div>
            <div className="flex flex-col items-end">
                <div className="h-6 px-3 bg-slate-50 text-slate-400 font-black text-[9px] uppercase tracking-widest rounded-lg flex items-center">{title}</div>
                <div className="flex items-center gap-1.5 text-emerald-500 mt-2 font-black text-[10px] tracking-widest"><Activity size={12} /> SYNCED</div>
            </div>
        </div>
        <div className="mt-8">
            <h3 className="stat-value text-5xl font-black text-slate-800 leading-none">
                {typeof value === 'number' ? <CountUp end={value} /> : value}
            </h3>
            <p className="text-[10px] text-slate-400 font-black mt-3 uppercase tracking-[0.2em]">{description}</p>
        </div>
    </div>
);

const DateRangeFilter = ({ onDateChange }) => {
    const [active, setActive] = useState('30d');
    const [customRange, setCustomRange] = useState([subDays(new Date(), 29), new Date()]);
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const ranges = { '7d': '7D', '30d': '30D', 'this_month': 'Mês', 'custom': <CalendarIcon size={18} /> };

    const handleSelect = (key) => {
        setActive(key);
        if (key === 'custom') { setShowCustomPicker(!showCustomPicker); return; }
        setShowCustomPicker(false);
        let start = new Date(), end = new Date();
        if (key === 'this_month') start = startOfMonth(end);
        else start = subDays(end, key === '7d' ? 6 : 29);
        onDateChange(start, end);
    };

    return (
        <div className="relative flex items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
            {Object.entries(ranges).map(([key, label]) => (
                <button key={key} onClick={() => handleSelect(key)} className={`h-12 px-6 text-[11px] font-black tracking-widest rounded-xl transition-all ${active === key ? 'bg-[#356854] text-white shadow-lg shadow-emerald-900/10' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>{label}</button>
            ))}
            {showCustomPicker && (
                <div className="absolute top-full right-0 mt-6 bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-50 z-50 w-[400px]">
                    <DatePicker selectsRange startDate={customRange[0]} endDate={customRange[1]} onChange={update => setCustomRange(update)} inline locale="pt-BR" maxDate={new Date()} />
                    <div className="flex gap-4 mt-10">
                        <button onClick={() => setShowCustomPicker(false)} className="flex-1 h-14 bg-slate-50 text-slate-400 font-black text-xs uppercase tracking-widest rounded-2xl">Cancelar</button>
                        <button onClick={() => { if (customRange[0] && customRange[1]) { onDateChange(customRange[0], customRange[1]); setShowCustomPicker(false); } }} className="flex-1 h-14 bg-[#356854] text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-900/10">Aplicar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const Dashboard = () => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [dateRange, setDateRange] = useState({ startDate: subDays(new Date(), 29), endDate: new Date() });
    const [selectedCampaigns, setSelectedCampaigns] = useState([]);
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [analysisError, setAnalysisError] = useState('');

    const fetchData = useCallback(async (start, end, ids) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('start_date', start.toISOString());
            params.append('end_date', end.toISOString());
            if (ids?.length > 0) ids.forEach(id => params.append('prospect_ids', id));
            const response = await api.get('/dashboard/', { params });
            setData(response.data);
        } catch (err) { setError('Falha ao processar estatísticas.'); }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchData(dateRange.startDate, dateRange.endDate, selectedCampaigns); }, [fetchData, dateRange, selectedCampaigns]);

    const handleAIAnalysis = async (q, model, useAllContacts = false) => {
        setIsAnalyzing(true); setAnalysisResult(null); setAnalysisError('');
        try {
            const res = await api.post('/dashboard/analyze', { 
                question: q, 
                model: model,
                start_date: dateRange.startDate.toISOString(), 
                end_date: dateRange.endDate.toISOString(), 
                prospect_ids: selectedCampaigns,
                use_all_contacts: useAllContacts
            });
            setAnalysisResult(res.data.analysis);
        } catch (err) { setAnalysisError('Ocorreu um erro no processamento cognitivo.'); }
        finally { setIsAnalyzing(false); }
    };

    if (isLoading && !data) return <PageLoader message="Acessando torre de controle..." subMessage="Cruzando métricas de performance e IA..." />;

    const stats = [
        { icon: Users, title: 'Audiência', value: data.stats.totalContacts, color: '#356854', description: 'Total de Contatos' },
        { icon: Target, title: 'Operação', value: data.stats.activeProspects, color: '#10b981', description: 'Campanhas em Execução' },
        { icon: CheckCircle, title: 'Qualificação', value: data.stats.qualifiedLeads, color: '#f59e0b', description: 'Leads de Alta Conversão' },
        { icon: Percent, title: 'Engajamento', value: data.stats.responseRate, color: '#ef4444', description: 'Taxa de Resposta Média' },
        { icon: Zap, title: 'Otimização', value: data.stats.avgTokensPerContact, color: '#8b5cf6', description: 'Tokens por Atendimento' },
    ];

    return (
        <div className="dashboard-page p-6 md:p-12 min-h-screen">
            <style>{DS_STYLE}</style>
            <div className="max-w-[1600px] mx-auto flex flex-col gap-12">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                    <div>
                        <h1 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-4">Performance Insights <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div></h1>
                        <p className="text-slate-400 mt-2 text-sm font-bold uppercase tracking-widest">Painel de Monitoramento Estratégico ProspectAI</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <DateRangeFilter onDateChange={(s, e) => setDateRange({ startDate: s, endDate: e })} />
                        <button onClick={() => fetchData(dateRange.startDate, dateRange.endDate, selectedCampaigns)} className="w-16 h-16 bg-white text-[#356854] rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center hover:scale-110 transition-all"><Activity size={28} /></button>
                    </div>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
                    {stats.map((s, i) => <StatCard key={i} {...s} />)}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
                    <div className="xl:col-span-2 ds-surface p-12 flex flex-col min-h-[600px] border-none shadow-2xl shadow-slate-200/50">
                        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-16">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Tendência de Atividade</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">Métricas de interação em série temporal</p>
                            </div>
                            <div className="flex items-center gap-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-[#10b981]" /><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Contatos</span></div>
                                <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-slate-300" /><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Respostas</span></div>
                            </div>
                        </header>
                        <div className="flex-1 w-full h-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.activityChart} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                                    <defs>
                                        <linearGradient id="colorContacts" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        dataKey="date" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 900}} 
                                        dy={20}
                                        interval="preserveStartEnd"
                                        minTickGap={30}
                                    />
                                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 900}} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="contatos" name="Contatos" stroke="#10b981" strokeWidth={5} fillOpacity={1} fill="url(#colorContacts)" animationDuration={2000} />
                                    <Area type="monotone" dataKey="respostas" name="Respostas" stroke="#cbd5e1" strokeWidth={3} fill="transparent" strokeDasharray="8 8" animationDuration={2500} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="ds-surface p-12 flex flex-col border-none shadow-2xl shadow-slate-200/50">
                        <header className="flex items-center justify-between mb-12">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Campanhas</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Segmentação Ativa</p>
                            </div>
                            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#356854] border border-emerald-100/50"><Filter size={24} /></div>
                        </header>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-3 max-h-[500px]">
                            {data.recentCampaigns.map((c) => (
                                <div key={c.id} onClick={() => setSelectedCampaigns(p => p.includes(c.id) ? p.filter(id => id !== c.id) : [...p, c.id])} className={`p-6 rounded-[1.5rem] border cursor-pointer transition-all ${selectedCampaigns.includes(c.id) ? 'bg-[#356854] text-white border-[#356854] shadow-xl shadow-emerald-900/10' : 'bg-white border-slate-100 hover:border-emerald-200 hover:bg-slate-50'}`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <p className="font-black text-sm tracking-tight truncate max-w-[150px]">{c.name}</p>
                                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${selectedCampaigns.includes(c.id) ? 'bg-white/10 border-white/20 text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{c.status}</span>
                                    </div>
                                    <div className="items-center justify-between flex">
                                        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest opacity-60"><Clock size={12} /> {c.timeAgo === 0 ? 'Hoje' : `Há ${c.timeAgo} dias`}</div>
                                        {selectedCampaigns.includes(c.id) && <CheckCircle size={14} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setSelectedCampaigns([])} className="mt-10 h-16 w-full bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl hover:bg-slate-100 hover:text-[#356854] transition-all">Limpar Filtros ({selectedCampaigns.length})</button>
                    </div>
                </div>

                <AIAnalyzer 
                    onAnalyze={handleAIAnalysis} 
                    isLoading={isAnalyzing} 
                    analysis={analysisResult} 
                    error={analysisError} 
                />
            </div>
        </div>
    );
};

export default Dashboard;
