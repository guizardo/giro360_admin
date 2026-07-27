'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, type UsuarioAdmin, type Empresa, getUsuario } from '@/lib/api';

export default function UsuariosPage() {
  const me = getUsuario();
  const [usuarios, setUsuarios]     = useState<UsuarioAdmin[]>([]);
  const [empresas, setEmpresas]     = useState<Empresa[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [modalSenha, setModalSenha] = useState<UsuarioAdmin | null>(null);
  const [form, setForm]             = useState({ cnpj: '', nome: '', email: '', senha: '', role: 'admin' });
  const [senhaForm, setSenhaForm]   = useState({ atual: '', nova: '', conf: '' });
  const [salvando, setSalvando]     = useState(false);
  const [erro, setErro]             = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [u, e] = await Promise.all([api.getUsuarios(), api.getEmpresas()]);
      setUsuarios(u);
      setEmpresas(e);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criar() {
    setSalvando(true);
    try {
      await api.criarUsuario(form);
      setModal(false);
      carregar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro.');
    } finally {
      setSalvando(false);
    }
  }

  async function trocarSenha() {
    if (!modalSenha) return;
    if (senhaForm.nova !== senhaForm.conf) { alert('Senhas não conferem.'); return; }
    setSalvando(true);
    try {
      await api.trocarSenha(modalSenha.id, senhaForm.atual, senhaForm.nova);
      setModalSenha(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-500 mt-0.5">Administradores e gerentes de empresa</p>
        </div>
        <button
          onClick={() => { setForm({ cnpj: me?.cnpj || '', nome: '', email: '', senha: '', role: 'admin' }); setModal(true); }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Novo usuário
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">E-mail</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">CNPJ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.cnpj}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                      u.role === 'superadmin'
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                        : 'bg-blue-100 text-blue-800 border-blue-200'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => { setModalSenha(u); setSenhaForm({ atual: '', nova: '', conf: '' }); }}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                      >
                        Trocar senha
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal criar */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Novo usuário</h2>
            <div className="space-y-3">
              {me?.role === 'superadmin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                  <select
                    value={form.cnpj}
                    onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Selecione...</option>
                    {empresas.map(e => (
                      <option key={e.cnpj} value={e.cnpj}>{e.razao_social}</option>
                    ))}
                  </select>
                </div>
              )}
              {['nome', 'email'].map(campo => (
                <div key={campo}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{campo}</label>
                  <input
                    type={campo === 'email' ? 'email' : 'text'}
                    value={form[campo as 'nome' | 'email']}
                    onChange={e => setForm(f => ({ ...f, [campo]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha inicial</label>
                <input
                  type="password"
                  value={form.senha}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button
                onClick={criar}
                disabled={salvando}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {salvando ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal trocar senha */}
      {modalSenha && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Trocar senha</h2>
            <p className="text-sm text-gray-500 mb-4">{modalSenha.nome}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
                <input type="password" value={senhaForm.atual}
                  onChange={e => setSenhaForm(f => ({ ...f, atual: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                <input type="password" value={senhaForm.nova}
                  onChange={e => setSenhaForm(f => ({ ...f, nova: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
                <input type="password" value={senhaForm.conf}
                  onChange={e => setSenhaForm(f => ({ ...f, conf: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModalSenha(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button
                onClick={trocarSenha}
                disabled={salvando}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
