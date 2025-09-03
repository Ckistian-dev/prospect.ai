import React, { useEffect, useRef } from 'react';

const LogLine = ({ text }) => {
  // Define a cor da linha com base no seu conteúdo
  const getLineColor = () => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('erro') || lowerText.includes('falha')) {
      return 'text-red-600';
    }
    if (lowerText.includes('concluída') || lowerText.includes('sucesso')) {
      return 'text-green-600 font-bold';
    }
    if (lowerText.includes('interrompido')) {
        return 'text-amber-600';
    }
    return 'text-gray-700';
  };

  return (
    <div className="flex items-start text-sm">
      <span className="text-gray-400 mr-3 select-none">{'>'}</span>
      <span className={`flex-1 ${getLineColor()}`}>{text}</span>
    </div>
  );
};


function LogDisplay({ logText }) {
  const logContainerRef = useRef(null);

  // Efeito para rolar automaticamente para o final do log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logText]);

  // Divide o texto do log em linhas para poder estilizar cada uma individualmente
  const logLines = logText ? logText.split('\n').filter(line => line.trim() !== '') : [];

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        {/* Indicador "LIVE" agora é verde */}
        <span className="flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
        </span>
        <h3 className="text-lg font-semibold text-gray-700">LOG EM TEMPO REAL</h3>
      </div>
      
      {/* A CORREÇÃO ESTÁ AQUI: Adicionamos a classe `min-h-0` */}
      <div 
        ref={logContainerRef}
        className="flex-1 bg-gray-100 p-4 rounded-lg overflow-y-auto font-mono text-sm space-y-2 border min-h-0"
      >
        {logLines.length > 0 ? (
          logLines.map((line, index) => <LogLine key={index} text={line} />)
        ) : (
          <p className="text-gray-500 italic">Aguardando início da prospecção...</p>
        )}
      </div>
    </>
  );
}

export default LogDisplay;

