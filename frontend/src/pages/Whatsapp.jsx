import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import { Wifi, WifiOff, Loader2, ServerCrash, LogOut, Save, Edit, AlertCircle, ScanLine, RefreshCw, Link, Link2Off, Cloud, CloudCog } from 'lucide-react';

const StatusDisplay = ({ statusInfo, qrCode, onConnect, onDisconnect, onRefresh, isChecking, error, disabled }) => {
    // O botão de atualizar agora aparece em todos os estados, exceto quando está conectado ou a carregar.
    const showRefreshButton = !['loading', 'loading_qr', 'connected', 'open'].includes(statusInfo.status);

    const getContainerClasses = () => {
        const baseClasses = 'text-center p-8 border-2 border-dashed rounded-lg transition-colors duration-300';
        switch (statusInfo?.status) {
            case 'connected':
            case 'open':
                return `${baseClasses} bg-green-50 border-green-300`;
            case 'connecting':
            case 'close':
            case 'qrcode':
                return `${baseClasses} bg-blue-50 border-blue-300`;
            case 'error':
            case 'api_error':
                return `${baseClasses} bg-red-50 border-red-300`;
            case 'no_instance_name':
                return `${baseClasses} bg-amber-50 border-amber-300`;
            default:
                return `${baseClasses} bg-gray-50 border-gray-300`;
        }
    };
    
    const renderContent = () => {
        switch (statusInfo?.status) {
            case 'connected':
            case 'open':
                return (
                    <div>
                        <Wifi size={64} className="mx-auto text-green-500 mb-4" />
                        <h2 className="text-2xl font-bold text-green-800">Conectado</h2>
                        <p className="text-gray-600 mt-2">A sua instância está online e pronta para operar.</p>
                        <button onClick={onDisconnect} className="mt-6 flex items-center gap-2 mx-auto bg-red-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-red-600 transition-all">
                            <LogOut size={18} /> Desconectar
                        </button>
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
            <div className={`min-h-[350px] flex items-center justify-center ${getContainerClasses()}`}>
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
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const checkGoogleStatus = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/google-contacts/status');
            setStatus(response.data.status);
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
            const { data } = await api.get('/google-contacts/auth/url');
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
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 max-w-lg mx-auto">
            <div className="flex items-center gap-4 mb-4">
                <Cloud size={28} className="text-blue-500" />
                <h2 className="text-xl font-bold text-gray-800">Sincronização Google Contacts</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
                Conecte sua conta Google (a mesma usada no seu celular) para salvar os contatos da prospecção. Isso ajuda o WhatsApp a reconhecer os números, evitando bloqueios.
                <br/><strong>Importante:</strong> A sincronização de contatos deve estar ativa no seu telemóvel.
            </p>
            {status === 'loading' && <div className="text-center"><Loader2 className="animate-spin mx-auto text-brand-green" /></div>}
            {status === 'disconnected' && <button onClick={handleGoogleConnect} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-600 transition-all disabled:bg-gray-400"><Link size={18} /> Conectar Conta Google</button>}
            {status === 'connected' && <div className="space-y-3"><button onClick={handleManualSync} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 transition-all disabled:bg-gray-400"><CloudCog size={18} /> Sincronizar Contatos Manualmente</button><button onClick={handleGoogleDisconnect} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-all disabled:bg-gray-400"><Link2Off size={18} /> Desconectar</button></div>}
            {status === 'error' && <p className="text-red-600 text-sm">{error}</p>}
        </div>
    );
};

function Whatsapp() {
    const [statusInfo, setStatusInfo] = useState({ status: 'loading' });
    const [qrCode, setQrCode] = useState('');
    const [error, setError] = useState('');
    const [instanceName, setInstanceName] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isChecking, setIsChecking] = useState(false);

    // Lógica para lidar com o callback do Google OAuth
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            api.post(`/google-contacts/auth/callback?code=${code}`)
                .then(() => {
                    // Limpa a URL e recarrega a página ou atualiza o estado
                    window.history.pushState({}, document.title, "/whatsapp");
                    window.location.reload(); // Simples, mas eficaz
                })
                .catch(err => console.error("Falha no callback do Google", err));
        }
    }, []);
 
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
        if (!instanceName || isChecking) {
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
    }, [instanceName, isChecking, handleConnect]);
 
    useEffect(() => {
        const init = async () => {
            try {
                const res = await api.get('/whatsapp/instance');
                const savedName = res.data.instance_name || '';
                setInstanceName(savedName);
                if (!savedName) {
                    setIsEditing(true);
                    setStatusInfo({ status: 'no_instance_name'});
                }
            } catch {
                setError("Não foi possível procurar as configurações.");
                setStatusInfo({ status: 'error' });
            }
        };
        init();
    }, []);
 
    // Este useEffect agora executa apenas uma vez quando o nome da instância é definido
    // ou quando o modo de edição é desativado, quebrando o loop.
    useEffect(() => {
        if (instanceName && !isEditing) {
            checkStatus();
        }
    // A dependência 'checkStatus' foi removida intencionalmente para quebrar o ciclo de re-execução.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceName, isEditing]);
 
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
    
    const handleSaveInstanceName = async () => {
        if (!instanceName || instanceName.trim().length < 3) {
            alert('O nome da instância deve ter pelo menos 3 caracteres.');
            return;
        }
        setIsChecking(true);
        try {
            await api.post('/whatsapp/instance', { instance_name: instanceName });
            setIsEditing(false);
            // O useEffect [instanceName, isEditing] será acionado para chamar checkStatus.
        } catch (err) {
            setError('Não foi possível guardar o nome da instância.');
        } finally {
            setIsChecking(false);
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
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Conexão WhatsApp</h2>
                    <StatusDisplay 
                        statusInfo={statusInfo} 
                        qrCode={qrCode} 
                        onConnect={handleConnect} 
                        onDisconnect={handleDisconnect} 
                        onRefresh={checkStatus}
                        isChecking={isChecking}
                        error={error} 
                        disabled={!instanceName || isEditing}
                    />
                </div>
                <GoogleContactsCard />
            </div>
        </div>
    );
}

export default Whatsapp;