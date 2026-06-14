import { create } from 'zustand';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@umotor/shared';

/**
 * MotoCommunity content (PRD 01). Static/mock by design for the prototype —
 * there is no community backend. Centralised here so the tab, the community
 * detail screen, and the post detail screen all read the same source, and the
 * zustand store below keeps likes / joins / new comments consistent as the user
 * navigates between them (so the feed feels live without a server).
 */

type IconName = keyof typeof Ionicons.glyphMap;

export type Comment = { id: string; author: string; time: string; body: string };

export type Post = {
  id: string;
  groupId: string;
  author: string;
  time: string;
  title: string;
  preview: string; // shown in the feed
  body: string; // full text on the detail screen
  likes: number;
  tag: string;
  comments: Comment[];
};

export type Group = {
  id: string;
  name: string;
  members: string;
  icon: IconName;
  description: string;
};

export const TAG_COLOR: Record<string, string> = {
  Diskusi: colors.primary,
  Edukasi: colors.accent,
  Review: '#f5a623',
};

export const GROUPS: Group[] = [
  {
    id: 'vario',
    name: 'Vario 160 Indonesia',
    members: '48.2 rb',
    icon: 'people',
    description:
      'Komunitas pemilik Honda Vario 160 se-Indonesia. Diskusi perawatan, modifikasi, dan tips harian.',
  },
  {
    id: 'nmax',
    name: 'NMAX Rider Bandung',
    members: '12.7 rb',
    icon: 'people',
    description: 'Rider Yamaha NMAX area Bandung Raya. Kopdar, touring, dan info bengkel terpercaya.',
  },
  {
    id: 'bbm',
    name: 'Tips Hemat BBM Harian',
    members: '31.0 rb',
    icon: 'flame',
    description: 'Trik berkendara hemat bahan bakar untuk komuter harian. Semua merek motor welcome.',
  },
];

export const POSTS: Post[] = [
  {
    id: 'oil',
    groupId: 'vario',
    author: 'Rizky · Vario 160',
    time: '2 jam lalu',
    title: 'Yamalube 10W-30 vs AHM MPX-2, pilih mana?',
    preview:
      'Udah coba dua-duanya 5.000 km. Yamalube lebih halus di putaran atas, tapi MPX-2 lebih murah. Kalian gimana?',
    body: 'Udah coba dua-duanya masing-masing 5.000 km di Vario 160 harian. Yamalube 10W-30 terasa lebih halus di putaran atas dan tarikan lebih responsif, cocok buat yang sering nyalip. AHM MPX-2 lebih murah ~Rp 7.000 dan tetap awet sampai interval ganti. Buat pemakaian normal harian, MPX-2 udah lebih dari cukup. Kalau mau performa maksimal, Yamalube layak nambah dikit. Kalian tim mana?',
    likes: 124,
    tag: 'Diskusi',
    comments: [
      { id: 'c1', author: 'Andi · Vario 160', time: '1 jam lalu', body: 'Tim MPX-2, beda performanya tipis tapi hemat lumayan setahun.' },
      { id: 'c2', author: 'Sari · PCX 160', time: '45 menit lalu', body: 'Yamalube enak sih di tanjakan, mesin adem.' },
      { id: 'c3', author: 'uMotor Tips', time: '30 menit lalu', body: 'Yang penting ganti tepat interval — pantau di tab Garasi ya 😉' },
    ],
  },
  {
    id: 'cvt',
    groupId: 'vario',
    author: 'Bagus · Vario 160',
    time: '5 jam lalu',
    title: 'Servis CVT tiap berapa km idealnya?',
    preview: 'Suara CVT mulai kasar di 12.000 km. Normal nggak ya? Ada yang udah ganti roller?',
    body: 'Vario 160 saya udah 12.000 km, suara CVT mulai agak kasar pas akselerasi awal. Belum pernah bongkar CVT sama sekali. Idealnya servis CVT (bersih-bersih + cek roller & v-belt) tiap berapa km ya? Ada yang udah ganti roller, ngaruh ke akselerasi nggak?',
    likes: 67,
    tag: 'Diskusi',
    comments: [
      { id: 'c1', author: 'Eko · Vario 125', time: '3 jam lalu', body: 'Bersihin CVT tiap 8.000 km, ganti roller ~24.000 km. Langsung enteng tarikannya.' },
      { id: 'c2', author: 'AHASS Bandung Timur', time: '2 jam lalu', body: 'Bisa sekalian pas servis rutin. Booking aja lewat uMotor, kami cek gratis.' },
    ],
  },
  {
    id: 'tire',
    groupId: 'bbm',
    author: 'uMotor Tips',
    time: 'Kemarin',
    title: 'Cara cek kondisi ban motor dalam 30 detik',
    preview:
      'Pakai koin Rp 500 di alur ban. Kalau kepala garuda masih kelihatan penuh, ban sudah aus dan perlu diganti.',
    body: 'Cek ban cepat tanpa alat: ambil koin Rp 500, masukkan ke alur ban (TWI/segitiga). Kalau kepala garuda masih kelihatan penuh, artinya kembang ban sudah tipis dan perlu diganti. Cek juga: retak halus di dinding ban, benjolan, dan tekanan angin (depan ~29 psi, belakang ~33 psi untuk matic). Ban aus = jarak pengereman lebih jauh & boros BBM karena rolling resistance naik.',
    likes: 502,
    tag: 'Edukasi',
    comments: [
      { id: 'c1', author: 'Dimas · BeAT', time: '20 jam lalu', body: 'Baru tau trik koin ini, makasih!' },
      { id: 'c2', author: 'Nina · Scoopy', time: '18 jam lalu', body: 'Tekanan angin sering keabaikan, padahal ngaruh banget ke BBM.' },
    ],
  },
  {
    id: 'eco',
    groupId: 'bbm',
    author: 'Hendra · Aerox 155',
    time: '2 hari lalu',
    title: 'Eco riding bikin 1 liter tembus 50 km, ini caranya',
    preview: 'Tahan bukaan gas, manfaatin engine brake, dan jaga RPM stabil. Konsumsi BBM naik drastis.',
    body: 'Setelah ubah gaya berkendara, Aerox saya bisa 48–52 km/liter (sebelumnya ~38). Caranya: 1) buka gas halus, jangan sentak; 2) jaga kecepatan konstan 40–60 km/jam; 3) manfaatkan engine brake daripada rem mendadak; 4) servis rutin + tekanan ban pas; 5) matikan mesin kalau berhenti >30 detik. Konsisten seminggu, dompet langsung kerasa bedanya.',
    likes: 318,
    tag: 'Edukasi',
    comments: [
      { id: 'c1', author: 'Budi · Vario 160', time: '1 hari lalu', body: 'Engine brake emang kunci, rem belakang awet juga.' },
      { id: 'c2', author: 'Fajar · NMAX 155', time: '1 hari lalu', body: 'Tekanan ban + servis rutin ngaruh paling besar di motor saya.' },
    ],
  },
  {
    id: 'home',
    groupId: 'nmax',
    author: 'Dewi · NMAX 155',
    time: '2 hari lalu',
    title: 'Review home service AHASS — worth it!',
    preview:
      'Ganti oli di rumah sambil WFH. Mekanik datang tepat waktu, bayar via AstraPay langsung. Recommended buat yang sibuk.',
    body: 'Coba fitur home service di uMotor minggu lalu. Pilih bengkel yang support home service, pin lokasi rumah, pilih slot. Mekanik AHASS datang tepat waktu bawa oli + tools, ganti oli NMAX sambil saya WFH. Bayar deposit di awal, sisanya via AstraPay pas selesai. Nggak perlu antre di bengkel, nggak buang waktu. Worth it banget buat yang sibuk!',
    likes: 213,
    tag: 'Review',
    comments: [
      { id: 'c1', author: 'Putra · NMAX 155', time: '1 hari lalu', body: 'Biaya home service-nya berapa kak?' },
      { id: 'c2', author: 'Dewi · NMAX 155', time: '1 hari lalu', body: '@Putra cuma nambah Rp 30.000 ongkos datang, sepadan sama hemat waktunya.' },
      { id: 'c3', author: 'Lina · Aerox 155', time: '20 jam lalu', body: 'Langsung cobain ah, kebetulan lagi sibuk banget.' },
    ],
  },
];

export const getGroup = (id: string) => GROUPS.find((g) => g.id === id);
export const getPost = (id: string) => POSTS.find((p) => p.id === id);
export const postsForGroup = (groupId: string) => POSTS.filter((p) => p.groupId === groupId);

// ── Interaction store ────────────────────────────────────────────────
// Ephemeral (resets on app restart) — keeps likes/joins/comments in sync as the
// user moves between the feed, a community, and a post without a backend.

interface CommunityState {
  liked: Record<string, boolean>;
  joined: Record<string, boolean>;
  addedComments: Record<string, Comment[]>;
  toggleLike: (postId: string) => void;
  toggleJoin: (groupId: string) => void;
  addComment: (postId: string, body: string) => void;
  likeCount: (post: Post) => number;
  commentsFor: (post: Post) => Comment[];
}

export const useCommunity = create<CommunityState>((set, get) => ({
  liked: {},
  // User is joined to all seeded groups by default.
  joined: Object.fromEntries(GROUPS.map((g) => [g.id, true])),
  addedComments: {},
  toggleLike: (postId) => set((s) => ({ liked: { ...s.liked, [postId]: !s.liked[postId] } })),
  toggleJoin: (groupId) => set((s) => ({ joined: { ...s.joined, [groupId]: !s.joined[groupId] } })),
  addComment: (postId, body) =>
    set((s) => {
      const existing = s.addedComments[postId] ?? [];
      const next: Comment = {
        id: `u${existing.length + 1}`,
        author: 'Kamu · Vario 160',
        time: 'Baru saja',
        body,
      };
      return { addedComments: { ...s.addedComments, [postId]: [...existing, next] } };
    }),
  likeCount: (post) => post.likes + (get().liked[post.id] ? 1 : 0),
  commentsFor: (post) => [...post.comments, ...(get().addedComments[post.id] ?? [])],
}));
