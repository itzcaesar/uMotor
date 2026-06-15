import Anthropic from "@anthropic-ai/sdk";
import { gatherSnapshot, snapshotToText, localAnswer } from "@/lib/snapshot";

// Anthropic SDK needs the Node runtime; data is live so never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-opus-4-8";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PREAMBLE = `Kamu adalah "uMotor AI", analis operasional untuk platform manajemen motor uMotor (berbasis AstraPay) di Indonesia.

Tentang uMotor: rider memakai app konsumen (garasi, MotoScore, booking servis, marketplace sparepart, finance hub, ride tracking); bengkel mitra (AHASS & independen) memakai app partner; tim ops memakai console web ini. MotoScore (300–850) adalah skor kredit dari perilaku perawatan motor — bukan riwayat bank — dan membuka pinjaman/asuransi. Ride tracking menghitung jarak di server (anti-cheat) untuk update odometer & reward.

Aturan jawaban:
- Jawab dalam Bahasa Indonesia, ringkas, langsung ke poin. Sebagai analis, beri insight bukan sekadar angka mentah.
- HANYA gunakan angka dari "DATA LIVE" di bawah. Jangan mengarang angka. Kalau datanya tidak ada, katakan dengan jujur.
- Uang selalu format Rupiah (mis. "Rp 1.250.000"). Gunakan poin/markdown bila membantu keterbacaan.
- Kalau diminta rekomendasi, beri 1–3 saran konkret yang berdasar data.`;

function buildSystem(snapshotText: string): string {
  return `${SYSTEM_PREAMBLE}\n\n=== DATA LIVE (per ${new Date().toLocaleString("id-ID")}) ===\n${snapshotText}`;
}

function streamText(text: string, mode: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Copilot-Mode": mode },
  });
}

export async function POST(req: Request) {
  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12); // cap history
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return new Response("Butuh pesan dari user.", { status: 400 });
  }
  const lastUser = messages[messages.length - 1].content;

  const snapshot = await gatherSnapshot();
  if (!snapshot) {
    return streamText(
      "Supabase belum dikonfigurasi — set NEXT_PUBLIC_SUPABASE_URL & ANON_KEY di .env.local agar uMotor AI bisa membaca data live.",
      "error",
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Keyless (or any failure) → deterministic, data-grounded local analyst.
  if (!apiKey) {
    return streamText(localAnswer(lastUser, snapshot), "local");
  }

  const client = new Anthropic({ apiKey });
  const system = buildSystem(snapshotToText(snapshot));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = client.messages.stream({
          model: MODEL,
          max_tokens: 1500,
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        // Never die on stage — fall back to the local analyst with a short note.
        console.error("[copilot] Claude error, falling back:", err);
        controller.enqueue(
          encoder.encode("_(uMotor AI offline — analisis lokal dari data live)_\n\n" + localAnswer(lastUser, snapshot)),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Copilot-Mode": "live" },
  });
}
