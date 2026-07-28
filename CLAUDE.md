@AGENTS.md

# giro360_admin — Portal Admin (Next.js)

## Visão geral
Portal administrativo do ecossistema Giro 360°. Consome a API do `giro360_backend`
(login, empresas, dispositivos, usuários, portas/tunnels Cloudflare). Sem UI kit —
Tailwind puro, sem lib de data-fetching (fetch direto + `useState`/`useEffect`).

## Stack
- Next.js 14.2 (App Router), React 18.3, TypeScript 5.
- Tailwind CSS (sem MUI/shadcn — classes utilitárias escritas à mão).
- `@hcaptcha/react-hcaptcha` no login (campo `captcha_token` já existe na chamada de `signin`,
  mas não está sendo usado ainda).
- Dev server roda na porta **3003** (`npm run dev` → `next dev -p 3003`).

## Estrutura
```
app/
  page.tsx                    — redirect direto para /auth
  auth/page.tsx               — login (chama api.signin, salva sessão, redireciona)
  admin/layout.tsx            — shell autenticado: sidebar (Dispositivos/Empresas/Usuários),
                                 valida sessão via getUsuario(), redireciona p/ /auth se ausente
  admin/empresas/page.tsx     — empresas + gestão de portas/tunnels (maior página, vários modais)
  admin/dispositivos/page.tsx — aprovação/bloqueio de devices
  admin/usuarios/page.tsx     — CRUD de usuários (admins por empresa)
lib/
  api.ts   — client único: interfaces (Empresa, TunnelPorta, Dispositivo, UsuarioAdmin) +
             wrapper req<T>() (fetch + header Authorization) + objeto `api.*` com um método
             por endpoint do backend
  crypt.ts — cifra XOR/offset simples (crypt('C'|'D', str)) só para mascarar credenciais
             exibidas na tela (não é mecanismo de autenticação)
components/ — vazio, tudo inline nas pages
```

## Integração com o backend
- Base URL: `NEXT_PUBLIC_API_URL` (`.env.local`), default `http://localhost:3001`.
- Sessão: JWT em `localStorage['e360_token']`, usuário em `localStorage['e360_usuario']`
  (`saveSession`/`clearSession`/`getUsuario` em `lib/api.ts`). Toda chamada autenticada manda
  `Authorization: Bearer <token>`; 401 em rota não-`/signin` limpa a sessão e redireciona a `/auth`.
- `.env.local` só tem `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_HCAPTCHA_SITEKEY`.

## Gestão de portas/tunnels — `app/admin/empresas/page.tsx`
- Estado do formulário de nova porta: `formPorta = { nome, porta_local, protocolo, principal }`
  (linha ~33), `principal` default `true`.
- Checkbox "principal" (linhas ~614-619):
  ```tsx
  <input type="checkbox" checked={formPorta.principal}
    onChange={e => setFormPorta(f => ({ ...f, principal: e.target.checked }))} />
  Marcar como backend principal da empresa
  ```
- Submit chama `api.adicionarPorta(cnpj, { nome, porta_local, protocolo, principal })` →
  `POST /empresas/:cnpj/portas` (tipagem em `lib/api.ts` linha ~165).
- Edição usa `api.editarPorta(cnpj, id, data: Partial<TunnelPorta>)` → `PUT .../portas/:id`.
- Badge "principal" na listagem de portas (linha ~471-472).

## Pendente: suporte a Petshop Web (segunda aplicação)
O `giro360_backend` já tem uma coluna `aplicacao` (`'giro_web'` | `'petshop_web'`, default
`'giro_web'`) em `tunnel_portas`/`dispositivos`/`registros_empresa` (ver `giro360_backend/CLAUDE.md`,
seção "Multi-aplicação"). Este portal ainda **não** foi atualizado para usá-la:
- `TunnelPorta` (`lib/api.ts` linha ~64) não tem o campo `aplicacao` — precisa adicionar.
- `formPorta` e o checkbox de `app/admin/empresas/page.tsx` (linhas ~33, ~614-619) precisam de
  um segundo checkbox, texto sugerido: **"Backend para aplicação PetShop web"** — grava
  `aplicacao: 'petshop_web'` no body de `adicionarPorta`/`editarPorta` (desmarcado = `'giro_web'`,
  o default atual). **Não** deve mexer no checkbox/campo `principal` existente — são conceitos
  independentes no backend, e misturá-los quebraria o fluxo do giro_web em produção.
- `Dispositivo` (`lib/api.ts` linha ~86) e a tela `app/admin/dispositivos/page.tsx` podem
  opcionalmente exibir/filtrar por `aplicacao` também (o backend já retorna esse campo em
  `GET /dispositivos`).

## Projetos relacionados
- Backend: `D:\react\giro360_backend\` (ver CLAUDE.md de lá para rotas e schema completos)
- Frontend Giro 360: `D:\react\giro_web\`
- Frontend Petshop Web (nova aplicação): `D:\react\petshop_web\`
