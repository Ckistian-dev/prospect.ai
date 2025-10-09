import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import QRCode from 'qrcode.react';
import { Wifi, WifiOff, Loader2, ServerCrash, LogOut, Save, Edit, AlertCircle, ScanLine, RefreshCw } from 'lucide-react';

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
            case 'loading_qr':
                return <div><Loader2 size={64} className="mx-auto text-brand-green animate-spin mb-4" /><p className="text-gray-600">{statusInfo.status === 'loading_qr' ? 'A gerar QR Code...' : 'A verificar...'}</p></div>;

            // Os estados 'connecting' e 'close' agora mostram o QR Code diretamente.
            case 'connecting':
            case 'close':
            case 'qrcode':
                return <div><ScanLine size={32} className="mx-auto text-brand-green mb-2" /><h2 className="text-2xl font-bold text-gray-800 mb-4">Leia o QR Code para Conectar</h2><div className="p-4 bg-white inline-block rounded-lg shadow-inner">{qrCode ? <QRCode value={qrCode} size={256} /> : <Loader2 size={64} className="animate-spin text-brand-green" />}</div><p className="text-gray-600 mt-4">Abra o WhatsApp no seu telemóvel e leia o código.</p></div>;
            
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

function Whatsapp() {
    const [statusInfo, setStatusInfo] = useState({ status: 'loading' });
    const [qrCode, setQrCode] = useState('');
    const [error, setError] = useState('');
    const [instanceName, setInstanceName] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
 
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
            const response = await api.get('/whatsapp/status');
            const newStatus = response.data.status;

            if ((newStatus === 'close' || newStatus === 'connecting')) {
                // Se o estado é 'close', significa que precisamos do QR Code.
                // Chamamos a função de conectar para obtê-lo.
                await handleConnect();
            } else {
                // Para qualquer outro estado (open, disconnected, etc.), apenas atualizamos a UI.
                setStatusInfo(response.data);
                // E garantimos que o QR Code antigo seja limpo se não for mais necessário.
                setQrCode('');
            }
        } catch {
            setStatusInfo({ status: 'error' });
            setError('Não foi possível verificar o estado.');
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
                // Após desconectar, chama o checkStatus para atualizar a UI para 'desconectado'.
                await checkStatus();
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
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Conexão WhatsApp</h1>
                <p className="text-gray-500 mt-1">Faça a gestão da conexão com a API da Evolution.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 max-w-lg mx-auto">
                <div className="mb-6 p-4 bg-gray-100 rounded-lg border border-gray-200">
                    <label className="block text-sm font-medium text-gray-600 mb-2">Nome da Instância</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="text" value={instanceName} onChange={(e) => setInstanceName(e.target.value)} disabled={!isEditing}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green disabled:bg-gray-200 disabled:text-gray-500"
                            placeholder="ex: meu-whatsapp"
                        />
                        {statusInfo.status !== 'connected' && statusInfo.status !== 'open' && (
                            isEditing ? (
                                <button onClick={handleSaveInstanceName} title="Salvar" className="p-2 bg-green-500 text-white rounded-md hover:bg-green-600"><Save size={20}/></button>
                            ) : (
                                <button onClick={() => setIsEditing(true)} title="Editar" className="p-2 bg-gray-200 text-gray-600 rounded-md hover:bg-gray-300"><Edit size={20}/></button>
                            )
                        )}
                    </div>
                    {isEditing && <p className="text-xs text-gray-500 mt-1">O nome deve ser único e sem espaços.</p>}
                </div>
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
        </div>
    );
}

export default Whatsapp;