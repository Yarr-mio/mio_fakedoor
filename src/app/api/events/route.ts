import { NextRequest, NextResponse } from "next/server";
import { insertEvents, type FunnelEventRow } from "@/lib/db";
import {
  FUNNEL_EVENT_SET,
  MAX_ANON_ID_LENGTH,
  MAX_BATCH_SIZE,
  MAX_PROPS_BYTES,
  VARIANTS,
} from "@/lib/funnel-events";

export const runtime = "nodejs";

interface IncomingEvent {
  name?: unknown;
  props?: unknown;
}

interface IncomingBody {
  anonId?: unknown;
  variant?: unknown;
  utm?: unknown;
  events?: unknown;
}

function sanitizeUtm(utm: unknown): Record<string, string> {
  if (!utm || typeof utm !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(utm as Record<string, unknown>)) {
    if (typeof value === "string" && /^[a-z_]{3,32}$/.test(key)) {
      out[key] = value.slice(0, 256);
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  let body: IncomingBody;
  try {
    body = (await request.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const anonId = typeof body.anonId === "string" ? body.anonId.slice(0, MAX_ANON_ID_LENGTH) : "";
  if (!anonId) {
    return NextResponse.json({ error: "anon_id_required" }, { status: 400 });
  }

  const variant =
    typeof body.variant === "string" && (VARIANTS as readonly string[]).includes(body.variant)
      ? body.variant
      : null;

  const rawEvents = Array.isArray(body.events) ? (body.events as IncomingEvent[]) : [];
  if (rawEvents.length === 0 || rawEvents.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: "invalid_batch" }, { status: 400 });
  }

  const utm = sanitizeUtm(body.utm);
  const ua = request.headers.get("user-agent")?.slice(0, 256) ?? null;

  const rows: FunnelEventRow[] = [];
  let dropped = 0;

  for (const event of rawEvents) {
    const name = typeof event.name === "string" ? event.name : "";
    // 화이트리스트 밖 이벤트는 조용히 드롭 (mio_server event-whitelist와 같은 정책)
    if (!FUNNEL_EVENT_SET.has(name)) {
      dropped += 1;
      continue;
    }
    let props: Record<string, unknown> = {};
    if (event.props && typeof event.props === "object" && !Array.isArray(event.props)) {
      props = event.props as Record<string, unknown>;
      if (JSON.stringify(props).length > MAX_PROPS_BYTES) {
        props = {};
      }
    }
    rows.push({ anonId, variant, name, props, utm, ua });
  }

  try {
    await insertEvents(rows);
  } catch (err) {
    console.error("[events] insert failed", err);
    return NextResponse.json({ error: "storage_error" }, { status: 500 });
  }

  return NextResponse.json({ accepted: rows.length, dropped });
}
