'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { clearSession, getUsuario, type Usuario } from '@/lib/api';

const NAV = [
  { href: '/admin/dispositivos', label: 'Dispositivos',  icon: '💻' },
  { href: '/admin/empresas',     label: 'Empresas',      icon: '🏢' },
  { href: '/admin/usuarios',     label: 'Usuários',      icon: '👤' },
  { href: '/admin/limpeza',      label: 'Limpeza CF',    icon: '🧹', superadminOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    const u = getUsuario();
    if (!u) { router.replace('/auth'); return; }
    setUsuario(u);
  }, [router]);

  function sair() {
    clearSession();
    router.replace('/auth');
  }

  if (!usuario) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-indigo-900 text-white flex flex-col shrink-0">
        <div className="px-5 py-6 border-b border-indigo-800">
          <div className="text-xl font-bold">Estoque 360</div>
          <div className="text-xs text-indigo-300 mt-0.5">Admin Portal</div>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-3">
          {NAV.filter(item => !item.superadminOnly || usuario.role === 'superadmin').map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-700 text-white'
                    : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-indigo-800">
          <div className="text-xs text-indigo-300 truncate mb-1">{usuario.nome}</div>
          <div className="text-xs text-indigo-400 truncate mb-3">{usuario.email}</div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            usuario.role === 'superadmin'
              ? 'bg-yellow-500 text-yellow-900'
              : 'bg-indigo-600 text-indigo-100'
          }`}>
            {usuario.role}
          </span>
          <button
            onClick={sair}
            className="mt-3 w-full text-xs text-indigo-300 hover:text-white transition-colors text-left"
          >
            Sair →
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
