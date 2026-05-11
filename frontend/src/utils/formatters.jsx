/**
 * Utilitários para formatação de texto estilo WhatsApp
 */

/**
 * Converte marcações do WhatsApp (*bold*, _italic_, ~strike~, ```code```) em elementos React/HTML
 * @param {string} text 
 * @returns {string|React.ReactNode}
 */
export const formatWhatsAppText = (text) => {
    if (!text || typeof text !== 'string') return text;

    // Escapa caracteres HTML básicos para evitar XSS (opcional, dependendo de como você renderiza)
    let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code block: ```text```
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<code class="whatsapp-code-block">$1</code>');

    // Inline code: `text`
    formatted = formatted.replace(/`([^`\n]+)`/g, '<code class="whatsapp-code-inline">$1</code>');

    // Bold: *text*
    formatted = formatted.replace(/\*([^\*\n]+)\*/g, '<strong>$1</strong>');

    // Italic: _text_
    formatted = formatted.replace(/_([^_ \n][^_ \n]*)_/g, '<em>$1</em>');

    // Strikethrough: ~text~
    formatted = formatted.replace(/~([^~ \n][^~ \n]*)~/g, '<del>$1</del>');

    // New lines
    formatted = formatted.replace(/\n/g, '<br />');

    // Como o React não renderiza HTML string diretamente com segurança, 
    // em um ambiente real você usaria dangerouslySetInnerHTML ou um parser.
    // Para simplificar e manter a compatibilidade com os componentes que esperam JSX ou string,
    // vamos retornar o texto formatado. Se o componente usa {formatWhatsAppText(msg)}, 
    // ele precisará tratar isso. No AtendAI, geralmente usamos dangerouslySetInnerHTML ou um wrapper.
    
    return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
};

/**
 * Remove marcações do WhatsApp para exibição em previews (como na lista de contatos)
 * @param {string} text 
 * @returns {string}
 */
export const stripWhatsAppFormatting = (text) => {
    if (!text || typeof text !== 'string') return text;

    return text
        .replace(/\*([^\*\n]+)\*/g, '$1')      // Bold
        .replace(/_([^_ \n][^_ \n]*)_/g, '$1')   // Italic
        .replace(/~([^~ \n][^~ \n]*)~/g, '$1')   // Strike
        .replace(/```([\s\S]*?)```/g, '$1')      // Code block
        .replace(/`([^`\n]+)`/g, '$1')           // Inline code
        .replace(/\n/g, ' ');                    // New lines to spaces
};
