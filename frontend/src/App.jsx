import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Prospects from './pages/Prospects';
import Configs from './pages/Configs';
import Whatsapp from './pages/Whatsapp';
import MainProspecting from './pages/MainProspecting'; 
import PrivacyPolicy from './pages/PrivacyPolicy'; 
import TermsOfService from './pages/TermsOfService';
import LandingPage from './pages/LandingPage'; // <--- IMPORTANTE: Importar a LandingPage

import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('accessToken'));

  return (
    <Routes>
      {/* --- ROTA PÚBLICA PRINCIPAL (HOMEPAGE) --- */}
      {/* Agora o Google vai ver a Landing Page com os links no rodapé ao acessar a raiz */}
      <Route path="/" element={<LandingPage />} />

      {/* Outras Rotas Públicas */}
      <Route path="/login" element={<Login setIsAuthenticated={setIsAuthenticated} />} />
      <Route path="/politicies" element={<PrivacyPolicy />} />
      <Route path="/services-terms" element={<TermsOfService />} />

      {/* --- ROTAS PROTEGIDAS (SISTEMA INTERNO) --- */}
      {/* Mudei o path pai para "/app" ou mantive protegido, mas a raiz "/" agora é livre */}
      <Route path="/app" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="prospects" element={<Prospects />} />
        <Route path="configs" element={<Configs />} />
        <Route path="whatsapp" element={<Whatsapp />} />
        <Route path="prospecting" element={<MainProspecting />} />
        
        {/* Se alguém entrar em /app sem nada, vai pro dashboard */}
        <Route index element={<Navigate to="/app/dashboard" />} />
      </Route>

      {/* Redirecionamentos Inteligentes */}
      {/* Se tentar acessar /dashboard direto (link antigo), redireciona para a nova estrutura /app/dashboard se estiver logado */}
      <Route path="/dashboard" element={<Navigate to={isAuthenticated ? "/app/dashboard" : "/login"} />} />

      {/* Catch-all: Qualquer rota desconhecida vai para a Home ou Login */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;