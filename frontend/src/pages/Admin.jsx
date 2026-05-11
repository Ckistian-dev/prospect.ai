import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import toast from 'react-hot-toast';
import { Edit, Trash2, Loader2, UserPlus, Save, CheckCircle, Settings, Phone, Clock, Plus, X, Shield, Search, User, Mail, Lock, Zap, Activity, Database, Layout, Smartphone } from 'lucide-react';
import PageLoader from '../components/common/PageLoader';

// ─── DESIGN SYSTEM ──────────────────────────────────────────────────────────
const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
.admin-page { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
.admin-page h1, .admin-page h2, .admin-page h3, .admin-page h4 { font-family: 'Plus Jakarta Sans', sans-serif; }
.ds-surface { background: #ffffff; border-radius: 2.5rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 30px rgba(0,0,0,0.02); }
.admin-modal-overlay { background: rgba(15,23,42,0.6); backdrop-filter: blur(12px); animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.admin-form-input {
    width: 100%;
    height: 4rem;
    padding: 0 1.5rem;
    font-size: 0.875rem;
    font-weight: 700;
    border-radius: 1.25rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    color: #1e293b;
    outline: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.admin-form-input:focus { border-color: #356854; background: #ffffff; box-shadow: 0 0 0 5px rgba(53,104,84,0.08); }
.ds-card { background: #ffffff; border-radius: 1.75rem; border: 1px solid rgba(0,0,0,0.05); padding: 1.5rem; transition: all 0.3s ease; }
.status-pill { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
.active-tab-line { position: absolute; bottom: 0; left: 0; right: 0; h-1; background: #356854; border-radius: 10px; box-shadow: 0 -4px 12px rgba(53, 104, 84, 0.3); }
`;

const Modal = ({ onClose, children, maxWidth = "max-w-3xl" }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 admin-modal-overlay" onClick={onClose}>
        <div className={`bg-white w-full ${maxWidth} relative overflow-hidden animate-in fade-in zoom-in duration-300`} style={{ borderRadius: '3rem', boxShadow: '0 50px 100px rgba(15,23,42,0.3)' }} onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-10 right-10 w-12 h-12 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-slate-600 rounded-2xl transition-all z-10"><X size={24} /></button>
            {children}
        </div>
    </div>
);

const TabButton = ({ isActive, label, icon: Icon, onClick }) => (
    <button type="button" onClick={onClick} className={`flex items-center gap-3 px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${isActive ? 'text-[#356854]' : 'text-slate-400 hover:text-slate-600'}`}>
        <Icon size={18} /> {label}
        {isActive && <div className="active-tab-line h-1" />}
    </button>
);

const UserModal = ({ user, onSave, onClose, isCreating = false }) => {
    const [activeTab, setActiveTab] = useState('general');
    const [formData, setFormData] = useState({
        email: user?.email || '', password: '', tokens: user?.tokens ?? 0, agent_running: user?.agent_running ?? false,
        atendente_online: user?.atendente_online ?? false, followup_active: user?.followup_active ?? false,
        default_persona_id: user?.default_persona_id || '', wbp_phone_number_id: user?.wbp_phone_number_id || '',
        wbp_business_account_id: user?.wbp_business_account_id || '',
    });
    const [followupConfig, setFollowupConfig] = useState(() => {
        const config = user?.followup_config ? (typeof user.followup_config === 'string' ? JSON.parse(user.followup_config) : JSON.parse(JSON.stringify(user.followup_config))) : {
            business_hours: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
            intervals: []
        };
        if (config.intervals) {
            config.intervals = config.intervals.map(interval => interval.hours < 1 ? { value: Math.round(interval.hours * 60), unit: 'minutes' } : { value: interval.hours, unit: 'hours' });
        }
        return config;
    });
    const [userPersonas, setUserPersonas] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const weekDays = [{ id: 1, label: 'S' }, { id: 2, label: 'T' }, { id: 3, label: 'Q' }, { id: 4, label: 'Q' }, { id: 5, label: 'S' }, { id: 6, label: 'S' }, { id: 0, label: 'D' }];

    useEffect(() => {
        (async () => {
            if (user?.id && !isCreating) {
                try { const res = await api.get(`/admin/users/${user.id}/configs`); setUserPersonas(res.data); } catch (e) {}
            }
        })();
    }, [user, isCreating]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = { ...formData, tokens: parseInt(formData.tokens, 10) || 0 };
            payload.default_persona_id = formData.default_persona_id ? parseInt(formData.default_persona_id, 10) : null;
            const configToSave = { ...followupConfig, intervals: (followupConfig.intervals || []).map(interval => ({ hours: interval.unit === 'minutes' ? interval.value / 60 : interval.value })) };
            payload.followup_config = configToSave;
            if (!isCreating && !payload.password) delete payload.password;
            await onSave(user?.id, payload);
            onClose();
        } finally { setIsSaving(false); }
    };

    return (
        <Modal onClose={onClose}>
            <div className="flex flex-col h-full bg-[#f8fafc]">
                <header className="p-12 bg-white border-b border-slate-50">
                    <h3 className="text-3xl font-black text-slate-800 tracking-tight leading-none mb-3">{isCreating ? 'Provisionar Usuário' : 'Gestão de Usuário'}</h3>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{isCreating ? 'Configuração de nova instância enterprise' : user.email}</p>
                </header>
                <div className="flex border-b border-slate-50 bg-white sticky top-0 z-10 px-6 overflow-x-auto custom-scrollbar">
                    <TabButton isActive={activeTab === 'general'} onClick={() => setActiveTab('general')} label="Identidade" icon={User} />
                    <TabButton isActive={activeTab === 'status'} onClick={() => setActiveTab('status')} label="Automação" icon={Zap} />
                    <TabButton isActive={activeTab === 'wbp'} onClick={() => setActiveTab('wbp')} label="API Meta" icon={Phone} />
                    <TabButton isActive={activeTab === 'followup'} onClick={() => setActiveTab('followup')} label="Régua FU" icon={Clock} />
                </div>
                <div className="flex-1 overflow-y-auto p-12 custom-scrollbar max-h-[55vh]">
                    {activeTab === 'general' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">E-mail Corporativo</label>
                                <input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} className="admin-form-input shadow-sm" placeholder="exemplo@prospectai.com" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{isCreating ? 'Senha de Acesso' : 'Redefinir Senha'}</label>
                                <input type="password" value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} className="admin-form-input shadow-sm" placeholder={isCreating ? "Padrão de segurança Forte" : "Mantenha vazio para não alterar"} />
                            </div>
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Créditos de Tokens</label>
                                    <div className="relative">
                                        <Database className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input type="number" value={formData.tokens} onChange={e => setFormData(p => ({ ...p, tokens: e.target.value }))} className="admin-form-input pl-16 shadow-sm" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Persona Padrão</label>
                                    <div className="relative">
                                        <Layout className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <select value={formData.default_persona_id} onChange={e => setFormData(p => ({ ...p, default_persona_id: e.target.value }))} className="admin-form-input pl-16 bg-white shadow-sm appearance-none" disabled={isCreating}>
                                            <option value="">Nenhuma Selecionada</option>
                                            {userPersonas.map(p => <option key={p.id} value={p.id}>{p.nome_config}</option>)}
                                        </select>
                                        <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'status' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            {[
                                { id: 'agent_running', label: 'Motor de IA Ativo', desc: 'Habilita o processamento de mensagens via LLM em tempo real.', icon: Zap },
                                { id: 'atendente_online', label: 'Modo Híbrido', desc: 'Sinaliza a presença de operadores para intervenção manual.', icon: User },
                                { id: 'followup_active', label: 'Fluxo de Reengajamento', desc: 'Ativa a régua de mensagens automáticas de follow-up.', icon: Activity },
                            ].map(item => (
                                <div key={item.id} className="ds-card flex items-center justify-between group hover:bg-[#356854]/5 transition-all">
                                    <div className="flex items-center gap-6">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${formData[item.id] ? 'bg-[#356854] text-white shadow-lg shadow-emerald-900/20' : 'bg-slate-100 text-slate-400'}`}><item.icon size={24} /></div>
                                        <div>
                                            <h4 className="text-base font-black text-slate-800 leading-none mb-1.5">{item.label}</h4>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{item.desc}</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => setFormData(p => ({ ...p, [item.id]: !p[item.id] }))} className={`w-16 h-8 rounded-full relative transition-all border-2 ${formData[item.id] ? 'bg-[#356854] border-[#356854]' : 'bg-slate-100 border-slate-200'}`}>
                                        <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${formData[item.id] ? 'translate-x-8' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {activeTab === 'wbp' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="p-8 rounded-[2rem] bg-emerald-50 text-[#356854] border border-emerald-100 flex items-start gap-5">
                                <Shield size={24} className="shrink-0" />
                                <div>
                                    <p className="text-xs font-black uppercase tracking-widest mb-1">Certificação Meta Business</p>
                                    <p className="text-xs font-medium leading-relaxed opacity-80">Estas credenciais são vinculadas diretamente à API oficial da Meta. Garanta que os IDs correspondam exatamente ao seu painel de desenvolvedor.</p>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Phone Number ID</label>
                                <div className="relative">
                                    <Smartphone className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input type="text" value={formData.wbp_phone_number_id} onChange={e => setFormData(p => ({ ...p, wbp_phone_number_id: e.target.value }))} className="admin-form-input pl-16 shadow-sm" placeholder="ID numérico da Meta" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Business Account ID</label>
                                <div className="relative">
                                    <Shield className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input type="text" value={formData.wbp_business_account_id} onChange={e => setFormData(p => ({ ...p, wbp_business_account_id: e.target.value }))} className="admin-form-input pl-16 shadow-sm" placeholder="ID da conta empresarial" />
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'followup' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="ds-card">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-8 h-8 rounded-xl bg-[#356854] text-white flex items-center justify-center"><Clock size={16} /></div>
                                    <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Horário de Operação</h4>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-8">
                                    {weekDays.map(d => (
                                        <button key={d.id} type="button" onClick={() => setFollowupConfig(p => ({ ...p, business_hours: { ...p.business_hours, days: p.business_hours.days.includes(d.id) ? p.business_hours.days.filter(x => x !== d.id) : [...p.business_hours.days, d.id].sort() } }))} className={`w-12 h-12 flex items-center justify-center rounded-2xl font-black text-xs transition-all border ${followupConfig.business_hours.days.includes(d.id) ? 'bg-[#356854] text-white border-[#356854] shadow-lg shadow-emerald-900/10' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{d.label}</button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <input type="time" value={followupConfig.business_hours.start} onChange={e => setFollowupConfig(p => ({ ...p, business_hours: { ...p.business_hours, start: e.target.value } }))} className="admin-form-input text-center" />
                                    <input type="time" value={followupConfig.business_hours.end} onChange={e => setFollowupConfig(p => ({ ...p, business_hours: { ...p.business_hours, end: e.target.value } }))} className="admin-form-input text-center" />
                                </div>
                            </div>
                            <div className="ds-card">
                                <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-[#356854] text-white flex items-center justify-center"><Plus size={16} /></div>
                                        <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Régua Conversacional</h4>
                                    </div>
                                    <button onClick={() => setFollowupConfig(p => ({ ...p, intervals: [...p.intervals, { value: 24, unit: 'hours' }] }))} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline">+ Adicionar Etapa</button>
                                </div>
                                <div className="space-y-4">
                                    {followupConfig.intervals.map((int, i) => (
                                        <div key={i} className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 group transition-all hover:bg-white hover:border-emerald-100">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Gap {i+1}</span>
                                            <input type="number" value={int.value} onChange={e => { const ni = [...followupConfig.intervals]; ni[i].value = parseInt(e.target.value); setFollowupConfig(p => ({ ...p, intervals: ni })); }} className="w-24 h-12 bg-white border border-slate-100 rounded-xl px-4 text-sm font-black text-slate-700 outline-none focus:border-emerald-500" />
                                            <select value={int.unit} onChange={e => { const ni = [...followupConfig.intervals]; ni[i].unit = e.target.value; setFollowupConfig(p => ({ ...p, intervals: ni })); }} className="flex-1 h-12 bg-white border border-slate-100 rounded-xl px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest outline-none focus:border-emerald-500">
                                                <option value="minutes">Minutos</option>
                                                <option value="hours">Horas</option>
                                            </select>
                                            <button onClick={() => setFollowupConfig(p => ({ ...p, intervals: p.intervals.filter((_, idx) => idx !== i) }))} className="w-12 h-12 flex items-center justify-center text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                                        </div>
                                    ))}
                                    {followupConfig.intervals.length === 0 && <div className="py-12 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Nenhum intervalo configurado</div>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <footer className="p-12 bg-white border-t border-slate-50 flex justify-end gap-6 shadow-2xl">
                    <button onClick={onClose} className="px-10 py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-all">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving} className="h-16 px-12 bg-[#356854] text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-emerald-900/20 hover:bg-[#2d5847] transition-all flex items-center gap-4 disabled:opacity-50">
                        {isSaving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />} {isSaving ? 'Gravando...' : 'Salvar Configurações'}
                    </button>
                </footer>
            </div>
        </Modal>
    );
};

function Admin() {
    const [users, setUsers] = useState([]);
    const [allPersonas, setAllPersonas] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [modalState, setModalState] = useState({ type: null, data: null });
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [u, p] = await Promise.all([api.get('/admin/users'), api.get('/admin/configs')]);
            setUsers(u.data); setAllPersonas(p.data);
        } catch (e) { toast.error('Falha na autenticação administrativa.'); }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredUsers = users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()));

    if (isLoading) return <PageLoader message="Acessando infraestrutura enterprise..." subMessage="Carregando chaves de acesso administrativo..." />;

    return (
        <div className="admin-page p-6 md:p-12 min-h-screen bg-[#f8fafc]">
            <style>{DS_STYLE}</style>
            <div className="max-w-[1600px] mx-auto flex flex-col gap-10">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
                    <div>
                        <h1 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-5">Painel de Infraestrutura <Shield size={32} className="text-[#356854]" /></h1>
                        <p className="text-slate-400 mt-2 text-sm font-bold uppercase tracking-widest">Gestão Global de Usuários e Instâncias Enterprise</p>
                    </div>
                    <div className="flex items-center gap-6 w-full md:w-auto">
                        <div className="relative flex-1 md:flex-none">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                            <input type="text" placeholder="Filtrar instâncias..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-16 w-full md:w-[400px] pl-16 pr-6 bg-white border border-slate-100 rounded-[1.5rem] text-sm font-black text-slate-700 shadow-sm outline-none focus:ring-4 focus:ring-emerald-500/5 transition-all" />
                        </div>
                        <button onClick={() => setModalState({ type: 'create', data: null })} className="h-16 px-10 bg-[#356854] text-white font-black text-xs uppercase tracking-[0.2em] rounded-[1.5rem] shadow-2xl shadow-emerald-900/10 hover:bg-[#2d5847] hover:-translate-y-1 transition-all flex items-center gap-4">
                            <UserPlus size={24} /> Novo Usuário
                        </button>
                    </div>
                </header>

                <div className="ds-surface overflow-hidden border-none shadow-2xl shadow-slate-200/50">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-[1200px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    {['Identidade Corporativa', 'Créditos', 'Ambiente', 'Sistemas de IA', 'Ações'].map((h, i) => (
                                        <th key={i} className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredUsers.map((u) => (
                                    <tr key={u.id} className="transition-all hover:bg-emerald-50/20 group">
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-6">
                                                <div className="w-14 h-14 rounded-[1.25rem] bg-gradient-to-br from-[#356854] to-[#4a8a6e] flex items-center justify-center text-white font-black text-lg shadow-lg group-hover:scale-110 transition-all">{u.email[0].toUpperCase()}</div>
                                                <div>
                                                    <div className="text-base font-black text-slate-800 flex items-center gap-3">{u.email} {u.is_superuser && <div className="px-3 py-1 bg-[#356854] text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-emerald-900/10">Root</div>}</div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-2"><Smartphone size={10} /> Instância: #{u.id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="text-sm font-black text-slate-700 flex items-center gap-2"><Database size={16} className="text-emerald-500" /> {u.tokens.toLocaleString('pt-BR')} <span className="text-[10px] text-slate-400 font-black uppercase">Tokens</span></div>
                                                <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: '65%' }} /></div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex flex-col gap-2">
                                                <div className="h-8 px-4 bg-slate-50 border border-slate-100 rounded-xl inline-flex items-center gap-3 text-[10px] font-black text-slate-500 uppercase tracking-widest"><Layout size={14} /> {allPersonas.find(p => p.id === u.default_persona_id)?.nome_config || 'Nenhum Ativo'}</div>
                                                {u.wbp_phone_number_id && <div className="text-[9px] font-bold text-slate-400 flex items-center gap-2 ml-2"><CheckCircle size={10} className="text-emerald-500" /> API WhatsApp Integrada</div>}
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex flex-wrap gap-3">
                                                <StatusPill active={u.agent_running} label="Agente" />
                                                <StatusPill active={u.atendente_online} label="Híbrido" />
                                                <StatusPill active={u.followup_active} label="Régua FU" />
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all">
                                                <button onClick={() => setModalState({ type: 'edit', data: u })} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-[#356854] hover:border-emerald-100 rounded-2xl transition-all shadow-sm"><Edit size={20} /></button>
                                                <button onClick={async () => { if(window.confirm('Excluir instância?')) { await api.delete(`/admin/users/${u.id}`); fetchData(); toast.success('Removido.'); } }} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-rose-500 hover:border-rose-100 rounded-2xl transition-all shadow-sm"><Trash2 size={20} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            {modalState.type && <UserModal user={modalState.data} onSave={async (uid, data) => { const isCreating = !uid; isCreating ? await api.post('/admin/users', data) : await api.put(`/admin/users/${uid}`, data); fetchData(); toast.success('Operação realizada!'); }} onClose={() => setModalState({ type: null, data: null })} isCreating={modalState.type === 'create'} />}
        </div>
    );
}

const StatusPill = ({ active, label }) => (
    <div className={`h-8 px-4 rounded-xl inline-flex items-center gap-2.5 border transition-all ${active ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
        <div className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-200'}`} />
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </div>
);

export default Admin;