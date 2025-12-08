import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import { WifiOff, Loader2, ServerCrash, AlertCircle, ScanLine, RefreshCw, Link, Cloud, CloudCog, CheckCircle, User, Power } from 'lucide-react';

const StatusDisplay = ({ statusInfo, qrCode, onConnect, onDisconnect, onRefresh, isChecking, error, disabled }) => {
    // O botão de atualizar agora aparece em todos os estados, exceto quando está conectado ou a carregar.
    const showRefreshButton = !['loading', 'loading_qr', 'connected', 'open'].includes(statusInfo.status);

    const getContainerClasses = () => {
        // As classes de fundo e borda foram removidas para que o card principal controle o estilo.
        const baseClasses = 'text-center p-4 rounded-lg transition-colors duration-300';
        switch (statusInfo?.status) {
            case 'connected':
            case 'open':
                return `${baseClasses} border-gray-300`;
        }
    };
    
    const renderContent = () => {
        switch (statusInfo?.status) {
            case 'connected':
            case 'open':
                return (
                    <div className="bg-green-50 border border-green-200 p-4 rounded-lg w-full">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CheckCircle size={24} className="text-green-500" />
                                <div>
                                    <p className="font-semibold text-green-800">WhatsApp Conectado</p>
                                    <p className="text-sm text-gray-600">Sua instância está online.</p>
                                </div>
                            </div>
                            <button onClick={onDisconnect} disabled={isChecking} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors" title="Desconectar">
                                {isChecking ? <Loader2 size={18} className="animate-spin"/> : <Power size={18} />}
                            </button>
                        </div>
                        <div className="mt-4 border-t border-green-200 pt-4">
                            <button onClick={onRefresh} disabled={isChecking} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-all disabled:bg-gray-400">
                                <RefreshCw size={18} /> Verificar Conexão
                            </button>
                        </div>
                    </div>
                );
            
            case 'loading':
            case 'loading_qr': // Estado para quando o QR Code está sendo gerado
                return <div><Loader2 size={64} className="mx-auto text-brand-green animate-spin mb-4" /><p className="text-gray-600">{statusInfo.status === 'loading_qr' ? 'Gerando QR Code...' : 'A verificar...'}</p></div>;
            
            // --- MELHORIA: Unificar estados que levam à exibição do QR Code ---
            case 'connecting':
            case 'close':
            case 'qrcode':
                return (
                    <div>
                        <ScanLine size={32} className="mx-auto text-brand-green mb-2" />
                        <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Leia o QR Code para Conectar</h2>
                        <div className="mx-auto p-4 flex items-center justify-center">
                            {qrCode ? (
                                <img 
                                    src={qrCode.startsWith('data:image') ? qrCode : `data:image/png;base64,${qrCode}`}
                                    alt="QR Code" width="256" height="256" />
                            ) : <Loader2 size={64} className="animate-spin text-brand-green" />}
                        </div>
                        <p className="text-gray-600 mt-4">Abra o WhatsApp no seu telemóvel e leia o código.</p>
                    </div>
                );
            
            case 'error':
            case 'api_error':
                return <div><ServerCrash size={64} className="mx-auto text-red-500 mb-4" /><h2 className="text-2xl font-bold text-red-800">Erro</h2><p className="text-red-700 mt-2">{error}</p></div>;
            
            case 'no_instance_name':
                return <div><AlertCircle size={48} className="mx-auto text-amber-500 mb-4" /><h2 className="text-2xl font-bold text-amber-800">Ação Necessária</h2><p className="text-amber-700 mt-2">Guarde um nome para a sua instância para continuar.</p></div>;
            
            default:
                return <div><WifiOff size={64} className="mx-auto text-gray-400 mb-4" /><h2 className="text-2xl font-bold text-gray-800">Desconectado</h2><p className="text-gray-600 mt-2">A sua sessão do WhatsApp não está ativa.</p><button onClick={onConnect} disabled={disabled} className="mt-6 flex items-center gap-2 mx-auto bg-brand-green text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400">Conectar</button></div>;
        }
    };

    return (
        <div>
            <div className={`min-h-[260px] flex items-center justify-center ${getContainerClasses()}`}>
                {renderContent()}
            </div>
            {showRefreshButton && (
                <div className="border-t border-gray-200 pt-4 mt-4 text-center">
                    <button onClick={onRefresh} disabled={isChecking} className="flex items-center justify-center gap-2 mx-auto text-sm text-gray-500 hover:text-brand-green font-semibold disabled:opacity-50">
                        {isChecking ? <><Loader2 size={16} className="animate-spin" /> A verificar...</> : <><RefreshCw size={16} /> Atualizar Estado</>}
                    </button>
                </div>
            )}
        </div>
    );
};

const GoogleContactsCard = () => {
    const [status, setStatus] = useState('loading'); // loading, connected, disconnected, error
    const [userEmail, setUserEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const checkGoogleStatus = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/google-contacts/status');
            setStatus(response.data.status);
            if (response.data.status === 'connected') setUserEmail(localStorage.getItem('userEmail'));
        } catch (err) {
            setError('Não foi possível verificar o estado da conexão com o Google.');
            setStatus('error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        checkGoogleStatus();
    }, [checkGoogleStatus]);

    const handleGoogleConnect = async () => {
        setIsLoading(true);
        try {
            // Constrói a URL de callback que será usada pelo Google e pelo nosso backend.
            const redirectUri = `${window.location.origin}/whatsapp`;
            const { data } = await api.get(`/google-contacts/auth/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
            window.location.href = data.authorization_url;
        } catch (err) {
            setError('Não foi possível iniciar a conexão com o Google. Tente novamente.');
            setIsLoading(false);
        }
    };

    const handleGoogleDisconnect = async () => {
        if (window.confirm('Tem a certeza que deseja desconectar a sua conta Google? A sincronização automática será interrompida.')) {
            setIsLoading(true);
            try {
                await api.post('/google-contacts/disconnect');
                setStatus('disconnected');
            } catch (err) {
                setError('Não foi possível desconectar. Tente novamente.');
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleManualSync = async () => {
        setIsLoading(true);
        try {
            const response = await api.post('/google-contacts/sync');
            alert(`Sincronização concluída! ${response.data.details.success} contatos sincronizados, ${response.data.details.failed} falharam.`);
        } catch (err) {
            setError('Ocorreu um erro durante a sincronização manual.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <div className="flex items-center gap-4 mb-4">
                <Cloud size={28} className="text-blue-500" />
                <h2 className="text-xl font-bold text-gray-800">Sincronização Google Contacts</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
                Conecte sua conta Google (a mesma usada no seu celular) para salvar os contatos da prospecção. Isso ajuda o WhatsApp a reconhecer os números, evitando bloqueios.
                <br/><strong className="text-gray-700">Importante:</strong> A sincronização de contatos do Google deve estar ativa no seu telemóvel.
            </p>
            {status === 'loading' && <div className="text-center"><Loader2 className="animate-spin mx-auto text-brand-green" /></div>}
            {status === 'disconnected' && <button onClick={handleGoogleConnect} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-600 transition-all disabled:bg-gray-400"><Link size={18} /> Conectar Conta Google</button>}
            {status === 'connected' && (
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <CheckCircle size={24} className="text-green-500" />
                            <div>
                                <p className="font-semibold text-green-800">Conta Conectada</p>
                                <p className="text-sm text-gray-600 flex items-center gap-1.5"><User size={14}/> {userEmail || 'Usuário'}</p>
                            </div>
                        </div>
                        <button onClick={handleGoogleDisconnect} disabled={isLoading} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors" title="Desconectar">
                            {isLoading ? <Loader2 size={18} className="animate-spin"/> : <Power size={18} />}
                        </button>
                    </div>
                    <div className="mt-4 border-t border-green-200 pt-4">
                        <button onClick={handleManualSync} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-all disabled:bg-gray-400">
                            <CloudCog size={18} /> Sincronizar Contatos Manualmente
                        </button>
                    </div>
                </div>
            )}
            {status === 'error' && <p className="text-red-600 text-sm">{error}</p>}
        </div>
    );
};

function Whatsapp() {
    const [statusInfo, setStatusInfo] = useState({ status: 'loading' });
    const [qrCode, setQrCode] = useState('');
    const [error, setError] = useState('');
    const [isChecking, setIsChecking] = useState(false);

    // Lógica para lidar com o callback do Google OAuth
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        // Apenas executa se o código estiver presente na URL.
        if (code) {
            const handleAuthCallback = async () => {
                try {
                    // Limpa a URL imediatamente para evitar reprocessamento em caso de recarga.
                    window.history.pushState({}, document.title, "/whatsapp");

                    const redirectUri = `${window.location.origin}/whatsapp`;
                    await api.post(`/google-contacts/auth/callback?code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`);
                    
                    // Em vez de recarregar a página inteira, apenas atualizamos o estado do componente Google.
                    // Isso requer uma pequena alteração no componente GoogleContactsCard para aceitar uma função de atualização.
                    // Por enquanto, um alerta de sucesso e um recarregamento manual pelo usuário é mais seguro.
                    alert("Conta Google conectada com sucesso! A página será atualizada.");
                    window.location.reload(); // Recarrega para refletir o novo estado.
                } catch (err) {
                    console.error("Falha no callback do Google:", err);
                    alert("Ocorreu um erro ao finalizar a conexão com o Google. Verifique o console para mais detalhes.");
                }
            };
            handleAuthCallback();
        }
    }, []); // O array de dependências vazio garante que este efeito rode apenas uma vez na montagem.
 
    const handleConnect = useCallback(async () => {
        if (isChecking) return;
        setIsChecking(true);
        setStatusInfo({ status: 'loading_qr' });
        try {
            const response = await api.get('/whatsapp/connect');
            const instanceData = response.data.instance;
            if (response.data.status === 'qrcode' && instanceData && instanceData.qrcode) {
                setQrCode(instanceData.qrcode);
                setStatusInfo({ status: 'qrcode' });
            } else {
                setStatusInfo(response.data.instance ? { status: response.data.instance.state } : { status: 'disconnected' });
            }
        } catch (err) {
            setError('Erro ao tentar conectar.');
            setStatusInfo({ status: 'error' });
        } finally {
            setIsChecking(false);
        }
    }, [isChecking]);

    const checkStatus = useCallback(async () => {
        if (isChecking) {
            return;
        }
        setIsChecking(true);
        setError('');
        try {
            // A verificação de status agora é mais simples.
            const response = await api.get('/whatsapp/status');
            setStatusInfo(response.data);
            
            // Limpa o QR code se o status não for mais 'qrcode'.
            // Isso acontece se a página for recarregada e o status já for 'conectado'.
            if (response.data.status !== 'qrcode') {
                setQrCode('');
            }
        } catch (err) {
            setError('Não foi possível verificar o estado. Tente atualizar a página.');
            setStatusInfo({ status: 'api_error' });
        } finally {
            setIsChecking(false);
        }
    }, [isChecking]);
 
    useEffect(() => {
        checkStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
 
    const handleDisconnect = async () => {
        if (window.confirm('Tem a certeza que deseja desconectar e apagar a instância?')) {
            setIsChecking(true);
            try {
                await api.post('/whatsapp/disconnect');
                setQrCode('');
                // Apenas atualiza o estado local para 'desconectado' para uma resposta de UI mais rápida.
                setStatusInfo({ status: 'disconnected' });
            } catch (err) {
                alert('Não foi possível desconectar a instância.');
            } finally {
                setIsChecking(false);
            }
        }
    };
 
    return (
        <div className="p-6 md:p-10 bg-gray-50 min-h-full">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold text-gray-800">Conexões</h1>
                <p className="text-gray-500 mt-1">Faça a gestão das suas conexões com o WhatsApp e outros serviços.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                    <div className="flex items-center gap-4 mb-5">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp Logo" className="w-7 h-7" />
                        <h2 className="text-xl font-bold text-gray-800">Conexão WhatsApp</h2>
                    </div>
                    <p className="text-sm text-gray-600">
                        Conecte sua conta do WhatsApp para automatizar o envio de mensagens em suas campanhas de prospecção. A conexão é feita de forma segura lendo um QR Code.
                    </p>
                    <StatusDisplay 
                        statusInfo={statusInfo} 
                        qrCode={qrCode} 
                        onConnect={handleConnect} 
                        onDisconnect={handleDisconnect} 
                        onRefresh={checkStatus}
                        isChecking={isChecking}
                        error={error} 
                    />
                </div>
                <GoogleContactsCard />
            </div>
        </div>
    );
}

export default Whatsapp;