import React, { useState } from 'react';
// A importação do 'BrowserRouter' foi REMOVIDA daqui
import { Routes, Route, Navigate } from 'react-router-dom';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Prospects from './pages/Prospects';
import Configs from './pages/Configs';
import Whatsapp from './pages/Whatsapp';
import MainProspecting from './pages/MainProspecting'; 

import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('accessToken'));

  // O componente agora retorna diretamente o <Routes>, sem o <Router> ao redor
  return (
    <Routes>
      <Route path="/login" element={<Login setIsAuthenticated={setIsAuthenticated} />} />
      
      <Route path="/" element={ <ProtectedRoute> <MainLayout /> </ProtectedRoute> }>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="prospects" element={<Prospects />} />
        <Route path="configs" element={<Configs />} />
        <Route path="whatsapp" element={<Whatsapp />} />
        <Route path="prospecting" element={<MainProspecting />} />
        <Route index element={<Navigate to="/dashboard" />} />
      </Route>
      
      {/* Rota genérica para redirecionar qualquer outra coisa para o login */}
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;

