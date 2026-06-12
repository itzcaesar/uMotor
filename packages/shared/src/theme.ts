import type { BookingStatus } from './types';

export const colors = {
  primary: '#0E4DA4', // AstraPay-like blue
  accent: '#00A86B', // success green
  warning: '#F5A623', // 80–95% used
  danger: '#E03131', // >=95% used
  surface: '#F7F8FA',
  text: '#101828',
};

export const statusColor: Record<BookingStatus, string> = {
  pending: '#F5A623',
  confirmed: '#0E4DA4',
  checked_in: '#7048E8',
  in_progress: '#1098AD',
  completed: '#00A86B',
  cancelled: '#868E96',
};

export const formatRp = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

/** Shared health bar color rule: <80 green, 80–94 warning, >=95 danger. */
export const healthColor = (pctUsed: number) =>
  pctUsed >= 95 ? colors.danger : pctUsed >= 80 ? colors.warning : colors.accent;
