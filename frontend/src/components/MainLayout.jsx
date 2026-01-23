import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import api from '../api/axiosConfig';

const MainLayout = () => {
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await api.get('/auth/me');
        setIsSuperUser(response.data.is_superuser || response.data.is_admin);
      } catch (error) {
        console.error("Erro ao buscar dados do usuário:", error);
        localStorage.removeItem('accessToken');
        navigate('/login');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [navigate]);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-gray-100"><div className="text-lg font-medium text-gray-700">Carregando...</div></div>;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar isSuperUser={isSuperUser} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isSuperUser={isSuperUser} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
