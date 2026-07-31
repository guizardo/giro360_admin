'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, type CfTunnel } from '@/lib/api';

export default function LimpezaCfPage() {
  const [tunnels, setTunnels] = useState<CfTunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState('');
  const [busca, setBusca]     = useState('');
  const [soOrfaos, setSoOrfaos] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<CfTunnel | null>(null);
  const [confirmTexto, setConfirmTexto] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setTunnels(await api.getCfTunnels()); setErro(''); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = tunnels.filter(t => {
    if (soOrfaos && !t.orfao) return false;
    const alvo = `${t.nome} ${t.cnpj ?? ''} ${t.razao_social ?? ''} ${t.id}`.toLowerCase();
    return alvo.includes(busca.toLowerCase());
  });
  const totalOrfaos = tunnels.filter(t => t.orfao).length;

  function abrirConfirmacao(t: CfTunnel) {
    setConfirmTexto('');
    setConfirmar(t);
  }

  async function excluir() {
    if (!confirmar) return;
    setExcluindo(confirmar.id);
    try {
      await api.deletarCfTunnel(confirmar.id);
      setConfirmar(null);
      await carregar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir.');
    } finally {
      setExcluindo(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Limpeza de Tunnels — Cloudflare</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tunnels.length} tunnel{tunnels.length !== 1 ? 's' : ''} na conta ·{' '}
            <span className={totalOrfaos > 0 ? 'text-amber-600 font-medium' : ''}>
              {totalOrfaos} órfão{totalOrfaos !== 1 ? 's' : ''}
            </span>
          </p>
        </div>
        <button onClick={carregar} disabled={loading}
          className="px-3 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
          {loading ? '...' : '↺ Atualizar'}
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 rounded-lg mb-4">
        <strong>Órfão</strong> = tunnel existe na Cloudflare mas não está vinculado a nenhuma porta/empresa no banco
        (geralmente sobra de uma empresa apagada ou editada fora do fluxo normal). Excluir um tunnel <strong>não órfão</strong>
        derruba o acesso da empresa até que ela reconfigure — confirme com cuidado.
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>}

      <div className="flex items-center gap-3 mb-4">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, CNPJ, razão social ou ID do tunnel..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={soOrfaos} onChange={e => setSoOrfaos(e.target.checked)}
            className="rounded border-gray-300" />
          Só órfãos
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Nenhum tunnel encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tunnel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(t => (
                <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${t.orfao ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{t.nome}</div>
                    <div className="font-mono text-xs text-gray-400">{t.id}</div>
                    <div className="text-xs text-gray-400">criado em {new Date(t.criado_em).toLocaleDateString('pt-BR')}</div>
                  </td>
                  <td className="px-4 py-3">
                    {t.orfao ? (
                      t.conexoes > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full" title="Sem empresa vinculada no banco, mas com conexão ativa agora — algum cliente ainda usa este tunnel. Investigue antes de excluir.">
                          ⚠ órfão com conexão ativa — investigar antes de excluir
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          ⚠ órfão — sem empresa vinculada
                        </span>
                      )
                    ) : (
                      <>
                        <div className="text-gray-900">{t.razao_social}</div>
                        <div className="font-mono text-xs text-gray-400">{t.cnpj}</div>
                        {t.portas && <div className="text-xs text-gray-400 truncate max-w-[220px]">{t.portas.join(', ')}</div>}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
                      {t.status} {t.conexoes > 0 && <span className="text-gray-400">· {t.conexoes} conexão{t.conexoes !== 1 ? 'ões' : ''}</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => abrirConfirmacao(t)} disabled={excluindo === t.id}
                      className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors disabled:opacity-50">
                      {excluindo === t.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal confirmação */}
      {confirmar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Excluir tunnel na Cloudflare</h2>
            <p className="text-sm text-gray-500 mb-4">
              Isso remove o CNAME, as conexões e o tunnel <code className="bg-gray-100 px-1 rounded">{confirmar.nome}</code> da
              Cloudflare permanentemente.
              {!confirmar.orfao && (
                <span className="block mt-2 text-red-600 font-medium">
                  Este tunnel está vinculado a {confirmar.razao_social} ({confirmar.cnpj}) — a empresa perderá acesso remoto.
                </span>
              )}
              {confirmar.orfao && confirmar.conexoes > 0 && (
                <span className="block mt-2 text-red-600 font-medium">
                  Este tunnel não está vinculado a nenhuma empresa no banco, mas tem {confirmar.conexoes} conexão{confirmar.conexoes !== 1 ? 'ões' : ''} ativa{confirmar.conexoes !== 1 ? 's' : ''} agora — algum cliente ainda está usando. Confirme que não é engano antes de excluir.
                </span>
              )}
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Digite <code className="bg-gray-100 px-1 rounded">{confirmar.nome}</code> para confirmar:
            </label>
            <input value={confirmTexto} onChange={e => setConfirmTexto(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500" />
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirmar(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={excluir} disabled={confirmTexto !== confirmar.nome || excluindo === confirmar.id}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {excluindo === confirmar.id ? 'Excluindo...' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
