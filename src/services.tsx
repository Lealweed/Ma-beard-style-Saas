import { type Key, useMemo, useState } from 'react';
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
  duration: number;
  priceLabel: string;
  priceValue: number;
  category?: 'Pacote';
  image?: string;
};

const SERVICES_CATALOG: ServiceItem[] = [
  { id: 1, name: 'Barboterapia', duration: 30, priceLabel: 'R$ 40,00', priceValue: 40 },
  { id: 2, name: 'Botox', duration: 80, priceLabel: 'R$ 100,00', priceValue: 100 },
  { id: 3, name: 'Cabelo', duration: 60, priceLabel: 'R$ 40,00', priceValue: 40 },
  { id: 4, name: 'Cabelo e barbotetapia', duration: 60, priceLabel: 'R$ 80,00', priceValue: 80, category: 'Pacote' },
  { id: 5, name: 'Cabelo e sobrancelha', duration: 35, priceLabel: 'R$ 50,00', priceValue: 50, category: 'Pacote' },
  { id: 6, name: 'Cabelo, barboterapia e sobrancelha', duration: 75, priceLabel: 'R$ 90,00', priceValue: 90, category: 'Pacote' },
  { id: 7, name: 'Cone hindu', duration: 20, priceLabel: 'R$ 25,00', priceValue: 25 },
  { id: 8, name: 'Corte', duration: 30, priceLabel: 'R$ 40,00', priceValue: 40 },
  { id: 9, name: 'Depilação de nariz com cera', duration: 5, priceLabel: 'R$ 15,00', priceValue: 15 },
  { id: 10, name: 'Hidratação capilar', duration: 20, priceLabel: 'R$ 20,00', priceValue: 20 },
  { id: 11, name: 'Máscara negra', duration: 20, priceLabel: 'R$ 25,00', priceValue: 25 },
  { id: 12, name: 'Selagem', duration: 80, priceLabel: 'R$ 100,00', priceValue: 100 },
  { id: 13, name: 'Sobrancelha na pinça', duration: 10, priceLabel: 'R$ 15,00', priceValue: 15 },
  { id: 14, name: 'Sobrancelha navalha', duration: 10, priceLabel: 'R$ 10,00', priceValue: 10 },
];

const ServiceThumbnail = ({ service }: { service: ServiceItem }) => {
  const isPackage = service.category === 'Pacote';

  if (service.image) {
    return <img src={service.image} alt={service.name} className="h-14 w-14 rounded-2xl object-cover shadow-sm" />;
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
                {service.duration} min. - {service.priceLabel}
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
  const [query, setQuery] = useState('');
  const [activeView, setActiveView] = useState<ServicesView>('services');

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return SERVICES_CATALOG.filter((service) => {
      const matchesTab = activeView === 'services'
        ? service.category !== 'Pacote'
        : service.category === 'Pacote';

      if (!matchesTab) return false;
      if (!normalizedQuery) return true;

      const searchable = `${service.name} ${service.category || 'Serviços'}`.toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [activeView, query]);

  const packagesCount = SERVICES_CATALOG.filter((service) => service.category === 'Pacote').length;
  const servicesCount = SERVICES_CATALOG.length - packagesCount;

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
                <p className="mt-1 text-2xl font-semibold">14</p>
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
            {filteredServices.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}

            {filteredServices.length === 0 && (
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