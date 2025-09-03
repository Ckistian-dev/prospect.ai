import React, { useEffect, useRef } from 'react';
import Modal from '../Modal'; // Reutilizamos nosso componente de modal base

// Componente para exibir uma única bolha de mensagem
const MessageBubble = ({ message }) => {
  const isMe = message.sender === 'me';
  
  return (
    <div className={`flex items-end gap-2 w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`max-w-xs md:max-w-md p-3 rounded-2xl shadow-sm break-words ${
          isMe 
          ? 'bg-[#005c4b] text-white rounded-br-none' // Verde escuro do WhatsApp
          : 'bg-white text-gray-800 rounded-bl-none'
        }`}
      >
        {/* A classe whitespace-pre-wrap é crucial para respeitar os parágrafos */}
        <p className="whitespace-pre-wrap text-sm">{message.text}</p>
      </div>
    </div>
  );
};

// --- A LÓGICA DE ANÁLISE AVANÇADA ---
const parseConversation = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  const lines = text.split('\n');
  const messages = [];
  let currentMessage = null;

  lines.forEach(line => {
    const trimmedLine = line.trim();
    // Verifica se a linha marca o início de uma nova mensagem
    const isNewSender = trimmedLine.startsWith('- Eu:') || trimmedLine.startsWith('- Contato:');

    if (isNewSender) {
      // Se já estávamos construindo uma mensagem, salva ela na lista
      if (currentMessage) {
        currentMessage.text = currentMessage.text.trim(); // Remove espaços extras no final
        messages.push(currentMessage);
      }
      
      // Inicia a construção de uma nova mensagem
      const sender = trimmedLine.startsWith('- Eu:') ? 'me' : 'contact';
      const textContent = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim();
      currentMessage = { sender, text: textContent };
    } else if (currentMessage) {
      // Se não é um novo autor, anexa a linha à mensagem atual como um novo parágrafo
      currentMessage.text += '\n' + trimmedLine;
    }
  });

  // Não se esqueça de salvar a última mensagem que estava sendo construída
  if (currentMessage) {
    currentMessage.text = currentMessage.text.trim();
    messages.push(currentMessage);
  }

  return messages;
};


const ConversationModal = ({ onClose, conversation }) => {
  const chatContainerRef = useRef(null);

  // Efeito para rolar para a mensagem mais recente ao abrir
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, []);

  const messages = parseConversation(conversation.text);

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col h-[80vh] max-h-[80vh]">
        {/* Cabeçalho do Modal */}
        <div className="p-2 border-b bg-gray-100 rounded-t-lg">
          <h2 className="text-lg font-semibold text-gray-800">Conversa com {conversation.name}</h2>
        </div>
        
        {/* Corpo do Chat com fundo estilo WhatsApp */}
        <div 
            ref={chatContainerRef} 
            className="flex-1 p-8 overflow-y-auto space-y-4 bg-[#E5DDD5] bg-[url('https://i.redd.it/qwd83nc4xxf41.jpg')]"
        >
          {messages.map((msg, index) => (
            <MessageBubble key={index} message={msg} />
          ))}
          {messages.length === 0 && (
            <p className="text-center text-gray-500 italic pt-10">Nenhum histórico de conversa encontrado.</p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ConversationModal;

