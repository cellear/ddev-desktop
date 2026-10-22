import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Settings as Gear, SquareTerminal } from "lucide-react";
import { SettingsDialog } from "@/components/settings-dialog";
import {
  ddev,
  DEFAULT_SETTINGS,
  PHP_VERSIONS,
  siteHost,
  siteUrl,
  type Action,
  type Settings,
  type Site,
  type SiteDetails,
} from "@/lib/ddev";

type Dialog = null | "new" | "import" | "settings" | "remove";

/** Output of the ddev command running (or last run) for a site. */
interface Job {
  site: string;
  action: Action;
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
  // fetched when the selection or its status changes.
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
  }, [site?.name, site?.status]);

  const setHttps = (on: boolean) => {
    if (!site) return;
    ddev.setHttps(site.name, on);
    setSites(sites.map((s) => (s.name === site.name ? { ...s, https: on } : s)));
  };

  const busy = job !== null && !job.done;
  const running = site?.status === "running";

  const runAction = async (action: Action) => {
    if (!site || busy) return;
    const name = site.name;
    setJob({ site: name, action, lines: [], done: false, ok: false, error: "" });
    const result = await ddev.run(name, action, (line) =>
      setJob((j) => (j && j.site === name ? { ...j, lines: [...j.lines, line] } : j)),
    );
    setJob((j) => (j && j.site === name ? { ...j, done: true, ...result } : j));
    await refresh();
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
                  title={s.statusDesc}
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
                  title={`ddev ssh in ${settings.terminal} (coming in sprint 2)`}
                  disabled
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
                  <dd className="truncate" title={site.approot}>{site.shortroot || site.approot}</dd>
                  <dt className="text-right">Database</dt>
                  <dd>{details ? details.database : <Muted title={detailsError ?? undefined}>{detailsError ? "unavailable" : "…"}</Muted>}</dd>
                  <dt className="text-right">Type</dt>
                  <dd>{site.type || <Muted>unknown</Muted>}</dd>
                  <dt className="text-right">PHP</dt>
                  <dd>
                    <select
                      className="mac-btn !pl-2"
                      value={details?.phpVersion ?? ""}
                      disabled
                      title="Changing PHP arrives in sprint 2"
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
                  <button className="mac-btn" disabled title="Coming in sprint 2">Export database…</button>
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
          <button className="mac-btn" aria-label="Remove site" disabled={!site} onClick={() => setDialog("remove")}>-</button>
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
          {notice && <span className="ml-3 text-muted-foreground">{notice}</span>}
          <div className="ml-auto flex items-center gap-4">
            <Light on={details ? details.web === "running" : running} label="Web" />
            <Light on={details ? details.db === "running" : running} label="Database" />
            <button className="mac-btn w-32" disabled={!site || busy} onClick={() => runAction(running ? "stop" : "start")}>
              {busy ? (job?.action === "stop" ? "Stopping…" : "Starting…") : running ? "Stop" : "Start"}
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
        <Modal title="Remove site" onClose={() => setDialog(null)}>
          <p className="mb-6">
            Removing <b>{site.name}</b> from DDEV (<code>ddev delete</code>) arrives in sprint 2. Your code folder is
            never touched.
          </p>
          <Footer onCancel={() => setDialog(null)} onOk={() => { setDialog(null); setNotice("Remove is not wired up yet."); }} okLabel="Remove" disabled />
        </Modal>
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

/** Live output of a ddev command, under the site details. */
function JobLog({ job, onClose }: { job: Job; onClose: () => void }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [job.lines.length, job.done]);
  const status = !job.done
    ? `Running ddev ${job.action} ${job.site}…`
    : job.ok
      ? `ddev ${job.action} ${job.site} finished`
      : `ddev ${job.action} ${job.site} failed: ${job.error}`;
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
