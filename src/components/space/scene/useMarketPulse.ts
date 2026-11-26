// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { useEffect } from "react";

/**
 * Live market pulse used to drive the space background.
 *
 * Reads Binance's public combined ticker stream (no key required) and falls
 * back to polling the project's own price function if the socket is blocked.
 * State lives in a module-level object so the render loop can read it every
 * frame without triggering React re-renders.
 */

export interface MarketEvent {
  /** magnitude of the move, 0..1 (already normalised) */
  strength: number;
  /** +1 up, -1 down */
  direction: 1 | -1;
  symbol: string;
}

interface PulseState {
  /** 0..1 — recent market volatility */
  volatility: number;
  /** events waiting to be consumed by the scene */
  queue: MarketEvent[];
  connected: boolean;
}

export const marketPulse: PulseState = { volatility: 0.15, queue: [], connected: false };

/** Scene calls this each frame to drain newly fired events. */
export const drainMarketEvents = (): MarketEvent[] => {
  if (marketPulse.queue.length === 0) return EMPTY;
  const out = marketPulse.queue.slice();
  marketPulse.queue.length = 0;
  return out;
};

const EMPTY: MarketEvent[] = [];

const SYMBOLS = ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "xrpusdt", "dogeusdt"];
const STREAM = `wss://stream.binance.com:9443/stream?streams=${SYMBOLS.map((s) => `${s}@ticker`).join("/")}`;

const lastPrice = new Map<string, number>();
const recentMoves: number[] = [];

const pushEvent = (symbol: string, pct: number) => {
  const abs = Math.abs(pct);
  recentMoves.push(abs);
  if (recentMoves.length > 60) recentMoves.shift();

  const avg = recentMoves.reduce((a, b) => a + b, 0) / Math.max(recentMoves.length, 1);
  marketPulse.volatility = Math.min(1, avg * 900);

  // only meaningful ticks become comets
  if (abs < 0.0004) return;
  if (marketPulse.queue.length > 12) return;
  marketPulse.queue.push({
    symbol,
    direction: pct >= 0 ? 1 : -1,
    strength: Math.min(1, abs * 400),
  });
};

let refCount = 0;
let socket: WebSocket | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const startPolling = () => {
  if (pollTimer) return;
  const tick = async () => {
    try {
      const res = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
      const json = (await res.json()) as { data?: { amount?: string } };
      const price = Number(json?.data?.amount);
      if (!Number.isFinite(price)) return;
      const prev = lastPrice.get("BTC");
      lastPrice.set("BTC", price);
      if (prev) pushEvent("BTC", (price - prev) / prev);
    } catch {
      /* offline — the scene keeps its ambient defaults */
    }
  };
  void tick();
  pollTimer = setInterval(tick, 8000);
};

const connect = () => {
  if (socket || typeof WebSocket === "undefined") return;
  try {
    const ws = new WebSocket(STREAM);
    socket = ws;
    ws.onopen = () => {
      marketPulse.connected = true;
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { data?: { s?: string; c?: string } };
        const sym = msg?.data?.s;
        const price = Number(msg?.data?.c);
        if (!sym || !Number.isFinite(price)) return;
        const prev = lastPrice.get(sym);
        lastPrice.set(sym, price);
        if (prev) pushEvent(sym.replace("USDT", ""), (price - prev) / prev);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onerror = () => {
      marketPulse.connected = false;
      startPolling();
    };
    ws.onclose = () => {
      marketPulse.connected = false;
      socket = null;
      if (refCount > 0) startPolling();
    };
  } catch {
    startPolling();
  }
};

const teardown = () => {
  socket?.close();
  socket = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  marketPulse.connected = false;
};

/** Mount once from the scene; keeps the feed alive while the background lives. */
export const useMarketPulse = () => {
  useEffect(() => {
    refCount += 1;
    connect();
    return () => {
      refCount -= 1;
      if (refCount === 0) teardown();
    };
  }, []);
};
