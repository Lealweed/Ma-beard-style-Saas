import { type Key, useEffect, useMemo, useState } from 'react';
import { Clock3, Package, Scissors, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ServicesView = 'services' | 'packages';

type ServiceItem = {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
  category?: string;
  image_url?: string | null;
  active?: boolean;
};

const formatCurrency = (value: number) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

const ServiceThumbnail = ({ service }: { service: ServiceItem }) => {
  const isPackage = service.category === 'Pacote';

  if (service.image_url) {
    return <img src={service.image_url} alt={service.name} className="h-14 w-14 rounded-2xl object-cover shadow-sm" />;
  }

  return (
    <div
      className={cn(
        'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border shadow-sm',
        isPackage
          ? 'border-violet-200 bg-violet-100 text-violet-700'
          : 'border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 text-violet-700'
      )}
    >
      {isPackage ? <Package className="h-6 w-6" /> : <Scissors className="h-6 w-6" />}
    </div>
  );
};

const ServiceCard = ({ service }: { key?: Key; service: ServiceItem }) => {
  const isPackage = service.category === 'Pacote';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_16px_40px_rgba(109,40,217,0.08)]"
    >
      <div className="flex items-start gap-4">
        <ServiceThumbnail service={service} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold leading-5 text-slate-900">{service.name}</h3>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                <Clock3 className="h-3.5 w-3.5 text-violet-500" />
                {service.duration_minutes} min. - {formatCurrency(service.price)}
              </p>
              {isPackage && (
                <p className="mt-2 text-xs font-medium text-violet-600">Categoria: Pacote</p>
              )}
            </div>
            {isPackage && (
              <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                Pacote
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const ServicesPage = () => {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [query, setQuery] = useState('');
  const [activeView, setActiveView] = useState<ServicesView>('services');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchServices = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/public/services');
      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(String((data as any)?.error || 'Não foi possível carregar os serviços agora.'));
      }

      setServices(Array.isArray(data) ? data : []);
    } catch (fetchError: any) {
      setServices([]);
      setError(fetchError?.message || 'Não foi possível carregar os serviços agora.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchServices();
  }, []);

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return services.filter((service) => {
      const matchesTab = activeView === 'services'
        ? service.category !== 'Pacote'
        : service.category === 'Pacote';

      if (!matchesTab) return false;
      if (!normalizedQuery) return true;

      const searchable = `${service.name} ${service.category || 'Serviços'}`.toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [activeView, query, services]);

  const packagesCount = services.filter((service) => service.category === 'Pacote').length;
  const servicesCount = services.length - packagesCount;

  return (
    <div className="min-h-screen bg-[#f6f2ff] pb-28 pt-24 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="rounded-[32px] bg-gradient-to-br from-violet-600 via-violet-500 to-fuchsia-500 px-6 pb-8 pt-6 text-white shadow-[0_20px_60px_rgba(124,58,237,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-100/90">Catálogo mobile</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Serviços</h1>
                <p className="mt-2 max-w-[220px] text-sm text-violet-100/90">
                  Consulte os serviços e pacotes no mesmo padrão visual da experiência mobile.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/20 bg-white/15 px-4 py-3 text-right backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-violet-100/80">Itens</p>
                <p className="mt-1 text-2xl font-semibold">{services.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_14px_36px_rgba(109,40,217,0.08)]">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Buscar serviço
            </label>
            <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-[#faf8ff] px-4 py-3">
              <Search className="h-4 w-4 text-violet-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome ou categoria"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="space-y-3 pb-4">
            {loading && (
              <div className="rounded-[28px] border border-violet-100 bg-white/80 px-5 py-10 text-center shadow-[0_10px_24px_rgba(109,40,217,0.05)]">
                <p className="text-sm font-medium text-slate-700">Carregando serviços do catálogo...</p>
              </div>
            )}

            {!loading && error && (
              <div className="rounded-[28px] border border-rose-200 bg-white px-5 py-10 text-center shadow-[0_10px_24px_rgba(109,40,217,0.05)]">
                <p className="text-sm font-medium text-slate-700">{error}</p>
                <button
                  onClick={() => void fetchServices()}
                  className="mt-4 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {!loading && !error && filteredServices.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}

            {!loading && !error && services.length === 0 && (
              <div className="rounded-[28px] border border-dashed border-violet-200 bg-white/80 px-5 py-10 text-center shadow-[0_10px_24px_rgba(109,40,217,0.05)]">
                <p className="text-sm font-medium text-slate-700">Nenhum serviço ativo disponível.</p>
                <p className="mt-2 text-sm text-slate-500">Publique serviços ativos no catálogo para exibir nesta página.</p>
              </div>
            )}

            {!loading && !error && services.length > 0 && filteredServices.length === 0 && (
              <div className="rounded-[28px] border border-dashed border-violet-200 bg-white/80 px-5 py-10 text-center shadow-[0_10px_24px_rgba(109,40,217,0.05)]">
                <p className="text-sm font-medium text-slate-700">Nenhum resultado encontrado.</p>
                <p className="mt-2 text-sm text-slate-500">Tente buscar pelo nome do serviço ou pela categoria Pacote.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-5">
        <div className="mx-auto flex w-full max-w-md rounded-[30px] border border-violet-100 bg-white/95 p-2 shadow-[0_18px_60px_rgba(109,40,217,0.18)] backdrop-blur">
          <button
            onClick={() => setActiveView('services')}
            className={cn(
              'flex-1 rounded-[22px] px-4 py-3 text-sm font-semibold transition-colors',
              activeView === 'services' ? 'bg-violet-600 text-white' : 'text-slate-500'
            )}
          >
            Serviços
            <span className={cn('ml-2 rounded-full px-2 py-0.5 text-[11px]', activeView === 'services' ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700')}>
              {servicesCount}
            </span>
          </button>
          <button
            onClick={() => setActiveView('packages')}
            className={cn(
              'flex-1 rounded-[22px] px-4 py-3 text-sm font-semibold transition-colors',
              activeView === 'packages' ? 'bg-violet-600 text-white' : 'text-slate-500'
            )}
          >
            Pacotes
            <span className={cn('ml-2 rounded-full px-2 py-0.5 text-[11px]', activeView === 'packages' ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700')}>
              {packagesCount}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};