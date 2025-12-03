import React from 'react';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Política de Privacidade</h1>
        
        <div className="prose prose-lg text-gray-700 max-w-none">
          <p><strong>Última atualização:</strong> [INSERIR DATA]</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">1. Introdução</h2>
          <p>
            Bem-vindo à Prospect AI ("nós", "nosso"). Estamos empenhados em proteger a sua privacidade. Esta Política de Privacidade explica como recolhemos, usamos, divulgamos e salvaguardamos as suas informações quando utiliza a nossa aplicação. Por favor, leia esta política de privacidade com atenção. Se não concordar com os termos desta política de privacidade, por favor, não aceda à aplicação.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">2. Recolha de Informações</h2>
          <p>
            Recolhemos informações sobre si de várias formas. As informações que podemos recolher na Aplicação incluem:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Dados Pessoais:</strong> Informações de identificação pessoal, como o seu endereço de e-mail, que nos fornece voluntariamente quando se regista na Aplicação.</li>
            <li>
              <strong>Dados de Contatos do Google:</strong> Com a sua permissão explícita (através do fluxo de autenticação OAuth2 do Google), acedemos à sua conta Google Contacts com o único propósito de criar novos contatos. A nossa aplicação não lê, modifica ou elimina contatos existentes. O uso de informações recebidas das APIs do Google seguirá a <a href="https://developers.google.com/terms/api-services-user-data-policy#limited-use-requirements" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Política de Dados do Utilizador dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado.
            </li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">3. Uso das Suas Informações</h2>
          <p>
            Ter informações precisas sobre si permite-nos fornecer-lhe uma experiência tranquila, eficiente e personalizada. Especificamente, podemos usar as informações recolhidas sobre si através da Aplicação para:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Criar e gerir a sua conta.</li>
            <li>Sincronizar os contatos gerados na nossa plataforma com a sua conta Google Contacts para facilitar o reconhecimento pelo WhatsApp, melhorando a fiabilidade do envio de mensagens.</li>
            <li>Melhorar a eficiência e a operação da Aplicação.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">4. Divulgação das Suas Informações</h2>
          <p>
            Não vendemos, trocamos ou transferimos de outra forma para terceiros as suas informações de identificação pessoal. As informações da sua conta Google são usadas exclusivamente para a funcionalidade de sincronização de contatos dentro da sua própria conta e não são partilhadas com mais ninguém.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">5. Segurança das Suas Informações</h2>
          <p>
            Usamos medidas de segurança administrativas, técnicas e físicas para ajudar a proteger as suas informações pessoais. As credenciais de acesso à sua conta Google são armazenadas de forma encriptada e usadas apenas para manter a sessão de sincronização ativa.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">6. Contato</h2>
          <p>
            Se tiver dúvidas ou comentários sobre esta Política de Privacidade, entre em contato connosco em:
            <br />
            [INSERIR SEU E-MAIL DE CONTATO]
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;