import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { authActor, useAuthSelector } from "../machines/authMachine";
import { syncActor, useSyncSelector } from "../machines/syncMachine";
import {
  enrichmentActor,
  useEnrichmentSelector,
} from "../machines/enrichmentMachine";

const MAX_LOG = 50;

interface LogEntry {
  id: number;
  ts: number;
  machine: string;
  event: string;
  state: string;
}

let nextId = 0;

function stateStr(v: unknown): string {
  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}

function useEventLog() {
  const [log, setLog] = useState<LogEntry[]>([]);

  const push = useCallback(
    (machine: string, event: string, state: string) => {
      setLog((prev) => {
        const entry: LogEntry = {
          id: nextId++,
          ts: Date.now(),
          machine,
          event,
          state,
        };
        const next = [entry, ...prev];
        return next.length > MAX_LOG ? next.slice(0, MAX_LOG) : next;
      });
    },
    [],
  );

  useEffect(() => {
    const actors = [
      { actor: authActor, name: "auth" },
      { actor: syncActor, name: "sync" },
      { actor: enrichmentActor, name: "enrich" },
    ] as const;

    const unsubs = actors.map(({ actor, name }) =>
      actor.system.inspect((evt: any) => {
        if (
          evt.type === "@xstate.event" &&
          evt.actorRef === actor
        ) {
          const eventType = evt.event?.type ?? "?";
          if (eventType !== "xstate.init") {
            const snap = actor.getSnapshot();
            push(name, String(eventType), stateStr(snap.value));
          }
        }
      }),
    );

    return () => unsubs.forEach((sub) => sub.unsubscribe());
  }, [push]);

  return log;
}

function DebugPanel() {
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<"state" | "log">("state");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "d"
      ) {
        e.preventDefault();
        setVisible((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const authState = useAuthSelector((snap) => snap.value);
  const session = useAuthSelector((snap) => snap.context.session);

  const syncState = useSyncSelector((snap) => snap.value);
  const syncProgress = useSyncSelector((snap) => snap.context.progress);
  const syncError = useSyncSelector((snap) => snap.context.error);
  const syncNewCount = useSyncSelector((snap) => snap.context.newCount);

  const enrichState = useEnrichmentSelector((snap) => snap.value);
  const enrichedCount = useEnrichmentSelector(
    (snap) => snap.context.enrichedCount,
  );
  const totalCount = useEnrichmentSelector((snap) => snap.context.totalCount);

  const log = useEventLog();

  if (!visible) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] w-80 rounded-lg bg-gray-900/90 p-3 font-mono text-xs text-gray-200 shadow-lg backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-gray-400">
        <div className="flex gap-2">
          <TabBtn active={tab === "state"} onClick={() => setTab("state")}>
            State
          </TabBtn>
          <TabBtn active={tab === "log"} onClick={() => setTab("log")}>
            Log
          </TabBtn>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-gray-500 hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      {tab === "state" ? (
        <>
          <Section label="Auth">
            <Row label="state" value={stateStr(authState)} />
            <Row label="userId" value={session?.userId ?? "—"} />
          </Section>

          <Section label="Sync">
            <Row label="state" value={stateStr(syncState)} />
            {syncProgress && (
              <Row
                label="progress"
                value={`${syncProgress.fetched}/${syncProgress.total}`}
              />
            )}
            {syncNewCount != null && (
              <Row label="newCount" value={String(syncNewCount)} />
            )}
            {syncError && <Row label="error" value={syncError} error />}
          </Section>

          <Section label="Enrichment">
            <Row label="state" value={stateStr(enrichState)} />
            <Row
              label="progress"
              value={`${enrichedCount}/${totalCount}`}
            />
          </Section>
        </>
      ) : (
        <EventLog entries={log} />
      )}
    </div>,
    document.body,
  );
}

function EventLog({ entries }: { entries: LogEntry[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  if (entries.length === 0) {
    return (
      <p className="py-2 text-center text-[10px] text-gray-500">
        No events yet
      </p>
    );
  }

  const machineColor: Record<string, string> = {
    auth: "text-blue-400",
    sync: "text-green-400",
    enrich: "text-amber-400",
  };

  return (
    <div
      ref={listRef}
      className="max-h-60 overflow-y-auto"
    >
      {entries.map((e) => {
        const age = formatAge(e.ts);
        return (
          <div
            key={e.id}
            className="flex gap-1.5 border-b border-gray-800 py-0.5 last:border-0"
          >
            <span className="shrink-0 text-gray-600">{age}</span>
            <span
              className={`shrink-0 ${machineColor[e.machine] ?? "text-gray-400"}`}
            >
              {e.machine}
            </span>
            <span className="text-gray-300">{e.event}</span>
            <span className="ml-auto shrink-0 truncate text-gray-500">
              {e.state}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatAge(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m`;
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
        active
          ? "bg-gray-700 text-gray-200"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-1.5 border-t border-gray-700 pt-1.5 first:mt-0 first:border-0 first:pt-0">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  error,
}: {
  label: string;
  value: string;
  error?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span
        className={`truncate ${error ? "text-red-400" : "text-gray-100"}`}
      >
        {value}
      </span>
    </div>
  );
}

export default DebugPanel;
