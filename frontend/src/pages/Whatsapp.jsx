import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { WifiOff, Loader2, ServerCrash, AlertCircle, ScanLine, RefreshCw, Link, Cloud, CloudCog, CheckCircle, User, Power, Plus, Trash2, Smartphone, MessageSquare, Settings, Clock, Save, X, Edit, ChevronDown, Layout, Shield, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── DESIGN SYSTEM ──────────────────────────────────────────────────────────
const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
.whatsapp-page { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
.whatsapp-page h1, .whatsapp-page h2, .whatsapp-page h3, .whatsapp-page h4 { font-family: 'Plus Jakarta Sans', sans-serif; }
.ds-surface { background: #ffffff; border-radius: 2.5rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 30px rgba(0,0,0,0.02); }
.ds-card { background: #ffffff; border-radius: 2rem; border: 1px solid rgba(0,0,0,0.05); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.ds-card:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(15,23,42,0.08); }
.status-pill { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.admin-form-input {
    width: 100%;
    height: 3.5rem;
    padding: 0 1.25rem;
    font-size: 0.875rem;
    font-weight: 600;
    border-radius: 1.25rem;
    background: #f8fafc;
    border: 1px solid #edf2f7;
    color: #1e293b;
    outline: none;
    transition: all 0.25s ease;
}
.admin-form-input:focus { border-color: #356854; box-shadow: 0 0 0 4px rgba(53,104,84,0.1); background: white; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
`;

const Modal = ({ onClose, children, maxWidth = "max-w-xl" }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
        <div className={`bg-white w-full ${maxWidth} relative overflow-hidden animate-in zoom-in duration-300 max-h-[90vh] flex flex-col`} style={{ borderRadius: '2.5rem', boxShadow: '0 40px 100px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-8 right-8 w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-slate-600 rounded-xl transition-all z-10">✕</button>
            <div className="overflow-y-auto custom-scrollbar flex-1">
                {children}
            </div>
        </div>
    </div>
);

const ConfirmationModal = ({ title, message, onConfirm, onClose }) => (
    <Modal onClose={onClose} maxWidth="max-w-md">
        <div className="p-10 text-center">
            <div className="mx-auto w-20 h-20 bg-rose-50 text-rose-500 rounded-[2rem] flex items-center justify-center mb-6 shadow-sm">
                <AlertCircle size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">{title}</h3>
            <p className="text-slate-400 text-sm font-medium mb-10 px-4 leading-relaxed">{message}</p>
            <div className="flex gap-4">
                <button onClick={onClose} className="flex-1 h-14 bg-slate-50 text-slate-400 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all">Cancelar</button>
                <button onClick={onConfirm} className="flex-1 h-14 bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-rose-900/10 hover:bg-rose-600 transition-all">Confirmar</button>
            </div>
        </div>
    </Modal>
);

const StatusDisplay = ({ statusInfo, onConnect, onDisconnect, onRefresh, isChecking, error, onShowQRCode }) => {
    const renderContent = () => {
        switch (statusInfo?.status) {
            case 'connected':
            case 'open':
                return (
                    <div className="flex gap-3 w-full">
                        <button
                            onClick={onRefresh}
                            disabled={isChecking}
                            className="w-12 h-12 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl border border-blue-100 hover:bg-blue-100 transition-all group"
                            title="Sincronizar"
                        >
                            {isChecking ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />}
                        </button>
                        <button onClick={onDisconnect} disabled={isChecking} className="flex-1 h-12 flex items-center justify-center gap-2 bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-widest rounded-xl border border-rose-100 hover:bg-rose-100 transition-all">
                            {isChecking ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                            Desconectar
                        </button>
                    </div>
                );

            case 'loading':
            case 'loading_qr':
                return (
                    <div className="w-full h-12 flex items-center justify-center gap-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 animate-pulse">
                        <Loader2 size={18} className="animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {statusInfo.status === 'loading_qr' ? 'Gerando QR...' : 'Verificando...'}
                        </span>
                    </div>
                );

            case 'connecting':
            case 'close':
            case 'qrcode':
                return (
                    <button
                        onClick={onShowQRCode}
                        className="w-full h-12 flex items-center justify-center gap-3 bg-[#356854] text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-xl shadow-emerald-900/20 hover:bg-[#2d5847] transition-all"
                    >
                        <ScanLine size={18} /> Escanear QR Code
                    </button>
                );

            case 'error':
            case 'api_error':
                return (
                    <div className="w-full flex flex-col gap-3">
                        <div className="h-12 flex items-center justify-center gap-2 bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-widest rounded-xl border border-rose-100">
                            <ServerCrash size={16} /> {error || 'Erro na conexão'}
                        </div>
                        <button onClick={onConnect} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 underline underline-offset-4 text-center">Tentar novamente</button>
                    </div>
                );

            default:
                return (
                    <button onClick={onConnect} className="w-full h-12 bg-white text-[#356854] font-black text-[10px] uppercase tracking-widest rounded-xl border border-slate-200 hover:bg-emerald-50 hover:border-emerald-100 transition-all shadow-sm">
                        Iniciar Conexão
                    </button>
                );
        }
    };

    return <div className="w-full">{renderContent()}</div>;
};

const InstanceModal = ({ instance, onClose, onSave, onDelete }) => {
    const isCreating = !instance;

    const [intervalUI, setIntervalUI] = useState(() => {
        const seconds = instance?.interval_seconds || 900;
        return (seconds >= 60 && seconds % 60 === 0) ? { value: seconds / 60, unit: 'minutes' } : { value: seconds, unit: 'seconds' };
    });

    const [formData, setFormData] = useState({
        name: instance?.name || '',
        instance_name: instance?.instance_name || '',
        interval_seconds: instance?.interval_seconds || 900,
        is_active: instance?.is_active ?? true,
        proxy_host: instance?.proxy_host || '',
        proxy_port: instance?.proxy_port || '',
        proxy_protocol: instance?.proxy_protocol || 'socks5',
        proxy_username: instance?.proxy_username || '',
        proxy_password: instance?.proxy_password || ''
    });

    const [proxyAuthMethod, setProxyAuthMethod] = useState(instance?.proxy_username ? 'password' : 'ip');
    const [statusInfo, setStatusInfo] = useState({ status: 'loading' });
    const [qrCode, setQrCode] = useState('');
    const [error, setError] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [googleStatus, setGoogleStatus] = useState('loading');
    const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);

    const checkStatus = useCallback(async (isAuto = false) => {
        if (isCreating || (isChecking && !isAuto)) return;
        if (!isAuto) setIsChecking(true);
        setError('');
        try {
            const response = await api.get(`/whatsapp/${instance.id}/status`);
            setStatusInfo(response.data);
            if (response.data.status === 'qrcode' && response.data.qrcode) {
                setQrCode(response.data.qrcode);
            } else if (response.data.status !== 'qrcode') {
                setQrCode('');
                if ((response.data.status === 'connected' || response.data.status === 'open') && isQRCodeModalOpen) {
                    setIsQRCodeModalOpen(false);
                    toast.success('Dispositivo conectado!');
                }
            }
        } catch (err) {
            if (!isAuto) {
                setError('Erro ao verificar.');
                setStatusInfo({ status: 'api_error' });
            }
        } finally {
            if (!isAuto) setIsChecking(false);
        }
    }, [instance?.id, isCreating, isChecking, isQRCodeModalOpen]);

    const checkGoogleStatus = useCallback(async () => {
        if (isCreating) return;
        try {
            const response = await api.get(`/google-contacts/${instance.id}/status`);
            setGoogleStatus(response.data.status);
        } catch (err) {
            setGoogleStatus('error');
        }
    }, [instance?.id, isCreating]);

    useEffect(() => {
        if (!isCreating) {
            checkStatus();
            checkGoogleStatus();
        } else {
            setStatusInfo({ status: 'disconnected' });
            setGoogleStatus('disconnected');
        }
    }, [isCreating]); // Removido checkStatus e checkGoogleStatus para evitar loop infinito



    const handleConnect = async () => {
        if (isChecking) return;
        setIsChecking(true);
        setStatusInfo({ status: 'loading_qr' });
        try {
            const response = await api.get(`/whatsapp/${instance.id}/connect`);
            const data = response.data;
            if (data.status === 'qrcode' && data.instance?.qrcode) {
                setQrCode(data.instance.qrcode);
                setStatusInfo({ status: 'qrcode' });
                setIsQRCodeModalOpen(true);
            } else {
                setStatusInfo(data.instance ? { status: data.instance.state || 'connecting' } : { status: 'disconnected' });
                if (!data.instance?.qrcode) setIsQRCodeModalOpen(true); // Show loading state in QR modal
            }
        } catch (err) {
            setError('Erro ao conectar.');
            setStatusInfo({ status: 'error' });
        } finally {
            setIsChecking(false);
        }
    };

    const handleManualSync = async () => {
        setIsLoadingGoogle(true);
        try {
            const response = await api.post(`/google-contacts/${instance.id}/sync`);
            toast.success(`Mapeados: ${response.data.details.success} contatos.`);
        } catch (err) {
            toast.error('Erro na sincronização.');
        } finally {
            setIsLoadingGoogle(false);
        }
    };

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = async () => {
        setIsSaving(true);
        try {
            let payload = { ...formData };
            if (proxyAuthMethod === 'ip') {
                payload.proxy_username = '';
                payload.proxy_password = '';
            }
            if (isCreating) {
                const pre = (localStorage.getItem('userEmail') || 'user').split('@')[0];
                const slug = formData.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                payload.instance_name = `${slug}_${pre}`;
            }
            await onSave(payload);
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal onClose={onClose} maxWidth="max-w-2xl">
            <div className="flex flex-col h-full">
                <header className="p-10 bg-white border-b border-slate-50 relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none text-slate-900">
                        <Settings size={160} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="w-14 h-14 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center text-[#356854] shadow-sm">
                                {isCreating ? <Plus size={24} /> : <Settings size={24} />}
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">
                                    {isCreating ? 'Nova Conexão' : 'Configurar Instância'}
                                </h2>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-2">
                                    {isCreating ? 'Mapeamento de Novo Terminal' : instance.name}
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="p-10 space-y-10">
                    {!isCreating && (
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* WhatsApp Card */}
                            <div className="p-8 bg-slate-50/50 rounded-[2rem] border border-slate-100 flex flex-col gap-6">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${statusInfo.status === 'connected' || statusInfo.status === 'open' ? 'bg-[#356854] text-white' : 'bg-white text-slate-300'}`}>
                                        <Smartphone size={20} />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Terminal WhatsApp</h4>
                                        <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                            {(statusInfo.status === 'connected' || statusInfo.status === 'open') ? <><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Online</> : <><span className="w-1.5 h-1.5 bg-slate-300 rounded-full" /> Offline</>}
                                        </div>
                                    </div>
                                </div>
                                <StatusDisplay
                                    statusInfo={statusInfo}
                                    onConnect={handleConnect}
                                    onDisconnect={() => setConfirmAction({
                                        title: 'Desconectar Terminal',
                                        message: 'Tem certeza que deseja cessar a comunicação deste dispositivo?',
                                        action: async () => {
                                            try { await api.post(`/whatsapp/${instance.id}/disconnect`); setQrCode(''); setStatusInfo({ status: 'disconnected' }); toast.success('Desconectado.'); }
                                            finally { setConfirmAction(null); }
                                        }
                                    })}
                                    onRefresh={() => checkStatus(false)}
                                    isChecking={isChecking}
                                    onShowQRCode={() => setIsQRCodeModalOpen(true)}
                                />
                            </div>

                            {/* Google Card */}
                            <div className="p-8 bg-slate-50/50 rounded-[2rem] border border-slate-100 flex flex-col gap-6">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${googleStatus === 'connected' ? 'bg-sky-500 text-white' : 'bg-white text-slate-300'}`}>
                                        <Cloud size={20} />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Google Integration</h4>
                                        <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                            {googleStatus === 'connected' ? <><span className="w-1.5 h-1.5 bg-sky-500 rounded-full" /> Sincronizado</> : <><span className="w-1.5 h-1.5 bg-slate-300 rounded-full" /> Desconectado</>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    {googleStatus === 'connected' ? (
                                        <>
                                            <button onClick={handleManualSync} disabled={isLoadingGoogle} className="w-12 h-12 flex items-center justify-center bg-sky-50 text-sky-600 rounded-xl border border-sky-100 hover:bg-sky-100 transition-all">
                                                {isLoadingGoogle ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                            </button>
                                            <button onClick={() => setConfirmAction({
                                                title: 'Remover Google',
                                                message: 'Deseja desvincular a conta Google desta instância?',
                                                action: async () => {
                                                    try { await api.post(`/google-contacts/${instance.id}/disconnect`); setGoogleStatus('disconnected'); toast.success('Desvinculado.'); }
                                                    finally { setConfirmAction(null); }
                                                }
                                            })} disabled={isLoadingGoogle} className="flex-1 h-12 bg-white text-slate-400 font-black text-[10px] uppercase tracking-widest rounded-xl border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all">
                                                Desvincular
                                            </button>
                                        </>
                                    ) : (
                                        <button onClick={async () => {
                                            setIsLoadingGoogle(true);
                                            try {
                                                const redirect = `${window.location.origin}/whatsapp`;
                                                const { data } = await api.get(`/google-contacts/auth/url?redirect_uri=${encodeURIComponent(redirect)}&instance_id=${instance.id}`);
                                                localStorage.setItem('google_auth_instance_id', instance.id);
                                                window.location.href = data.authorization_url;
                                            } catch (err) { toast.error('Falha na integração Google.'); setIsLoadingGoogle(false); }
                                        }} disabled={isLoadingGoogle || googleStatus === 'loading'} className="w-full h-12 bg-white text-sky-600 font-black text-[10px] uppercase tracking-widest rounded-xl border border-sky-100 hover:bg-sky-50 transition-all">
                                            {isLoadingGoogle || googleStatus === 'loading' ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Autorizar Acesso'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-8">
                        <div className="flex items-center justify-between p-6 bg-slate-50/50 rounded-3xl border border-slate-100">
                            <div>
                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Status da Instância</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Habilitar ou desabilitar o processamento automático</p>
                            </div>
                            <button
                                onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                                className={`w-14 h-8 rounded-full transition-all relative ${formData.is_active ? 'bg-[#356854]' : 'bg-slate-200'}`}
                            >
                                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${formData.is_active ? 'left-7' : 'left-1'} shadow-sm`} />
                            </button>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">Identificação Interna</label>
                            <input type="text" name="name" value={formData.name} onChange={handleFormChange} className="admin-form-input" placeholder="Ex: Vendas Matriz" />
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">Intervalo de Mensagens</label>
                                <div className="flex gap-2">
                                    <input type="number" value={intervalUI.value} onChange={(e) => {
                                        const v = e.target.value; setIntervalUI(p => ({ ...p, value: v }));
                                        setFormData(pr => ({ ...pr, interval_seconds: intervalUI.unit === 'minutes' ? v * 60 : v }));
                                    }} className="admin-form-input flex-1 text-center" />
                                    <div className="relative w-32">
                                        <select value={intervalUI.unit} onChange={(e) => {
                                            const u = e.target.value; setIntervalUI(p => ({ ...p, unit: u }));
                                            setFormData(pr => ({ ...pr, interval_seconds: u === 'minutes' ? intervalUI.value * 60 : intervalUI.value }));
                                        }} className="admin-form-input appearance-none bg-slate-50 pr-10">
                                            <option value="seconds">SEG</option>
                                            <option value="minutes">MIN</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">Modo de Autenticação Proxy</label>
                                <div className="relative">
                                    <select value={proxyAuthMethod} onChange={(e) => { setProxyAuthMethod(e.target.value); if (e.target.value === 'ip') setFormData(prev => ({ ...prev, proxy_username: '', proxy_password: '' })); }} className="admin-form-input appearance-none bg-slate-50 pr-10">
                                        <option value="ip">Liberação por IP (Whitelisting)</option>
                                        <option value="password">Usuário e Senha</option>
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50/50 rounded-[2rem] border border-slate-100 space-y-8">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-4 bg-[#356854] rounded-full" />
                                <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.15em]">Servidor de Borda (Proxy)</h4>
                            </div>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Host / IP</label>
                                    <input type="text" name="proxy_host" value={formData.proxy_host} onChange={handleFormChange} className="admin-form-input bg-white" placeholder="proxy.network.com" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Porta</label>
                                    <input type="text" name="proxy_port" value={formData.proxy_port} onChange={handleFormChange} className="admin-form-input bg-white" placeholder="1080" />
                                </div>
                            </div>
                            {proxyAuthMethod === 'password' && (
                                <div className="grid md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Usuário</label>
                                        <input type="text" name="proxy_username" value={formData.proxy_username} onChange={handleFormChange} className="admin-form-input bg-white" placeholder="admin_user" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Senha</label>
                                        <input type="password" name="proxy_password" value={formData.proxy_password} onChange={handleFormChange} className="admin-form-input bg-white" placeholder="••••••••" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <footer className="p-10 bg-white border-t border-slate-50 flex items-center justify-between shrink-0 mt-auto">
                    {!isCreating ? (
                        <button onClick={() => onDelete(instance.id)} className="flex items-center gap-2 text-rose-400 font-black text-[10px] uppercase tracking-widest hover:text-rose-600 transition-all">
                            <Trash2 size={16} /> Remover Conexão
                        </button>
                    ) : <div />}
                    <div className="flex gap-4">
                        <button onClick={onClose} className="h-14 px-8 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-all">Cancelar</button>
                        <button onClick={handleSubmit} disabled={isSaving} className="h-14 px-10 bg-[#356854] text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-900/20 hover:bg-[#2d5847] transition-all flex items-center gap-3 disabled:opacity-50">
                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {isSaving ? 'Processando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </footer>
            </div>

            {isQRCodeModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-2xl animate-in fade-in duration-500" onClick={() => { setIsQRCodeModalOpen(false); checkStatus(false); }}>
                    <div className="bg-white p-12 rounded-[3rem] shadow-2xl relative text-center max-w-sm w-full animate-in zoom-in slide-in-from-bottom-8 duration-500" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setIsQRCodeModalOpen(false); checkStatus(false); }} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 transition-colors bg-slate-50 w-10 h-10 rounded-xl flex items-center justify-center">
                            <X size={20} />
                        </button>
                        <div className="w-20 h-20 bg-emerald-50 text-[#356854] rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-emerald-100">
                            <QrCode size={36} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">Sincronia WhatsApp</h3>
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-10 leading-relaxed px-4 opacity-70">Escaneie o código abaixo com o seu dispositivo para autorizar o acesso</p>
                        <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 inline-block mb-10 shadow-inner group">
                            {qrCode ? (
                                <img src={qrCode.startsWith('data:image') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" className="w-52 h-52 relative z-10 rounded-2xl transition-all group-hover:scale-105 duration-500" />
                            ) : (
                                <div className="w-52 h-52 flex flex-col items-center justify-center gap-4">
                                    <Loader2 size={40} className="animate-spin text-[#356854]" />
                                    <span className="text-[9px] font-black text-[#356854] uppercase tracking-widest">Gerando Túnel...</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3 justify-center text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] bg-emerald-50 py-4 rounded-2xl border border-emerald-100">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                            Aguardando Leitura
                        </div>
                    </div>
                </div>
            )}

            {confirmAction && (
                <ConfirmationModal title={confirmAction.title} message={confirmAction.message} onConfirm={confirmAction.action} onClose={() => setConfirmAction(null)} />
            )}
        </Modal>
    );
};

const InstanceRow = ({ instance, onEdit, onToggle }) => {
    const [statusInfo, setStatusInfo] = useState({ status: 'loading' });
    const [googleStatus, setGoogleStatus] = useState('loading');

    const checkStatus = useCallback(async () => {
        try { const response = await api.get(`/whatsapp/${instance.id}/status`); setStatusInfo(response.data); }
        catch (err) { setStatusInfo({ status: 'api_error' }); }
    }, [instance.id]);

    const checkGoogleStatus = useCallback(async () => {
        try { const response = await api.get(`/google-contacts/${instance.id}/status`); setGoogleStatus(response.data.status); }
        catch (err) { setGoogleStatus('error'); }
    }, [instance.id]);

    useEffect(() => { checkStatus(); checkGoogleStatus(); }, [instance.id]); // Removido callbacks instáveis das dependências

    return (
        <div className="ds-card p-6 flex flex-col lg:grid lg:grid-cols-12 items-center gap-8 group">
            <div className="lg:col-span-1 flex justify-center">
                <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all shadow-lg ${instance.is_active ? 'bg-[#356854] text-white shadow-emerald-900/10' : 'bg-slate-50 text-slate-300'}`}>
                    <Smartphone size={32} />
                </div>
            </div>

            <div className="lg:col-span-3 text-center lg:text-left">
                <div className="flex items-center justify-center lg:justify-start gap-4 mb-2">
                    <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none">{instance.name}</h3>
                    {instance.is_active ? (
                        <span className="status-pill bg-emerald-50 text-emerald-600 border border-emerald-100 px-3 py-1 rounded-lg">Ativo</span>
                    ) : (
                        <span className="status-pill bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1 rounded-lg">Pausado</span>
                    )}
                </div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center lg:justify-start gap-2">
                    <Layout size={12} /> {instance.number || instance.instance_name}
                </p>
            </div>

            <div className="lg:col-span-6 flex flex-wrap justify-center lg:justify-start gap-4">
                <div className={`status-pill px-5 py-3 rounded-2xl border flex items-center gap-3 transition-all ${statusInfo.status === 'connected' || statusInfo.status === 'open' ? 'bg-[#356854] text-white border-[#356854] shadow-lg shadow-emerald-900/10' : 'bg-white text-slate-400 border-slate-100'}`}>
                    <Smartphone size={14} /> WhatsApp: {statusInfo.status === 'connected' || statusInfo.status === 'open' ? 'Online' : 'Offline'}
                </div>
                <div className={`status-pill px-5 py-3 rounded-2xl border flex items-center gap-3 transition-all ${googleStatus === 'connected' ? 'bg-sky-500 text-white border-sky-500 shadow-lg shadow-sky-900/10' : 'bg-white text-slate-400 border-slate-100'}`}>
                    <Cloud size={14} /> Google: {googleStatus === 'connected' ? 'Sincronizado' : 'Inativo'}
                </div>
                <div className="status-pill px-5 py-3 rounded-2xl border border-slate-100 bg-slate-50 text-slate-500 flex items-center gap-3 font-black">
                    <Clock size={14} /> {instance.interval_seconds}s GAP
                </div>
            </div>

            <div className="lg:col-span-2 flex justify-center lg:justify-end gap-3 w-full lg:w-auto">
                <button
                    onClick={() => onToggle(instance)}
                    className={`w-16 h-16 flex items-center justify-center border rounded-[1.5rem] shadow-sm transition-all group/toggle ${instance.is_active ? 'bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100' : 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100'}`}
                    title={instance.is_active ? 'Desativar Terminal' : 'Ativar Terminal'}
                >
                    <Power size={24} className={`${instance.is_active ? 'animate-pulse' : ''}`} />
                </button>
                <button onClick={() => onEdit(instance)} className="w-16 h-16 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-[#356854] hover:border-emerald-100 rounded-[1.5rem] shadow-sm transition-all group/btn">
                    <Settings size={24} className="group-hover/btn:rotate-90 transition-transform duration-500" />
                </button>
            </div>
        </div>
    );
};

function Whatsapp() {
    const [instances, setInstances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalState, setModalState] = useState({ isOpen: false, instance: null });

    const fetchInstances = useCallback(async () => {
        try {
            const response = await api.get('/whatsapp/');
            setInstances(response.data);
        } catch (error) {
            toast.error('Falha na comunicação com o servidor.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchInstances(); }, [fetchInstances]);

    // Google OAuth Callback
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const instanceId = localStorage.getItem('google_auth_instance_id');
        if (code && instanceId) {
            (async () => {
                try {
                    window.history.pushState({}, document.title, "/whatsapp");
                    const redirect = `${window.location.origin}/whatsapp`;
                    await api.post(`/google-contacts/auth/callback?code=${code}&redirect_uri=${encodeURIComponent(redirect)}&instance_id=${instanceId}`);
                    toast.success("Integração concluída!");
                    localStorage.removeItem('google_auth_instance_id');
                    fetchInstances();
                } catch (err) { toast.error("Falha ao finalizar conexão Google."); }
            })();
        }
    }, [fetchInstances]);

    const handleSaveInstance = async (formData) => {
        try {
            if (modalState.instance) await api.put(`/whatsapp/${modalState.instance.id}`, formData);
            else await api.post('/whatsapp/', formData);
            toast.success('Instância salva com sucesso!');
            fetchInstances();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Erro ao processar solicitação.');
            throw error;
        }
    };

    const handleDeleteInstance = async (id) => {
        try {
            await api.delete(`/whatsapp/${id}`);
            setInstances(prev => prev.filter(i => i.id !== id));
            toast.success('Instância removida.');
            setModalState({ isOpen: false, instance: null });
        } catch (err) { toast.error('Falha ao excluir.'); }
    };

    const handleToggleInstance = async (instance) => {
        try {
            const newStatus = !instance.is_active;
            await api.put(`/whatsapp/${instance.id}`, { is_active: newStatus });
            setInstances(prev => prev.map(i => i.id === instance.id ? { ...i, is_active: newStatus } : i));
            toast.success(newStatus ? 'Terminal ativado!' : 'Terminal pausado.');
        } catch (error) {
            toast.error('Erro ao alterar status.');
        }
    };

    return (
        <div className="whatsapp-page p-6 md:p-12 min-h-screen">
            <style>{DS_STYLE}</style>
            <div className="max-w-7xl mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-4">
                            Centrais de Mensagens <MessageSquare size={28} className="text-[#356854]" />
                        </h1>
                        <p className="text-slate-400 mt-2 text-sm font-medium">Orquestração de terminais e sincronização de dados</p>
                    </div>
                    <button
                        onClick={() => setModalState({ isOpen: true, instance: null })}
                        className="h-14 px-10 bg-[#356854] text-white font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-900/20 hover:bg-[#2d5847] transition-all flex items-center gap-3"
                    >
                        <Plus size={20} /> Provisionar Terminal
                    </button>
                </header>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 gap-6 opacity-40">
                        <Loader2 size={48} className="animate-spin text-[#356854]" />
                        <span className="text-sm font-black uppercase tracking-widest">Mapeando Infraestrutura...</span>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {instances.map(instance => (
                            <InstanceRow
                                key={instance.id}
                                instance={instance}
                                onEdit={(inst) => setModalState({ isOpen: true, instance: inst })}
                                onToggle={handleToggleInstance}
                            />
                        ))}

                        {instances.length === 0 && (
                            <div className="ds-surface py-32 text-center border-dashed border-2">
                                <Smartphone size={64} className="mx-auto text-slate-200 mb-8" />
                                <h3 className="text-xl font-black text-slate-800 mb-2">Nenhum terminal conectado</h3>
                                <p className="text-slate-400 text-sm font-medium mb-10">Inicie o provisionamento de um novo número para começar a operar.</p>
                                <button
                                    onClick={() => setModalState({ isOpen: true, instance: null })}
                                    className="text-[#356854] font-black text-xs uppercase tracking-widest hover:underline"
                                >
                                    Adicionar Terminal Agora
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {modalState.isOpen && (
                <InstanceModal
                    instance={modalState.instance}
                    onClose={() => setModalState({ isOpen: false, instance: null })}
                    onSave={handleSaveInstance}
                    onDelete={handleDeleteInstance}
                />
            )}
        </div>
    );
}

export default Whatsapp;