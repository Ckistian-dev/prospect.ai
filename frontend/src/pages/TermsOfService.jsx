import React from 'react';

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Termos de Serviço</h1>

        <div className="prose prose-lg text-gray-700 max-w-none">
          <p><strong>Última atualização:</strong> 03/12/2025</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acordo com os Termos</h2>
          <p>
            Ao aceder e usar a aplicação Prospect AI (o "Serviço"), você concorda em estar vinculado por estes Termos de Serviço ("Termos"). Se não concordar com todos estes Termos, então não poderá aceder ao Serviço.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">2. Descrição do Serviço</h2>
          <p>
            O Prospect AI é uma ferramenta para auxiliar na prospecção de clientes, permitindo a gestão de contatos, automação de mensagens via WhatsApp e sincronização de contatos com a conta Google do usuário. O uso do serviço de mensagens do WhatsApp está sujeito aos termos e políticas do próprio WhatsApp.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">3. Contas de Utilizador</h2>
          <p>
            Você é responsável por salvaguardar a sua conta e por quaisquer atividades ou ações sob a sua senha. Você concorda em não divulgar a sua senha a terceiros.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">4. Uso Aceitável</h2>
          <p>
            Você concorda em não usar o Serviço para qualquer finalidade ilegal ou não autorizada. Você não deve, no uso do Serviço, violar quaisquer leis na sua jurisdição (incluindo, mas não se limitando a, leis de direitos autorais e leis anti-spam). O envio de mensagens em massa não solicitadas (spam) através da nossa plataforma é estritamente proibido e pode resultar na suspensão imediata da sua conta.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb4">5. Sincronização com Google Contacts</h2>
          <p>
            Ao conectar a sua conta Google, você autoriza o Serviço a criar novos contatos na sua lista de Google Contacts. Esta funcionalidade destina-se a melhorar a sua experiência e a fiabilidade do serviço. Nós não acedemos, lemos, editamos ou eliminamos os seus contatos existentes.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">6. Modificações nos Termos</h2>
          <p>
            Reservamo-nos o direito, a nosso exclusivo critério, de modificar ou substituir estes Termos a qualquer momento.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">7. Contato</h2>
          <p>Se tiver alguma dúvida sobre estes Termos, entre em contato connosco em: desenvolvimento@cjssolucoes.com.</p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;