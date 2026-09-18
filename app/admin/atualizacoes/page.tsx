'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, getUsuario, type PortaAdmin, type Release, type Usuario, type ResultadoAgendamentoLote } from '@/lib/api';

const PRODUTO_LABEL: Record<string, string> = {
  mvc_logidoc: 'MVC_LOGIDOC',
  petshop_api: 'PetShop_API',
  logidoc_api_rest: 'LogiDoc_API_REST',
};

const APLICACAO_LABEL: Record<string, string> = {
  giro_web: 'Giro Web',
  petshop_web: 'PetShop Web',
};

function tempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export default function AtualizacoesPage() {
  const [usuario, setUsuario]     = useState<Usuario | null>(null);
  const [portas, setPortas]       = useState<PortaAdmin[]>([]);
  const [releases, setReleases]   = useState<Release[]>([]);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState('');

  // Filtros
  const [busca, setBusca]                 = useState('');
  const [filtroAplicacao, setFiltroAplicacao] = useState('');
  const [filtroProduto, setFiltroProduto]     = useState('');
  const [filtroVersao, setFiltroVersao]       = useState('');

  // Seleção (mantida entre trocas de filtro)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  // Modal de agendamento em lote
  const [modal, setModal]         = useState<null | 'agendar-lote'>(null);
  const [formLote, setFormLote]   = useState({ versaoAlvo: '', janelaInicio: '02:00', janelaFim: '04:00', tamanhoLote: 10 });
  const [agendando, setAgendando] = useState(false);
  const [resultadoLote, setResultadoLote] = useState<ResultadoAgendamentoLote[] | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [portasData, releasesData] = await Promise.all([api.getTodasPortas(), api.getReleases()]);
      setPortas(portasData);
      setReleases(releasesData);
      setErro('');
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setUsuario(getUsuario()); carregar(); }, [carregar]);

  const versoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    portas.forEach(p => { if (p.versao_atual) set.add(p.versao_atual); });
    return Array.from(set).sort();
  }, [portas]);

  const filtradas = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return portas.filter(p => {
      if (filtroAplicacao && p.aplicacao !== filtroAplicacao) return false;
      if (filtroProduto && p.produto !== filtroProduto) return false;
      if (filtroVersao && p.versao_atual !== filtroVersao) return false;
      if (buscaLower && !`${p.razao_social} ${p.cnpj}`.toLowerCase().includes(buscaLower)) return false;
      return true;
    });
  }, [portas, busca, filtroAplicacao, filtroProduto, filtroVersao]);

  const selecionadasPortas = useMemo(() => portas.filter(p => selecionados.has(p.id)), [portas, selecionados]);
  const produtosSelecionados = useMemo(() => new Set(selecionadasPortas.map(p => p.produto)), [selecionadasPortas]);
  const produtoComum = produtosSelecionados.size === 1 ? [...produtosSelecionados][0] : null;
  const releasesDoProduto = releases.filter(r => r.produto === produtoComum);

  const todasVisiveisSelecionadas = filtradas.length > 0 && filtradas.every(p => selecionados.has(p.id));

  function toggleSelecionado(id: number) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleTodosVisiveis() {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (todasVisiveisSelecionadas) {
        filtradas.forEach(p => next.delete(p.id));
      } else {
        filtradas.forEach(p => next.add(p.id));
      }
      return next;
    });
  }

  function limparSelecao() {
    setSelecionados(new Set());
  }

  function abrirAgendarLote() {
    setFormLote({ versaoAlvo: '', janelaInicio: '02:00', janelaFim: '04:00', tamanhoLote: 10 });
    setResultadoLote(null);
    setModal('agendar-lote');
  }

  async function confirmarAgendarLote() {
    if (!formLote.versaoAlvo || selecionados.size === 0) return;
    setAgendando(true);
    try {
      const resp = await api.agendarAtualizacaoLote({
        porta_ids: [...selecionados],
        versao_alvo: formLote.versaoAlvo,
        atualizacao_janela_inicio: formLote.janelaInicio,
        atualizacao_janela_fim: formLote.janelaFim,
        tamanho_lote: formLote.tamanhoLote,
      });
      setResultadoLote(resp.resultados);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao agendar.');
    } finally {
      setAgendando(false);
    }
  }

  function fecharModalLote() {
    setModal(null);
    setResultadoLote(null);
    limparSelecao();
    carregar();
  }

  const numLotes = Math.max(1, Math.ceil(selecionados.size / Math.max(1, formLote.tamanhoLote)));
  const sucessos = resultadoLote?.filter(r => r.ok).length ?? 0;
  const falhas   = resultadoLote?.filter(r => !r.ok) ?? [];

  if (usuario && usuario.role !== 'superadmin') {
    return <div className="p-6 text-sm text-gray-500">Acesso restrito a superadmin.</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Atualizações em massa</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtradas.length} de {portas.length} cliente{portas.length !== 1 ? 's' : ''} exibido{filtradas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={carregar} disabled={loading}
          className="px-3 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
          {loading ? '...' : '↺ Atualizar'}
        </button>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou CNPJ..."
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500" />

        <select value={filtroAplicacao} onChange={e => setFiltroAplicacao(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">Todas as aplicações</option>
          <option value="giro_web">Giro Web</option>
          <option value="petshop_web">PetShop Web</option>
        </select>

        <select value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">Todos os tipos de API</option>
          <option value="mvc_logidoc">MVC_LOGIDOC</option>
          <option value="petshop_api">PetShop_API</option>
          <option value="logidoc_api_rest">LogiDoc_API_REST</option>
        </select>

        <select value={filtroVersao} onChange={e => setFiltroVersao(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">Todas as versões instaladas</option>
          {versoesDisponiveis.map(v => <option key={v} value={v}>v{v}</option>)}
        </select>
      </div>

      {/* Barra de seleção / ação em lote */}
      {selecionados.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
          <span className="text-sm font-medium text-indigo-800">{selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}</span>
          {produtoComum ? (
            <button onClick={abrirAgendarLote}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors">
              📅 Agendar atualização em massa
            </button>
          ) : (
            <span className="text-xs text-amber-700">Selecione clientes de um único tipo de API por vez para agendar em lote.</span>
          )}
          <button onClick={limparSelecao} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700">Limpar seleção</button>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Nenhum cliente encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={todasVisiveisSelecionadas} onChange={toggleTodosVisiveis} className="rounded border-gray-300" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">CNPJ / Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Aplicação</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo de API</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tunnel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Versão instalada</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agendamento atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggleSelecionado(p.id)} className="rounded border-gray-300" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 truncate max-w-[200px]">{p.razao_social}</span>
                      {!p.empresa_ativa && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">inativa</span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-gray-400">{p.cnpj}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                      {APLICACAO_LABEL[p.aplicacao || ''] || p.aplicacao || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">
                      {PRODUTO_LABEL[p.produto || ''] || p.produto || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.cf_tunnel_id ? (
                      <code className="text-xs text-indigo-600 truncate block max-w-[220px]" title={p.backend_url || ''}>{p.backend_url}</code>
                    ) : (
                      <span className="text-xs text-gray-300 italic">não configurado</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.versao_atual ? (
                      <span className="inline-flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                        📦 v{p.versao_atual}
                        {p.versao_reportada_em && <span className="text-sky-400">· {tempoRelativo(p.versao_reportada_em)}</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.versao_alvo && p.versao_alvo !== p.versao_atual ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${
                        (p.atualizacao_tentativas_falhas || 0) >= 3
                          ? 'text-red-700 bg-red-50 border-red-200'
                          : 'text-violet-700 bg-violet-50 border-violet-200'
                      }`}>
                        📅 alvo v{p.versao_alvo} · {(p.atualizacao_janela_inicio || '').slice(0, 5)}–{(p.atualizacao_janela_fim || '').slice(0, 5)}
                        {(p.atualizacao_tentativas_falhas || 0) > 0 && (
                          <span> · {p.atualizacao_tentativas_falhas} falha{p.atualizacao_tentativas_falhas !== 1 ? 's' : ''}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 italic">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal Agendar em massa ─────────────────────────────── */}
      {modal === 'agendar-lote' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Agendar atualização em massa</h2>
            <p className="text-sm text-gray-500 mb-4">
              {selecionados.size} cliente{selecionados.size !== 1 ? 's' : ''} · {PRODUTO_LABEL[produtoComum || ''] || produtoComum}
            </p>

            {!resultadoLote ? (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5 rounded-lg mb-4">
                  Sem checagem de requisição em andamento — a troca acontece assim que o horário chegar,
                  sem esperar nenhuma operação terminar. Escolha uma janela em que os clientes normalmente não usam o sistema.
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Versão alvo</label>
                    <select value={formLote.versaoAlvo} onChange={e => setFormLote(f => ({ ...f, versaoAlvo: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Selecione uma versão...</option>
                      {releasesDoProduto.map(r => (
                        <option key={r.id} value={r.versao}>v{r.versao}{r.changelog ? ` — ${r.changelog.slice(0, 40)}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Janela — início</label>
                      <input type="time" value={formLote.janelaInicio}
                        onChange={e => setFormLote(f => ({ ...f, janelaInicio: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Janela — fim</label>
                      <input type="time" value={formLote.janelaFim}
                        onChange={e => setFormLote(f => ({ ...f, janelaFim: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tamanho do lote</label>
                    <input type="number" min={1} value={formLote.tamanhoLote}
                      onChange={e => setFormLote(f => ({ ...f, tamanhoLote: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <p className="text-xs text-gray-400 mt-1">
                      Os {selecionados.size} clientes serão divididos em {numLotes} grupo{numLotes !== 1 ? 's' : ''} de até {formLote.tamanhoLote},
                      cada grupo recebendo uma fatia diferente da janela acima — para não concentrar todos os downloads/atualizações no mesmo horário.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
                  <button onClick={confirmarAgendarLote} disabled={agendando || !formLote.versaoAlvo}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                    {agendando ? 'Agendando...' : 'Confirmar agendamento'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2.5 rounded-lg mb-3">
                  {sucessos} de {resultadoLote.length} agendado{sucessos !== 1 ? 's' : ''} com sucesso.
                </div>
                {falhas.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto mb-3">
                    {falhas.map(f => {
                      const porta = portas.find(p => p.id === f.porta_id);
                      return (
                        <p key={f.porta_id} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                          {porta?.razao_social || `porta ${f.porta_id}`} — {f.erro}
                        </p>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end mt-5">
                  <button onClick={fecharModalLote} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
                    Fechar e atualizar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
