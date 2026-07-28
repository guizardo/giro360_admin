'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, getUsuario, type Dispositivo, type Empresa } from '@/lib/api';

const STATUS_CORES: Record<string, string> = {
  pendente:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  aprovado:  'bg-green-100  text-green-800  border-green-200',
  bloqueado: 'bg-red-100    text-red-800    border-red-200',
};

export default function DispositivosPage() {
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [empresas, setEmpresas]         = useState<Empresa[]>([]);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroCnpj, setFiltroCnpj]     = useState('');
  const [filtroAplicacao, setFiltroAplicacao] = useState('');
  const [loading, setLoading]           = useState(true);
  const [erro, setErro]                 = useState('');
  const [editandoNome, setEditandoNome] = useState<{ id: number; nome: string } | null>(null);

  const usuario     = getUsuario();
  const isSuperAdmin = usuario?.role === 'superadmin';

  // Carrega lista de empresas para o select (só superadmin vê o filtro)
  useEffect(() => {
    if (!isSuperAdmin) return;
    api.getEmpresas().then(setEmpresas).catch(() => {});
  }, [isSuperAdmin]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: { cnpj?: string; status?: string; aplicacao?: string } = {};
      if (filtroCnpj)      params.cnpj      = filtroCnpj;
      if (filtroStatus)    params.status    = filtroStatus;
      if (filtroAplicacao) params.aplicacao = filtroAplicacao;
      setDispositivos(await api.getDispositivos(params));
      setErro('');
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [filtroCnpj, filtroStatus, filtroAplicacao]);

  useEffect(() => { carregar(); }, [carregar]);

  async function mudarStatus(id: number, status: string, nome?: string) {
    try {
      await api.atualizarDispositivo(id, { status, ...(nome ? { nome } : {}) });
      carregar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro.');
    }
  }

  async function remover(id: number) {
    if (!confirm('Remover dispositivo?')) return;
    try {
      await api.removerDispositivo(id);
      carregar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro.');
    }
  }

  const pendentes = dispositivos.filter(d => d.status === 'pendente').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dispositivos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os equipamentos registrados</p>
        </div>
        {pendentes > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-lg font-medium">
            ⚠️ {pendentes} pendente{pendentes > 1 ? 's' : ''} aguardando aprovação
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {/* Filtro CNPJ — só superadmin */}
        {isSuperAdmin && (
          <select
            value={filtroCnpj}
            onChange={e => setFiltroCnpj(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Todas as empresas</option>
            {empresas.map(e => (
              <option key={e.cnpj} value={e.cnpj}>
                {e.razao_social} — {e.cnpj}
              </option>
            ))}
          </select>
        )}

        {/* Filtro aplicação */}
        <select
          value={filtroAplicacao}
          onChange={e => setFiltroAplicacao(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todas as aplicações</option>
          <option value="giro_web">Giro Web</option>
          <option value="petshop_web">PetShop Web</option>
        </select>

        {/* Filtro status */}
        {['', 'pendente', 'aprovado', 'bloqueado'].map(s => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtroStatus === s
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s === '' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button
          onClick={carregar}
          className="ml-auto px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ↺ Atualizar
        </button>
      </div>

      {/* Erro */}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {erro}
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : dispositivos.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Nenhum dispositivo encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Device ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">IP</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dispositivos.map(d => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 truncate max-w-[160px]">{d.razao_social}</span>
                      {d.aplicacao === 'petshop_web' && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">petshop web</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{d.cnpj}</div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                      {d.device_id.slice(0, 12)}…
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    {editandoNome?.id === d.id ? (
                      <div className="flex gap-1">
                        <input
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          value={editandoNome.nome}
                          onChange={e => setEditandoNome({ id: d.id, nome: e.target.value })}
                        />
                        <button
                          className="text-xs bg-indigo-600 text-white px-2 py-1 rounded"
                          onClick={() => {
                            mudarStatus(d.id, d.status, editandoNome.nome);
                            setEditandoNome(null);
                          }}
                        >✓</button>
                        <button
                          className="text-xs text-gray-400 px-1"
                          onClick={() => setEditandoNome(null)}
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditandoNome({ id: d.id, nome: d.nome || '' })}
                        className="text-gray-600 hover:text-indigo-600 truncate max-w-[120px]"
                      >
                        {d.nome || <span className="text-gray-300 italic">sem nome</span>}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{d.ip_registro}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_CORES[d.status]}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(d.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {d.status !== 'aprovado' && (
                        <button
                          onClick={() => mudarStatus(d.id, 'aprovado')}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors font-medium"
                        >
                          Aprovar
                        </button>
                      )}
                      {d.status !== 'bloqueado' && (
                        <button
                          onClick={() => mudarStatus(d.id, 'bloqueado')}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors font-medium"
                        >
                          Bloquear
                        </button>
                      )}
                      {d.status === 'bloqueado' && (
                        <button
                          onClick={() => remover(d.id)}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
