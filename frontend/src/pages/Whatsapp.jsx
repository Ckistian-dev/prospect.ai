import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import { WifiOff, Loader2, ServerCrash, AlertCircle, ScanLine, RefreshCw, Link, Cloud, CloudCog, CheckCircle, User, Power, Plus, Trash2, Smartphone, MessageSquare, Settings, Clock, Save, X, Edit } from 'lucide-react';
import toast from 'react-hot-toast';

const Modal = ({ onClose, children, maxWidth = "max-w-md" }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
        <div className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} mx-4 p-6 relative animate-fade-in-up`} onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-7 right-8 text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
            </button>
            {children}
        </div>
    </div>
);

const ConfirmationModal = ({ title, message, onConfirm, onClose }) => (
    <Modal onClose={onClose}>
        <div className="p-6 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-sm text-gray-500">{message}</p>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
                <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition">Confirmar</button>
            </div>
        </div>
    </Modal>
);

const StatusDisplay = ({ statusInfo, qrCode, onConnect, onDisconnect, onRefresh, isChecking, error, disabled, onShowQRCode }) => {
    const renderContent = () => {
        switch (statusInfo?.status) {
            case 'connected':
            case 'open':
                return (
                    <div className="flex gap-2">
                        <button 
                            onClick={onRefresh} 
                            disabled={isChecking} 
                            className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm border border-blue-100"
                            title="Sincronizar Número"
                        >
                            {isChecking ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />}
                        </button>
                        <button onClick={onDisconnect} disabled={isChecking} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm border border-red-100">
                            {isChecking ? <Loader2 size={16} className="animate-spin"/> : <Power size={16} />}
                            Desconectar
                        </button>
                    </div>
                );
            
            case 'loading':
            case 'loading_qr': // Estado para quando o QR Code está sendo gerado
                return <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 size={20} className="animate-spin text-brand-green" /> {statusInfo.status === 'loading_qr' ? 'Gerando QR...' : 'Verificando...'}</div>;
            
            // --- MELHORIA: Unificar estados que levam à exibição do QR Code ---
            case 'connecting':
            case 'close':
            case 'qrcode':
                return (
                    <button 
                        onClick={onShowQRCode} 
                        className="flex items-center gap-2 bg-brand-green text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:bg-brand-green-dark transition-all text-sm"
                    >
                        <ScanLine size={18} /> Ler QR Code
                    </button>
                );
            
            case 'error':
            case 'api_error':
                return (
                    <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                            <ServerCrash size={16} /> {error || 'Erro na conexão'}
                        </div>
                        <button onClick={onConnect} className="text-xs underline text-gray-500 hover:text-gray-700">Tentar novamente</button>
                    </div>
                );
            
            case 'no_instance_name':
                return <div className="flex items-center gap-2 text-amber-600 text-sm"><AlertCircle size={16} /> Config. incompleta</div>;
            
            default:
                return (
                    <button onClick={onConnect} disabled={disabled} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-6 rounded-lg shadow-sm hover:bg-gray-50 transition-all disabled:opacity-50 text-sm">
                        Conectar
                    </button>
                );
        }
    };

    return (
        <div className="flex flex-col items-center gap-2">
            {renderContent()}
        </div>
    );
};

const InstanceModal = ({ instance, onClose, onSave, onDelete }) => {
    const isCreating = !instance;
    
    const getInitialInterval = () => {
        const seconds = instance?.interval_seconds || 900;
        if (seconds >= 60 && seconds % 60 === 0) {
            return { value: seconds / 60, unit: 'minutes' };
        }
        return { value: seconds, unit: 'seconds' };
    };

    const [formData, setFormData] = useState({
        name: instance?.name || '',
        instance_name: instance?.instance_name || '',
        interval_seconds: instance?.interval_seconds || 900,
        is_active: instance?.is_active ?? true
    });
    
    const [intervalUI, setIntervalUI] = useState(getInitialInterval());

    // Connection States
    const [statusInfo, setStatusInfo] = useState({ status: 'loading' });
    const [qrCode, setQrCode] = useState('');
    const [error, setError] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Google States
    const [googleStatus, setGoogleStatus] = useState('loading');
    const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // { type: 'disconnect' | 'google_disconnect', action: () => void }

    const checkStatus = useCallback(async () => {
        if (isCreating || isChecking) return;
        setIsChecking(true);
        setError('');
        try {
            const response = await api.get(`/whatsapp/${instance.id}/status`);
            setStatusInfo(response.data);
            if (response.data.status !== 'qrcode') setQrCode('');
        } catch (err) {
            setError('Erro ao verificar.');
            setStatusInfo({ status: 'api_error' });
        } finally {
            setIsChecking(false);
        }
    }, [instance?.id, isCreating, isChecking]);

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
    }, [isCreating]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleConnect = async () => {
        if (isChecking) return;
        setIsChecking(true);
        setStatusInfo({ status: 'loading_qr' });
        try {
            const response = await api.get(`/whatsapp/${instance.id}/connect`);
            const instanceData = response.data.instance;
            if (response.data.status === 'qrcode' && instanceData && instanceData.qrcode) {
                setQrCode(instanceData.qrcode);
                setStatusInfo({ status: 'qrcode' });
                setIsQRCodeModalOpen(true);
            } else {
                setStatusInfo(response.data.instance ? { status: response.data.instance.state } : { status: 'disconnected' });
            }
        } catch (err) {
            setError('Erro ao conectar.');
            setStatusInfo({ status: 'error' });
        } finally {
            setIsChecking(false);
        }
    };

    const handleDisconnectClick = () => {
        setConfirmAction({
            type: 'disconnect',
            title: 'Desconectar Instância',
            message: 'Tem certeza que deseja desconectar esta instância?',
            action: performDisconnect
        });
    };

    const performDisconnect = async () => {
        setIsChecking(true);
        try {
            await api.post(`/whatsapp/${instance.id}/disconnect`);
            setQrCode('');
            setStatusInfo({ status: 'disconnected' });
            toast.success('Instância desconectada.');
        } catch (err) {
            toast.error('Erro ao desconectar.');
        } finally {
            setIsChecking(false);
            setConfirmAction(null);
        }
    };

    const handleGoogleConnect = async () => {
        setIsLoadingGoogle(true);
        try {
            const redirectUri = `${window.location.origin}/whatsapp`;
            const { data } = await api.get(`/google-contacts/auth/url?redirect_uri=${encodeURIComponent(redirectUri)}&instance_id=${instance.id}`);
            localStorage.setItem('google_auth_instance_id', instance.id);
            window.location.href = data.authorization_url;
        } catch (err) {
            toast.error('Erro ao iniciar conexão com Google.');
            setIsLoadingGoogle(false);
        }
    };

    const handleGoogleDisconnectClick = () => {
        setConfirmAction({
            type: 'google_disconnect',
            title: 'Desconectar Google',
            message: 'Desconectar conta Google desta instância?',
            action: performGoogleDisconnect
        });
    };

    const performGoogleDisconnect = async () => {
        setIsLoadingGoogle(true);
        try {
            await api.post(`/google-contacts/${instance.id}/disconnect`);
            setGoogleStatus('disconnected');
            toast.success('Google desconectado.');
        } catch (err) {
            toast.error('Erro ao desconectar Google.');
        } finally {
            setIsLoadingGoogle(false);
            setConfirmAction(null);
        }
    };

    const handleManualSync = async () => {
        setIsLoadingGoogle(true);
        try {
            const response = await api.post(`/google-contacts/${instance.id}/sync`);
            toast.success(`Sincronização: ${response.data.details.success} ok, ${response.data.details.failed} falhas.`);
        } catch (err) {
            toast.error('Erro na sincronização.');
        } finally {
            setIsLoadingGoogle(false);
        }
    };

    const handleIntervalChange = (field, value) => {
        const newUI = { ...intervalUI, [field]: value };
        setIntervalUI(newUI);
        
        const numValue = parseFloat(newUI.value) || 0;
        const totalSeconds = newUI.unit === 'minutes' ? numValue * 60 : numValue;
        
        setFormData(prev => ({ ...prev, interval_seconds: totalSeconds }));
    };

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async () => {
        setIsSaving(true);
        try {
            let payload = { ...formData };

            if (isCreating) {
                const userEmail = localStorage.getItem('userEmail') || '';
                const emailPrefix = userEmail.split('@')[0];
                const slugName = formData.name
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s+/g, "_")
                    .replace(/[^a-z0-9_]/g, "");
                payload.instance_name = `${slugName}_${emailPrefix}`;
            }

            await onSave(payload);
            onClose();
        } catch (error) {
            // Erro tratado no pai
        } finally {
            setIsSaving(false);
        }
    };

    const handleCloseQRCodeModal = () => {
        setIsQRCodeModalOpen(false);
        checkStatus();
    };

    return (
        <Modal onClose={onClose} maxWidth="max-w-lg">
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center border-b pb-4 pr-12">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">
                            {isCreating ? 'Nova Conexão' : `Gerenciar ${instance.name}`}
                        </h2>
                        {!isCreating && instance?.number && (
                            <p className="text-xs text-gray-500 font-medium mt-0.5">{instance.number}</p>
                        )}
                    </div>
                    <button 
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs border ${formData.is_active ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                    >
                        <Power size={14} />
                        {formData.is_active ? 'Ativa' : 'Inativa'}
                    </button>
                </div>

                {/* Status Section - Apenas se não estiver criando */}
                {!isCreating && (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${statusInfo.status === 'connected' || statusInfo.status === 'open' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                    {statusInfo.status === 'connected' || statusInfo.status === 'open' ? <CheckCircle size={20} /> : <WifiOff size={20} />}
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 text-sm">WhatsApp</h4>
                                    <p className="text-xs text-gray-500">
                                        {statusInfo.status === 'connected' || statusInfo.status === 'open' ? 'Conectado' : 'Desconectado'}
                                    </p>
                                </div>
                            </div>
                            <StatusDisplay 
                                statusInfo={statusInfo} 
                                qrCode={qrCode} 
                                onConnect={handleConnect} 
                                onDisconnect={handleDisconnectClick} 
                                onRefresh={checkStatus}
                                isChecking={isChecking}
                                error={error}
                                onShowQRCode={() => setIsQRCodeModalOpen(true)}
                            />
                        </div>
                    </div>
                )}

                {/* Card: Google Contacts (Apenas Editando) */}
                {!isCreating && (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${googleStatus === 'connected' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                    {googleStatus === 'connected' ? <CheckCircle size={20} /> : <Cloud size={20} />}
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 text-sm">Google Contacts</h4>
                                    <p className="text-xs text-gray-500">
                                        {googleStatus === 'connected' ? 'Conectado' : 'Desconectado'}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex flex-col items-center gap-2">
                                {googleStatus === 'loading' && (
                                    <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 size={20} className="animate-spin text-blue-600" /> Verificando...</div>
                                )}

                                {googleStatus === 'disconnected' && (
                                    <button 
                                        onClick={handleGoogleConnect} 
                                        disabled={isLoadingGoogle} 
                                        className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-6 rounded-lg shadow-sm hover:bg-gray-50 transition-all disabled:opacity-50 text-sm"
                                    >
                                        Conectar
                                    </button>
                                )}

                                {googleStatus === 'connected' && (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={handleManualSync} 
                                            disabled={isLoadingGoogle} 
                                            className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm border border-blue-100"
                                            title="Sincronizar"
                                        >
                                            {isLoadingGoogle ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />}
                                        </button>
                                        <button 
                                            onClick={handleGoogleDisconnectClick} 
                                            disabled={isLoadingGoogle} 
                                            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm border border-red-100"
                                        >
                                            <Power size={16} /> Desconectar
                                        </button>
                                    </div>
                                )}

                                {googleStatus === 'error' && (
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                                            <ServerCrash size={16} /> Erro
                                        </div>
                                        <button onClick={checkGoogleStatus} className="text-xs underline text-gray-500 hover:text-gray-700">Tentar novamente</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Card: Configurações */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                    <div className="flex items-center gap-2 mb-3 text-gray-800 font-semibold border-b border-gray-100 pb-2 text-sm">
                        <Settings size={18} /> Configurações
                    </div>
                    
                    <div className="flex-1 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Nome de Identificação</label>
                            <input 
                                type="text" 
                                name="name"
                                value={formData.name} 
                                onChange={handleFormChange}
                                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-green focus:border-transparent"
                                placeholder="Ex: Vendas 1"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Intervalo entre mensagens</label>
                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    value={intervalUI.value} 
                                    onChange={(e) => handleIntervalChange('value', e.target.value)}
                                    className="flex-1 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-green focus:border-transparent"
                                    min="1"
                                />
                                <select
                                    value={intervalUI.unit}
                                    onChange={(e) => handleIntervalChange('unit', e.target.value)}
                                    className="w-28 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-green focus:border-transparent bg-white"
                                >
                                    <option value="seconds">Segundos</option>
                                    <option value="minutes">Minutos</option>
                                </select>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Tempo de espera entre envios para evitar bloqueios.</p>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                    {!isCreating && (
                        <button 
                            onClick={() => onDelete(instance.id)}
                            className="mr-auto text-red-600 hover:text-red-800 text-xs font-medium flex items-center gap-1"
                        >
                            <Trash2 size={14} /> Excluir
                        </button>
                    )}
                    <button onClick={onClose} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm">Cancelar</button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={isSaving}
                        className="px-4 py-2 bg-brand-green text-white rounded-lg hover:bg-brand-green-dark transition-colors shadow-sm font-medium flex items-center gap-2 text-sm"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar
                    </button>
                </div>
            </div>

            {/* QR Code Modal Interno */}
            {isQRCodeModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm" onClick={handleCloseQRCodeModal}>
                    <div className="bg-white p-6 rounded-xl shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <button onClick={handleCloseQRCodeModal} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Escanear QR Code</h3>
                            <div className="bg-white p-2 rounded-lg border border-gray-200 inline-block">
                                {qrCode ? (
                                    <img src={qrCode.startsWith('data:image') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" className="w-64 h-64 object-contain" />
                                ) : (
                                    <div className="w-64 h-64 flex items-center justify-center"><Loader2 size={40} className="animate-spin text-brand-green" /></div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {confirmAction && (
                <ConfirmationModal
                    title={confirmAction.title}
                    message={confirmAction.message}
                    onConfirm={confirmAction.action}
                    onClose={() => setConfirmAction(null)}
                />
            )}
        </Modal>
    );
};

const InstanceRow = ({ instance, onDelete, onEdit }) => {
    const [statusInfo, setStatusInfo] = useState({ status: 'loading' });
    const [googleStatus, setGoogleStatus] = useState('loading');
    const [isChecking, setIsChecking] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState(null);
    
    const checkStatus = useCallback(async () => {
        if (isChecking) return;
        setIsChecking(true);
        try {
            const response = await api.get(`/whatsapp/${instance.id}/status`);
            setStatusInfo(response.data);
        } catch (err) {
            setStatusInfo({ status: 'api_error' });
        } finally {
            setIsChecking(false);
        }
    }, [instance.id, isChecking]);

    const checkGoogleStatus = useCallback(async () => {
        try {
            const response = await api.get(`/google-contacts/${instance.id}/status`);
            setGoogleStatus(response.data.status);
        } catch (err) {
            setGoogleStatus('error');
        }
    }, [instance.id]);

    useEffect(() => {
        checkStatus();
        checkGoogleStatus();
    }, []);

    const handleDeleteClick = () => {
        setDeleteConfirmation({
            title: 'Excluir Instância',
            message: `Excluir a instância "${instance.name}"? Isso removerá todos os dados associados.`,
            action: performDelete
        });
    };

    const performDelete = async () => {
        try {
            await api.delete(`/whatsapp/${instance.id}`);
            onDelete(instance.id);
            toast.success('Instância excluída.');
        } catch (err) {
            toast.error('Erro ao excluir instância.');
        } finally {
            setDeleteConfirmation(null);
        }
    };

    const formatInterval = (seconds) => {
        if (!seconds) return '60s';
        if (seconds >= 60 && seconds % 60 === 0) {
            return `${seconds / 60} min`;
        }
        return `${seconds}s`;
    };

    return (
        <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4 transition-all duration-200 hover:shadow-md group">
                {/* Header da Linha (Sempre visível) */}
                <div className="p-4 flex items-center justify-between bg-white">
                <div className="flex items-center gap-4 flex-1">
                    <div className={`p-2 rounded-full ${instance.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Smartphone size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800">{instance.name}</h3>
                        <p className="text-xs text-gray-500">{instance.number || 'Sem número conectado'}</p>
                    </div>
                    <div className="hidden md:flex items-center gap-2 ml-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium border flex items-center gap-1 ${statusInfo.status === 'connected' || statusInfo.status === 'open' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            <Smartphone size={12} />
                            {statusInfo.status === 'connected' || statusInfo.status === 'open' ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium border flex items-center gap-1 ${googleStatus === 'connected' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            <Cloud size={12} />
                            {googleStatus === 'connected' ? 'Google Conectado' : 'Google Desconectado'}
                        </span>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2 text-sm text-gray-500" title="Intervalo entre mensagens">
                        <Clock size={16} />
                        <span>{formatInterval(instance.interval_seconds)}</span>
                    </div>
                    <button onClick={() => onEdit(instance)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="Editar">
                        <Edit size={20} />
                    </button>
                    <button onClick={handleDeleteClick} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Excluir">
                        <Trash2 size={20} />
                    </button>
                </div>

                {deleteConfirmation && (
                    <ConfirmationModal
                        title={deleteConfirmation.title}
                        message={deleteConfirmation.message}
                        onConfirm={deleteConfirmation.action}
                        onClose={() => setDeleteConfirmation(null)}
                    />
                )}
            </div>
            </div>
        </>
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
            toast.error('Erro ao carregar instâncias.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInstances();
    }, [fetchInstances]);

    // Lógica para lidar com o callback do Google OAuth
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const instanceId = localStorage.getItem('google_auth_instance_id');

        if (code && instanceId) {
            const handleAuthCallback = async () => {
                try {
                    window.history.pushState({}, document.title, "/whatsapp");
                    const redirectUri = `${window.location.origin}/whatsapp`;
                    await api.post(`/google-contacts/auth/callback?code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}&instance_id=${instanceId}`);
                    
                    toast.success("Conta Google conectada com sucesso!");
                    localStorage.removeItem('google_auth_instance_id');
                    // Recarrega as instâncias para atualizar o status
                    fetchInstances();
                } catch (err) {
                    toast.error("Ocorreu um erro ao finalizar a conexão com o Google.");
                }
            };
            handleAuthCallback();
        }
    }, [fetchInstances]);

    const handleSaveInstance = async (formData) => {
        try {
            if (modalState.instance) {
                // Update
                await api.put(`/whatsapp/${modalState.instance.id}`, formData);
                toast.success('Instância atualizada com sucesso!');
            } else {
                // Create
                await api.post('/whatsapp/', formData);
                toast.success('Instância criada com sucesso!');
            }
            fetchInstances();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Erro ao salvar instância.');
            throw error; // Re-throw to keep modal open if needed or handle in modal
        }
    };

    const handleDeleteInstance = async (id) => {
        try {
            await api.delete(`/whatsapp/${id}`);
            setInstances(prev => prev.filter(i => i.id !== id));
            toast.success('Instância excluída.');
            setModalState({ isOpen: false, instance: null });
        } catch (err) {
            toast.error('Erro ao excluir instância.');
        }
    };

    return (
        <div className="p-6 md:p-10 bg-gray-50 min-h-full">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Conexões WhatsApp</h1>
                        <p className="text-gray-500 mt-1">Gerencie seus números e integrações.</p>
                    </div>
                    <button 
                        onClick={() => setModalState({ isOpen: true, instance: null })} 
                        className="flex items-center gap-2 bg-brand-green text-white px-4 py-2 rounded-lg hover:bg-brand-green-dark transition-colors shadow-md"
                    >
                        <Plus size={20} /> Nova Conexão
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 size={40} className="animate-spin text-brand-green" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {instances.map(instance => (
                            <InstanceRow 
                                key={instance.id} 
                                instance={instance} 
                                onDelete={(id) => setInstances(prev => prev.filter(i => i.id !== id))}
                                onEdit={(inst) => setModalState({ isOpen: true, instance: inst })}
                            />
                        ))}
                        
                        {instances.length === 0 && (
                            <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                                <MessageSquare size={48} className="mx-auto text-gray-300 mb-3" />
                                <h3 className="text-lg font-medium text-gray-600">Nenhuma conexão encontrada</h3>
                                <p className="text-gray-500 mb-4">Adicione um número de WhatsApp para começar.</p>
                                <button 
                                    onClick={() => setModalState({ isOpen: true, instance: null })}
                                    className="text-brand-green font-semibold hover:underline"
                                >
                                    Adicionar agora
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