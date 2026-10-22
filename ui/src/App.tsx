import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Settings as Gear, SquareTerminal } from "lucide-react";
import { SettingsDialog } from "@/components/settings-dialog";
import {
  ddev,
  DEFAULT_SETTINGS,
  PHP_VERSIONS,
  siteHost,
  siteUrl,
  type JobResult,
  type OnLine,
  type Settings,
  type Site,
  type SiteDetails,
} from "@/lib/ddev";

type Dialog = null | "new" | "import" | "settings" | "remove";

/** Output of the ddev command running (or last run) for a site. */
interface Job {
  site: string;
  label: string; // "start", "stop", "php", "delete", ...
  lines: string[];
  done: boolean;
  ok: boolean;
  error: string;
}

const POLL_MS = 10_000;

export default function App() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<SiteDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsTick, setDetailsTick] = useState(0); // bump to re-describe
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await ddev.list();
      setSites(list);
      setLoadError(null);
      setSelected((cur) => (cur && list.some((s) => s.name === cur) ? cur : (list[0]?.name ?? null)));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    ddev.getSettings().then(setSettings);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const site = sites.find((s) => s.name === selected) ?? null;

  // Details (PHP, database, per-service status) come from `ddev describe`,
  // fetched when the selection or its status changes, or after a job.
  useEffect(() => {
    if (!site) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setDetails(null);
    setDetailsError(null);
    ddev
      .describe(site.name)
      .then((d) => !cancelled && setDetails(d))
      .catch((e: Error) => !cancelled && setDetailsError(e.message));
    return () => {
      cancelled = true;
    };
  }, [site?.name, site?.status, detailsTick]);

  // Notices fade after a while.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const setHttps = (on: boolean) => {
    if (!site) return;
    ddev.setHttps(site.name, on);
    setSites(sites.map((s) => (s.name === site.name ? { ...s, https: on } : s)));
  };

  const busy = job !== null && !job.done;
  const running = site?.status === "running";

  /** Runs a ddev job for the selected site, showing its output in the log panel. */
  const runJob = async (label: string, start: (onLine: OnLine) => Promise<JobResult>) => {
    if (!site || busy) return;
    const name = site.name;
    setJob({ site: name, label, lines: [], done: false, ok: false, error: "" });
    const result = await start((line) =>
      setJob((j) => (j && j.site === name ? { ...j, lines: [...j.lines, line] } : j)),
    );
    setJob((j) => (j && j.site === name ? { ...j, done: true, ...result } : j));
    await refresh();
    setDetailsTick((n) => n + 1);
    return result;
  };

  const quick = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setNotice(`${what}: ${(e as Error).message}`);
    }
  };

  const phpLabel = (v: string) => (v === "default" ? `Default (${settings.defaultPhp})` : v);
  const dotClass = (s: Site) =>
    s.status === "running" ? "bg-light-green" : s.status === "paused" ? "bg-light-yellow" : "bg-status-off";

  return (
    <div className="flex min-h-screen items-center justify-center bg-desk p-6 font-sans text-[13px] text-foreground">
      <div className="flex h-[640px] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-window shadow-window">
        <TitleBar title="DDEV Desktop">
          <button
            aria-label="Settings"
            onClick={() => setDialog("settings")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-selection"
          >
            <Gear className="h-4 w-4" />
          </button>
        </TitleBar>

        <div className="flex min-h-0 flex-1 gap-0 px-3 pt-3">
          <ul className="w-80 shrink-0 overflow-auto bg-pane py-1">
            {sites.map((s) => (
              <li key={s.name}>
                <button
                  onClick={() => setSelected(s.name)}
                  title={s.lastUsed ? `${s.statusDesc} · last started ${new Date(s.lastUsed).toLocaleString()}` : s.statusDesc}
                  className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-[14px] ${
                    s.name === selected ? "bg-selection text-pane" : ""
                  }`}
                >
                  <SiteIcon />
                  <span className="flex-1 truncate">{siteHost(s)}</span>
                  <span className={`h-2 w-2 rounded-full ${dotClass(s)}`} />
                </button>
              </li>
            ))}
            {loadError && <li className="px-6 py-3 text-destructive">{loadError}</li>}
            {!loadError && sites.length === 0 && <li className="px-6 py-3 text-muted-foreground">Loading projects…</li>}
          </ul>

          <div className="relative flex min-h-0 flex-1 flex-col px-6 py-2">
            {site ? (
              <>
                <button
                  aria-label="Open terminal (ddev ssh)"
                  title={`ddev ssh in ${settings.terminal}`}
                  onClick={() => quick("Terminal", () => ddev.openTerminal(site.name, settings.terminal))}
                  className="mac-btn absolute right-0 top-12 !px-2 py-1"
                >
                  <SquareTerminal className="h-4 w-4" />
                </button>
                <dl className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-4 text-[15px]">
                  <dt className="text-right">Local site</dt>
                  <dd className="flex items-center gap-4">
                    <a className="text-link underline" href={siteUrl(site)} target="_blank" rel="noreferrer">
                      {siteUrl(site)}
                    </a>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={site.https} onChange={(e) => setHttps(e.target.checked)} />
                      Use https
                    </label>
                  </dd>
                  <dt className="text-right">Local code:</dt>
                  <dd className="truncate">
                    <button
                      className="text-link underline"
                      title={`Open ${site.approot}`}
                      onClick={() => quick("Open folder", () => ddev.revealCode(site.name))}
                    >
                      {site.shortroot || site.approot}
                    </button>
                  </dd>
                  <dt className="text-right">Database</dt>
                  <dd>
                    {details ? details.database : <Muted title={detailsError ?? undefined}>{detailsError ? "unavailable" : "…"}</Muted>}
                  </dd>
                  <dt className="text-right">Type</dt>
                  <dd>{site.type || <Muted>unknown</Muted>}</dd>
                  <dt className="text-right">PHP</dt>
                  <dd>
                    <select
                      className="mac-btn !pl-2"
                      value={details?.phpVersion ?? ""}
                      disabled={!details || busy}
                      title={running ? "Changing PHP reconfigures and restarts the project" : "Changing PHP applies at the next start"}
                      onChange={(e) => {
                        const version = e.target.value;
                        runJob("php", (onLine) => ddev.setPhp(site.name, version, onLine));
                      }}
                    >
                      {!details && <option value="">{detailsError ? "unavailable" : "…"}</option>}
                      {details && !PHP_VERSIONS.includes(details.phpVersion) && (
                        <option value={details.phpVersion}>{phpLabel(details.phpVersion)}</option>
                      )}
                      {PHP_VERSIONS.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </dd>
                </dl>
                <div className="mt-6 flex justify-center gap-3 text-[14px]">
                  <a className="mac-btn" href={siteUrl(site)} target="_blank" rel="noreferrer">Open in browser</a>
                  <a className="mac-btn" href={site.mailpitUrl} target="_blank" rel="noreferrer">Open Mailpit</a>
                  {running && details?.hasDatabase ? (
                    <a className="mac-btn" href={ddev.exportUrl(site.name)} download>Export database…</a>
                  ) : (
                    <button className="mac-btn" disabled title={running ? "This project has no database container" : "Start the project first"}>
                      Export database…
                    </button>
                  )}
                </div>
                {job && job.site === site.name && (
                  <JobLog job={job} onClose={() => setJob(null)} />
                )}
              </>
            ) : (
              <p className="mt-20 text-center text-muted-foreground">
                {loadError ? "ddev-desktop could not list your projects." : "No site selected."}
              </p>
            )}
          </div>
        </div>

        <div className="relative flex items-center gap-2 px-3 py-3 text-[15px]">
          <button className="mac-btn" aria-label="New site" onClick={() => setDialog("new")}>+</button>
          <button className="mac-btn" aria-label="Remove site" disabled={!site || busy} onClick={() => setDialog("remove")}>-</button>
          <button className="mac-btn ml-2 w-32" onClick={() => setMenu((m) => !m)}>More</button>
          {menu && (
            <div className="absolute bottom-12 left-2 z-10 w-60 rounded-lg bg-titlebar p-1 shadow-window" onMouseLeave={() => setMenu(false)}>
              {[
                ["New Drupal site…", "new"],
                ["Import local site…", "import"],
                ["Settings…", "settings"],
              ].map(([label, d]) => (
                <button
                  key={d}
                  onClick={() => { setMenu(false); setDialog(d as Dialog); }}
                  className="block w-full rounded-md px-3 py-1 text-left hover:bg-mac-blue hover:text-pane"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {notice && <span className="ml-3 truncate text-destructive" title={notice}>{notice}</span>}
          <div className="ml-auto flex items-center gap-4">
            <Light on={details ? details.web === "running" : running} label="Web" />
            <Light on={details ? details.db === "running" : running} label="Database" />
            <button
              className="mac-btn w-32"
              disabled={!site || busy}
              onClick={() =>
                site && (running
                  ? runJob("stop", (onLine) => ddev.stop(site.name, onLine))
                  : runJob("start", (onLine) => ddev.start(site.name, onLine)))
              }
            >
              {busy ? busyLabel(job?.label) : running ? "Stop" : "Start"}
            </button>
          </div>
        </div>
      </div>

      {(dialog === "new" || dialog === "import") && (
        <Modal title={dialog === "new" ? "New Drupal site" : "Import local site"} onClose={() => setDialog(null)}>
          <p className="mb-6 text-muted-foreground">
            Creating and importing sites arrives in sprint 3. Until then, run <code>ddev config</code> in the
            codebase folder and the project appears here.
          </p>
          <Footer onCancel={() => setDialog(null)} onOk={() => setDialog(null)} />
        </Modal>
      )}
      {dialog === "remove" && site && (
        <RemoveDialog
          site={site}
          hasDatabase={details?.hasDatabase ?? true}
          onCancel={() => setDialog(null)}
          onOk={(snapshot) => {
            setDialog(null);
            runJob("delete", (onLine) => ddev.remove(site.name, snapshot, onLine));
          }}
        />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          initial={settings}
          sites={sites}
          selected={selected}
          onCancel={() => setDialog(null)}
          onOk={(s) => { setSettings(s); ddev.saveSettings(s); setDialog(null); }}
        />
      )}
    </div>
  );
}

function busyLabel(label?: string) {
  switch (label) {
    case "stop": return "Stopping…";
    case "start": return "Starting…";
    case "php": return "Restarting…";
    case "delete": return "Removing…";
    default: return "Working…";
  }
}

function RemoveDialog({ site, hasDatabase, onCancel, onOk }: {
  site: Site; hasDatabase: boolean; onCancel: () => void; onOk: (snapshot: boolean) => void;
}) {
  const [snapshot, setSnapshot] = useState(true);
  return (
    <Modal title="Remove site" onClose={onCancel}>
      <p className="mb-3">
        Remove <b>{site.name}</b> from DDEV? This runs <code>ddev delete</code>: the containers and the
        database go away. Your code folder (<code>{site.shortroot || site.approot}</code>) is never touched.
      </p>
      {hasDatabase && (
        <label className="mb-6 flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={snapshot} onChange={(e) => setSnapshot(e.target.checked)} />
          <span>
            Keep a database snapshot first (saved under <code>.ddev/db_snapshots/</code>; restore later with{" "}
            <code>ddev snapshot restore</code>)
          </span>
        </label>
      )}
      <Footer onCancel={onCancel} onOk={() => onOk(hasDatabase && snapshot)} okLabel="Remove" />
    </Modal>
  );
}

/** Live output of a ddev command, under the site details. */
function JobLog({ job, onClose }: { job: Job; onClose: () => void }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [job.lines.length, job.done]);
  const what = `${job.label} ${job.site}`;
  const status = !job.done
    ? `Running ${what}…`
    : job.ok
      ? `${what} finished`
      : `${what} failed: ${job.error}`;
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between text-[13px]">
        <span className={job.done && !job.ok ? "text-destructive" : "text-muted-foreground"}>{status}</span>
        {job.done && (
          <button className="text-link underline" onClick={onClose}>Hide</button>
        )}
      </div>
      <pre
        ref={ref}
        className="mt-1 min-h-0 flex-1 overflow-auto rounded-md border border-border bg-pane p-2 font-mono text-[12px] leading-snug whitespace-pre-wrap"
      >
        {job.lines.join("\n")}
      </pre>
    </div>
  );
}

function Muted({ children, title }: { children: ReactNode; title?: string }) {
  return <span className="text-muted-foreground" title={title}>{children}</span>;
}

function TitleBar({ title, children, onClose }: { title: string; children?: ReactNode; onClose?: () => void }) {
  return (
    <div className="relative flex h-11 shrink-0 items-center justify-center border-b border-border bg-titlebar">
      <div className="absolute left-4 flex gap-2">
        <button aria-label="Close" onClick={onClose} className="h-3 w-3 rounded-full bg-light-red" />
        <span className="h-3 w-3 rounded-full bg-light-yellow" />
        <span className="h-3 w-3 rounded-full bg-light-green" />
      </div>
      <span className="text-[14px] font-semibold text-muted-foreground">{title}</span>
      {children}
    </div>
  );
}

function SiteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" transform="rotate(-20 12 12)" className="fill-pane stroke-status-off" strokeWidth="1.2" />
    </svg>
  );
}

function Light({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-4 w-4 rounded-full border border-border ${on ? "bg-light-green" : "bg-status-off"}`} />
      {label}
    </span>
  );
}

function Modal({ title, children, onClose, width = "max-w-xl" }: { title: string; children: ReactNode; onClose: () => void; width?: string }) {
  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center bg-foreground/10 pt-28">
      <div className={`w-full ${width} overflow-hidden rounded-xl bg-window shadow-window`}>
        <TitleBar title={title} onClose={onClose} />
        <div className="p-5 text-[14px]">{children}</div>
      </div>
    </div>
  );
}

function Footer({ onCancel, onOk, okLabel = "OK", disabled }: { onCancel: () => void; onOk: () => void; okLabel?: string; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-4">
      <button className="mac-btn w-28" onClick={onCancel}>Cancel</button>
      <button className="mac-btn-primary w-28 disabled:opacity-50" onClick={onOk} disabled={disabled}>{okLabel}</button>
    </div>
  );
}
