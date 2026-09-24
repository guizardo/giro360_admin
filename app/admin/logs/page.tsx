'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, getUsuario, type Empresa, type TunnelLog, type Usuario } from '@/lib/api';

const NIVEL_LABEL: Record<string, string> = {
  security: 'Segurança',
  login: 'Login',
  todos: 'Todos',
};

const NIVEL_COR: Record<string, string> = {
  security: 'bg-red-100 text-red-800 border-red-200',
  login: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

export default function LogsPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [logs, setLogs] = useState<TunnelLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const [cnpj, setCnpj] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [level, setLevel] = useState('login');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const resp = await api.getTunnelLogs({ cnpj: cnpj || undefined, data_inicio: dataInicio || undefined, data_fim: dataFim || undefined, level, page, page_size: pageSize });
      setLogs(resp.logs);
      setTotal(resp.total);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }, [cnpj, dataInicio, dataFim, level, page]);

  useEffect(() => {
    const u = getUsuario();
    setUsuario(u);
    if (u?.role === 'superadmin') api.getEmpresas().then(setEmpresas).catch(() => {});
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function aplicarFiltro(fn: () => void) {
    fn();
    setPage(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Logs de Acesso</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Login de usuários e tentativas de segurança por empresa/dispositivo — {total} registro{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-end gap-3">
        {usuario?.role === 'superadmin' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Empresa</label>
            <select value={cnpj} onChange={e => aplicarFiltro(() => setCnpj(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Todas as empresas</option>
              {empresas.map(e => <option key={e.cnpj} value={e.cnpj}>{e.razao_social} — {e.cnpj}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">De</label>
          <input type="date" value={dataInicio} onChange={e => aplicarFiltro(() => setDataInicio(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Até</label>
          <input type="date" value={dataFim} onChange={e => aplicarFiltro(() => setDataFim(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nível</label>
          <select value={level} onChange={e => aplicarFiltro(() => setLevel(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="login">Login (usuários no giro_web/petshop_web/portal)</option>
            <option value="security">Segurança (tentativas suspeitas)</option>
            <option value="todos">Todos os níveis</option>
          </select>
        </div>
        {(cnpj || dataInicio || dataFim || level !== 'login') && (
          <button onClick={() => aplicarFiltro(() => { setCnpj(''); setDataInicio(''); setDataFim(''); setLevel('login'); })}
            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 underline">
            Limpar filtros
          </button>
        )}
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Data/Hora</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dispositivo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nível</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Nenhum log encontrado para os filtros selecionados.</td></tr>
              )}
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(l.ts).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900">{l.razao_social || '—'}</div>
                    <div className="text-xs text-gray-400">{l.cnpj}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono" title={l.machine_id}>
                    {l.machine_id ? `…${l.machine_id.slice(-12)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${NIVEL_COR[l.level] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {NIVEL_LABEL[l.level] || l.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Paginação */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm">
            <span className="text-gray-500">Página {page} de {totalPaginas}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                ← Anterior
              </button>
              <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={page >= totalPaginas}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Próxima →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
