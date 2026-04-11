import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scissors, Package, Calendar, Clock, ChevronRight, ChevronLeft,
  User, Check, ArrowRight, Loader2, Star, Sparkles, X
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceCatalogItem {
  id: number;
  name: string;
  price: number;
  duration_minutes: number;
  description?: string;
  active?: boolean;
  category?: string;
}

interface Barber {
  id: number;
  name: string;
  specialty?: string;
  photo_url?: string;
}

type BookingStep = 'services' | 'datetime' | 'barber' | 'confirm' | 'success';

// ─── Step Indicator ───────────────────────────────────────────────────────────

const steps: { key: BookingStep; label: string }[] = [
  { key: 'services', label: 'Serviço' },
  { key: 'datetime', label: 'Data & Hora' },
  { key: 'barber', label: 'Barbeiro' },
  { key: 'confirm', label: 'Confirmar' },
];

function StepIndicator({ current }: { current: BookingStep }) {
  const currentIndex = steps.findIndex(s => s.key === current);
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {steps.map((step, idx) => {
        const isDone = idx < currentIndex;
        const isActive = idx === currentIndex;
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{
                  background: isDone ? '#10b981' : isActive ? '#ffffff' : 'rgba(255,255,255,0.05)',
                  borderColor: isDone ? '#10b981' : isActive ? '#ffffff' : 'rgba(255,255,255,0.1)',
                }}
                className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all"
              >
                {isDone ? (
                  <Check className="w-3.5 h-3.5 text-black" />
                ) : (
                  <span className={cn('text-xs font-bold', isActive ? 'text-black' : 'text-gray-600')}>
                    {idx + 1}
                  </span>
                )}
              </motion.div>
              <span className={cn('text-[10px] font-medium uppercase tracking-widest', isActive ? 'text-white' : isDone ? 'text-emerald-400' : 'text-gray-600')}>
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={cn('h-px w-12 sm:w-20 mx-1 mb-5 transition-colors', idx < currentIndex ? 'bg-emerald-500' : 'bg-white/10')} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  selected,
  onSelect,
}: {
  service: ServiceCatalogItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const isPackage = service.category === 'Pacote';

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={cn(
        'relative w-full text-left rounded-2xl border p-5 transition-all duration-200 flex items-center gap-4 group overflow-hidden',
        selected
          ? 'border-white bg-white/5 shadow-[0_0_30px_rgba(255,255,255,0.07)]'
          : 'border-white/10 bg-zinc-900/60 hover:border-white/25 hover:bg-zinc-800/60'
      )}
    >
      {/* Icon area */}
      <div
        className={cn(
          'w-14 h-14 shrink-0 rounded-xl flex items-center justify-center transition-all duration-200',
          selected
            ? isPackage
              ? 'bg-amber-400 text-black'
              : 'bg-white text-black'
            : isPackage
              ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
              : 'bg-white/5 text-gray-400 border border-white/10'
        )}
      >
        {isPackage ? <Sparkles className="w-6 h-6" /> : <Scissors className="w-6 h-6" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-bold text-white text-base leading-tight">{service.name}</h4>
          {isPackage && (
            <span className="shrink-0 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-400 border border-amber-400/25">
              Pacote
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-2.5">
          <span className={cn('font-bold text-lg', isPackage ? 'text-amber-400' : 'text-emerald-400')}>
            R$ {Number(service.price).toFixed(2)}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            {service.duration_minutes} min
          </span>
        </div>
        {service.description && (
          <p className="text-xs text-gray-500 mt-1.5 line-clamp-1">{service.description}</p>
        )}
      </div>

      {/* Arrow */}
      <ChevronRight
        className={cn(
          'w-4 h-4 shrink-0 transition-all duration-200',
          selected ? 'text-white opacity-100' : 'text-gray-600 group-hover:text-gray-400'
        )}
      />

      {/* Selection glow */}
      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 rounded-2xl pointer-events-none border-2 border-white/30"
        />
      )}
    </motion.button>
  );
}

// ─── Services Step ────────────────────────────────────────────────────────────

function ServicesStep({
  services,
  selectedService,
  onSelect,
  onNext,
  loading,
}: {
  services: ServiceCatalogItem[];
  selectedService: ServiceCatalogItem | null;
  onSelect: (s: ServiceCatalogItem) => void;
  onNext: () => void;
  loading: boolean;
}) {
  const packages = services.filter(s => s.category === 'Pacote');
  const avulsos = services.filter(s => s.category !== 'Pacote');

  return (
    <motion.div
      key="services"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      <div>
        <h2 className="text-3xl font-light mb-1">Escolha o serviço</h2>
        <p className="text-gray-500 text-sm">Selecione o que você prefere e avance para agendar</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Packages section */}
          {packages.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-amber-400">
                  Pacotes Completos
                </h3>
                <div className="flex-1 h-px bg-amber-400/20" />
              </div>
              <div className="grid grid-cols-1 gap-3">
                {packages.map(s => (
                  <ServiceCard
                    key={s.id}
                    service={s}
                    selected={selectedService?.id === s.id}
                    onSelect={() => onSelect(s)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Avulsos section */}
          {avulsos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Scissors className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">
                  Serviços Avulsos
                </h3>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {avulsos.map(s => (
                  <ServiceCard
                    key={s.id}
                    service={s}
                    selected={selectedService?.id === s.id}
                    onSelect={() => onSelect(s)}
                  />
                ))}
              </div>
            </div>
          )}

          {services.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              Nenhum serviço disponível no momento.
            </div>
          )}
        </>
      )}

      {/* CTA */}
      <AnimatePresence>
        {selectedService && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="sticky bottom-6 pt-4"
          >
            <button
              onClick={onNext}
              className="w-full flex items-center justify-center gap-3 py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-100 transition-all shadow-[0_8px_32px_rgba(255,255,255,0.15)]"
            >
              <span>Agendar — {selectedService.name}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── DateTime Step ─────────────────────────────────────────────────────────────

const MOCK_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
];

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function DateTimeStep({
  service,
  selectedDate,
  selectedTime,
  onDateSelect,
  onTimeSelect,
  onNext,
  onBack,
}: {
  service: ServiceCatalogItem;
  selectedDate: string;
  selectedTime: string;
  onDateSelect: (d: string) => void;
  onTimeSelect: (t: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const today = new Date();
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const canProceed = selectedDate && selectedTime;

  return (
    <motion.div
      key="datetime"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      {/* Header with service recap */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-light mb-1">Data & Hora</h2>
          <p className="text-gray-500 text-sm">Escolha quando quer ser atendido</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-2">
          <Scissors className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-sm text-gray-400">{service.name}</span>
          <span className="text-xs text-emerald-400 font-bold ml-1">R$ {Number(service.price).toFixed(2)}</span>
        </div>
      </div>

      {/* Date picker */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">Selecione uma Data</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x scroll-smooth">
          {days.map(day => {
            const key = toKey(day);
            const isSelected = key === selectedDate;
            const isToday = toKey(day) === toKey(today);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            return (
              <motion.button
                key={key}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { onDateSelect(key); onTimeSelect(''); }}
                className={cn(
                  'snap-start shrink-0 flex flex-col items-center justify-center w-16 h-20 rounded-xl border transition-all duration-200',
                  isSelected
                    ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                    : isWeekend
                      ? 'bg-white/3 border-white/10 text-gray-500 hover:border-white/20'
                      : 'bg-zinc-900/60 border-white/10 hover:border-white/25 hover:bg-zinc-800/60'
                )}
              >
                <span className={cn('text-[10px] uppercase font-bold', isSelected ? 'text-black/60' : 'text-gray-500')}>
                  {DAY_LABELS[day.getDay()]}
                </span>
                <span className={cn('text-2xl font-bold mt-1', isSelected ? 'text-black' : 'text-white')}>
                  {day.getDate()}
                </span>
                <span className={cn('text-[10px] mt-0.5', isSelected ? 'text-black/60' : 'text-gray-600')}>
                  {MONTH_LABELS[day.getMonth()]}
                </span>
                {isToday && !isSelected && (
                  <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1" />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Time slots */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Horários Disponíveis — {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {MOCK_SLOTS.map(slot => (
                <motion.button
                  key={slot}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onTimeSelect(slot)}
                  className={cn(
                    'py-3 rounded-xl border text-sm font-medium transition-all duration-200',
                    selectedTime === slot
                      ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                      : 'bg-zinc-900/60 border-white/10 text-gray-400 hover:border-white/25 hover:text-white'
                  )}
                >
                  {slot}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </button>
        <motion.button
          disabled={!canProceed}
          onClick={onNext}
          whileHover={canProceed ? { scale: 1.01 } : {}}
          className={cn(
            'flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all',
            canProceed
              ? 'bg-white text-black hover:bg-gray-100 shadow-[0_8px_32px_rgba(255,255,255,0.15)]'
              : 'bg-white/5 text-gray-600 cursor-not-allowed'
          )}
        >
          Próximo — Escolher Barbeiro
          <ArrowRight className="w-5 h-5" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Barber Step ──────────────────────────────────────────────────────────────

function BarberStep({
  barbers,
  selectedBarber,
  onSelect,
  onNext,
  onBack,
  loadingBarbers,
}: {
  barbers: Barber[];
  selectedBarber: Barber | null;
  onSelect: (b: Barber) => void;
  onNext: () => void;
  onBack: () => void;
  loadingBarbers: boolean;
}) {
  return (
    <motion.div
      key="barber"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      <div>
        <h2 className="text-3xl font-light mb-1">Seu Barbeiro</h2>
        <p className="text-gray-500 text-sm">Escolha com quem prefere ser atendido</p>
      </div>

      {loadingBarbers ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {barbers.map(barber => {
            const isSelected = selectedBarber?.id === barber.id;
            return (
              <motion.button
                key={barber.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(barber)}
                className={cn(
                  'relative flex flex-col items-center p-5 rounded-2xl border transition-all duration-200 gap-3',
                  isSelected
                    ? 'border-white bg-white/5 shadow-[0_0_30px_rgba(255,255,255,0.07)]'
                    : 'border-white/10 bg-zinc-900/60 hover:border-white/25 hover:bg-zinc-800/60'
                )}
              >
                {/* Avatar */}
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 bg-white/5">
                  {barber.photo_url ? (
                    <img src={barber.photo_url} alt={barber.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-400">
                      {barber.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="font-bold text-white text-sm">{barber.name}</p>
                  {barber.specialty && (
                    <p className="text-xs text-gray-500 mt-0.5">{barber.specialty}</p>
                  )}
                </div>
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-3 right-3 w-5 h-5 rounded-full bg-white flex items-center justify-center"
                  >
                    <Check className="w-3 h-3 text-black" />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
          {barbers.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-500">
              Nenhum barbeiro disponível.
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </button>
        <motion.button
          disabled={!selectedBarber}
          onClick={onNext}
          className={cn(
            'flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all',
            selectedBarber
              ? 'bg-white text-black hover:bg-gray-100 shadow-[0_8px_32px_rgba(255,255,255,0.15)]'
              : 'bg-white/5 text-gray-600 cursor-not-allowed'
          )}
        >
          Próximo — Confirmar
          <ArrowRight className="w-5 h-5" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Confirm Step ─────────────────────────────────────────────────────────────

function ConfirmStep({
  service,
  barber,
  date,
  time,
  onBack,
  onConfirm,
  loading,
}: {
  service: ServiceCatalogItem;
  barber: Barber;
  date: string;
  time: string;
  onBack: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const dateObj = new Date(date + 'T' + time + ':00');
  const formattedDate = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const rows = [
    { label: 'Serviço', value: service.name },
    { label: 'Duração', value: `${service.duration_minutes} min` },
    { label: 'Valor', value: `R$ ${Number(service.price).toFixed(2)}` },
    { label: 'Barbeiro', value: barber.name },
    { label: 'Data', value: formattedDate },
    { label: 'Horário', value: time },
  ];

  return (
    <motion.div
      key="confirm"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      <div>
        <h2 className="text-3xl font-light mb-1">Confirme seu Agendamento</h2>
        <p className="text-gray-500 text-sm">Revise os detalhes antes de confirmar</p>
      </div>

      <div className="bg-zinc-900/60 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-gray-500">{row.label}</span>
            <span className="text-sm font-medium text-white text-right">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl px-5 py-4 text-sm text-amber-400/80 flex items-start gap-3">
        <Star className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
        <span>Você receberá uma confirmação. Em caso de imprevisto, cancele com antecedência.</span>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-all disabled:opacity-50"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </button>
        <motion.button
          onClick={onConfirm}
          disabled={loading}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          className="flex-1 flex items-center justify-center gap-3 py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-100 transition-all disabled:opacity-50 shadow-[0_8px_32px_rgba(255,255,255,0.15)]"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Confirmando...</>
          ) : (
            <><Check className="w-5 h-5" /> Confirmar Agendamento</>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({ service, barber, date, time, onNew }: {
  service: ServiceCatalogItem;
  barber: Barber;
  date: string;
  time: string;
  onNew: () => void;
}) {
  const dateObj = new Date(date + 'T' + time + ':00');
  const formattedDate = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-12 space-y-6"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.1 }}
        className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto"
      >
        <Check className="w-12 h-12 text-emerald-400" />
      </motion.div>

      <div>
        <h2 className="text-3xl font-light mb-2">Agendado com Sucesso!</h2>
        <p className="text-gray-400">{service.name} com <span className="text-white font-medium">{barber.name}</span></p>
        <p className="text-white font-bold text-lg mt-2">{formattedDate} às {time}</p>
      </div>

      <div className="bg-zinc-900/60 border border-white/10 rounded-2xl px-6 py-5 text-sm text-gray-400 max-w-sm mx-auto">
        Você receberá um lembrete. Caso precise cancelar, entre em contato com pelo menos 2 horas de antecedência.
      </div>

      <button
        onClick={onNew}
        className="inline-flex items-center gap-2 px-8 py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-100 transition-all"
      >
        <Scissors className="w-4 h-4" />
        Fazer Novo Agendamento
      </button>
    </motion.div>
  );
}

// ─── Main Booking Page ────────────────────────────────────────────────────────

export default function BookingPage() {
  const [step, setStep] = useState<BookingStep>('services');

  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);

  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingBarbers, setLoadingBarbers] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);

  const [selectedService, setSelectedService] = useState<ServiceCatalogItem | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);

  // Fetch services
  useEffect(() => {
    setLoadingServices(true);
    fetch('/api/public/services')
      .then(r => r.json())
      .then(d => setServices(Array.isArray(d) ? d : []))
      .catch(() => setServices([]))
      .finally(() => setLoadingServices(false));
  }, []);

  // Fetch barbers when entering barber step
  useEffect(() => {
    if (step === 'barber' && barbers.length === 0) {
      setLoadingBarbers(true);
      fetch('/api/public/barbers')
        .then(r => r.json())
        .then(d => setBarbers(Array.isArray(d) ? d : []))
        .catch(() => setBarbers([]))
        .finally(() => setLoadingBarbers(false));
    }
  }, [step]);

  const handleConfirm = useCallback(async () => {
    if (!selectedService || !selectedBarber || !selectedDate || !selectedTime) return;
    setLoadingConfirm(true);
    // Simulate network call — replace with real API call
    await new Promise(r => setTimeout(r, 1200));
    setLoadingConfirm(false);
    setStep('success');
  }, [selectedService, selectedBarber, selectedDate, selectedTime]);

  const handleReset = () => {
    setStep('services');
    setSelectedService(null);
    setSelectedDate('');
    setSelectedTime('');
    setSelectedBarber(null);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero header */}
      <div className="relative border-b border-white/5">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />
        <div className="relative max-w-5xl mx-auto px-4 pt-16 pb-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-gray-400 uppercase tracking-widest mb-5"
          >
            <Scissors className="w-3 h-3" />
            Ma Beard Style
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-light mb-3"
          >
            Agende seu Horário
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-gray-500 max-w-md mx-auto"
          >
            Escolha o serviço, data e barbeiro. Rápido e simples.
          </motion.p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-12">
        {step !== 'success' && <StepIndicator current={step} />}

        <AnimatePresence mode="wait">
          {step === 'services' && (
            <ServicesStep
              services={services}
              selectedService={selectedService}
              onSelect={setSelectedService}
              onNext={() => setStep('datetime')}
              loading={loadingServices}
            />
          )}

          {step === 'datetime' && selectedService && (
            <DateTimeStep
              service={selectedService}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              onDateSelect={setSelectedDate}
              onTimeSelect={setSelectedTime}
              onNext={() => setStep('barber')}
              onBack={() => setStep('services')}
            />
          )}

          {step === 'barber' && selectedService && (
            <BarberStep
              barbers={barbers}
              selectedBarber={selectedBarber}
              onSelect={setSelectedBarber}
              onNext={() => setStep('confirm')}
              onBack={() => setStep('datetime')}
              loadingBarbers={loadingBarbers}
            />
          )}

          {step === 'confirm' && selectedService && selectedBarber && (
            <ConfirmStep
              service={selectedService}
              barber={selectedBarber}
              date={selectedDate}
              time={selectedTime}
              onBack={() => setStep('barber')}
              onConfirm={handleConfirm}
              loading={loadingConfirm}
            />
          )}

          {step === 'success' && selectedService && selectedBarber && (
            <SuccessScreen
              service={selectedService}
              barber={selectedBarber}
              date={selectedDate}
              time={selectedTime}
              onNew={handleReset}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
