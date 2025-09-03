import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Componente de Ordem Superior (HOC) para proteger rotas.
 * Verifica se um token de acesso existe no localStorage.
 * Se o token existir, renderiza o componente filho (a página solicitada).
 * Se não, redireciona o usuário para a página de login.
 */
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('accessToken');

  if (!token) {
    // Usuário não autenticado, redireciona para a página de login
    return <Navigate to="/login" replace />;
  }

  // Usuário autenticado, renderiza a página solicitada
  return children;
};

export default ProtectedRoute;
