import React, { useState } from 'react';
import api from '../api/axiosConfig';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

function Login({ setIsAuthenticated }) {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/auth/token', new URLSearchParams({
        username: formData.email,
        password: formData.password
      }));
      
      // A MUDANÇA PRINCIPAL ESTÁ AQUI:
      // Além do token, agora salvamos também o email do usuário.
      localStorage.setItem('accessToken', response.data.access_token);
      localStorage.setItem('userEmail', formData.email); // <-- ESTA É A LINHA ADICIONADA

      setIsAuthenticated(true);

      const redirectPath = location.state?.from?.pathname || '/dashboard';
      navigate(redirectPath);

    } catch (err) {
      setError('Email ou senha inválidos. Tente novamente.');
      console.error('Erro de login:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // O restante do seu código JSX permanece exatamente o mesmo
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 max-w-5xl w-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        
        {/* Painel Esquerdo (Visual) */}
        <div className="hidden lg:flex flex-col items-center justify-center p-12 bg-brand-green text-white relative overflow-hidden">
          <div className="absolute -top-16 -left-16 w-48 h-48 bg-white/10 rounded-full mix-blend-overlay animate-pulse"></div>
          <div className="absolute -bottom-24 -right-10 w-64 h-64 bg-white/10 rounded-full mix-blend-overlay animate-pulse delay-500"></div>
          
          <div className="w-24 h-24 bg-brand-green-light/20 rounded-2xl flex items-center justify-center mb-6">
              <span className="text-5xl font-bold text-white">P</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">ProspectAI</h1>
          <p className="text-center text-white/80">Acesse sua conta para iniciar a prospecção de novos clientes.</p>
        </div>

        {/* Painel Direito (Formulário) */}
        <div className="p-8 md:p-12 flex flex-col justify-center">
            <div className="bg-white p-8 rounded-2xl w-full">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-brand-green">Bem-vindo de volta!</h2>
                    <p className="text-gray-500 mt-2">Faça o login para continuar.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {/* Campo de Email */}
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="email"
                            name="email"
                            placeholder="Seu e-mail"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="w-full pl-10 pr-4 py-3 bg-gray-100 border-2 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green-light focus:border-transparent transition-all"
                        />
                    </div>
                    {/* Campo de Senha */}
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            placeholder="Sua senha"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            className="w-full pl-10 pr-10 py-3 bg-gray-100 border-2 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green-light focus:border-transparent transition-all"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-green">
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>

                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-green-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all duration-300 shadow-lg hover:shadow-xl disabled:bg-gray-400 flex items-center justify-center"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : 'Entrar'}
                    </button>
                </form>
                
                <div className="text-center mt-12">
                    <p className="text-sm text-gray-500">
                        Desenvolvido por <a href="https://ckistian-programando-solucoes.vercel.app" target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-800 hover:underline">Ckistian Programando Soluções</a>
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

export default Login;

