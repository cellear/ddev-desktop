import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { Button } from "@/components/ui/button";
import { ddev, DDEV_DEFAULT_PORTS, PHP_VERSIONS, siteUrl, type Settings, type Site } from "@/lib/ddev";

const tabs = ["General", "Ports", "Config", "Logs"] as const;

/**
 * Settings. General and Config hold the panel's own preferences (saved by
 * the daemon); Ports edits DDEV's global config through `ddev config
 * global`; Config's Edit/Open buttons and the Logs tab act at once, OK or
 * not.
 */
export function SettingsDialog({ initial, sites, selected, onCancel, onOk }: {
  initial: Settings;
  sites: Site[];
  selected: string | null;
  onCancel: () => void;
  onOk: (settings: Settings) => void;
}) {
  const [settings, setSettings] = useState(initial);
  const [project, setProject] = useState(selected ?? sites[0]?.name ?? "");
  const [note, setNote] = useState<string | null>(null);
  const site = sites.find((item) => item.name === project);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const row = "grid gap-2 sm:grid-cols-[145px_minmax(0,1fr)] sm:items-center sm:gap-4";
  const portsChanged =
    settings.httpPort !== initial.httpPort || settings.httpsPort !== initial.httpsPort || settings.tld !== initial.tld;
  const substituted =
    !!settings.activeHttpPort &&
    (settings.activeHttpPort !== initial.httpPort || settings.activeHttpsPort !== initial.httpsPort);

  const open = (what: "config" | "php" | "mysql" | "global") =>
    ddev.edit(what, what === "global" ? "" : project)
      .then((r) => setNote(`Opened ${r.path}`))
      .catch((e: Error) => setNote(`Could not open: ${e.message}`));

  const projectPicker = (
    <div className={row}>
      <label htmlFor="settings-project">Site</label>
      <select id="settings-project" className="mac-btn min-w-0 w-full" value={project} onChange={(event) => setProject(event.target.value)} disabled={!sites.length}>
        {!sites.length && <option value="">No sites</option>}
        {sites.map((item) => <option key={item.name} value={item.name}>{item.name}{item.status === "running" ? "" : ` (${item.status})`}</option>)}
      </select>
    </div>
  );
  const fileRow = (label: string, path: string, what: "config" | "php" | "mysql" | "global", verb: string) => (
    <div key={label} className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-3">
      <span>{label}</span>
      <input aria-label={`${label} configuration path`} className="mac-input min-w-0 w-full" value={path} readOnly />
      <Button type="button" variant="macLink" className="h-auto p-0" onClick={() => open(what)}>{verb}</Button>
    </div>
  );

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-foreground/10" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-40 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[740px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-window font-sans text-[14px] text-foreground shadow-window">
          <div className="relative flex h-11 shrink-0 items-center justify-center border-b border-border bg-titlebar">
            <Dialog.Close asChild><Button variant="ghost" aria-label="Close Settings" className="absolute left-4 h-3 w-3 rounded-full bg-light-red p-0 hover:bg-light-red" /></Dialog.Close>
            <span aria-hidden className="absolute left-9 h-3 w-3 rounded-full bg-status-off/30" />
            <span aria-hidden className="absolute left-14 h-3 w-3 rounded-full bg-status-off/30" />
            <Dialog.Title className="font-semibold">Settings</Dialog.Title>
          </div>
          <form className="flex min-h-0 flex-col" onSubmit={(event) => { event.preventDefault(); onOk(settings); }}>
            <Tabs.Root defaultValue="General" className="min-h-0 overflow-auto px-5 pt-5 sm:px-6">
              <Tabs.List aria-label="Settings sections" className="relative z-10 mx-auto flex w-fit max-w-full rounded-md bg-selection p-0.5">
                {tabs.map((tab) => <Tabs.Trigger key={tab} value={tab} asChild><Button variant="ghost" className="h-7 rounded px-3 font-normal text-foreground data-[state=active]:bg-pane data-[state=active]:shadow-sm sm:px-5">{tab}</Button></Tabs.Trigger>)}
              </Tabs.List>
              <div className="-mt-3 min-h-[330px] rounded-md border border-border bg-selection/35 px-4 pb-6 pt-8 sm:min-h-[380px] sm:px-5">
                <Tabs.Content value="General" className="space-y-4">
                  <div className={row}><label htmlFor="settings-terminal">Terminal</label><select id="settings-terminal" className="mac-btn w-fit" value={settings.terminal} onChange={(event) => set("terminal", event.target.value as Settings["terminal"])}><option>Terminal</option><option>iTerm2</option><option>Warp</option></select></div>
                  <div className="space-y-3 pt-3">
                    <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={settings.startOnLaunch} onChange={(event) => set("startOnLaunch", event.target.checked)} />Start the sites that were running when DDEV Desktop last quit</label>
                    <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={settings.stopOnQuit} onChange={(event) => set("stopOnQuit", event.target.checked)} />When quitting, stop the sites this panel started</label>
                  </div>
                  <p className="pt-2 text-muted-foreground">Sites started from a terminal or another tool are left alone either way; DDEV Desktop never runs <code>ddev poweroff</code>.</p>
                </Tabs.Content>
                <Tabs.Content value="Ports" className="space-y-4">
                  <div className={row}><label htmlFor="settings-http">HTTP port</label><input id="settings-http" type="number" min={1} max={65535} required className="mac-input w-28" value={settings.httpPort} onChange={(event) => set("httpPort", event.target.value)} /></div>
                  <div className={row}><label htmlFor="settings-https">HTTPS port</label><input id="settings-https" type="number" min={1} max={65535} required className="mac-input w-28" value={settings.httpsPort} onChange={(event) => set("httpsPort", event.target.value)} /></div>
                  <div className={row}><label htmlFor="settings-domain">Domain (TLD)</label><input id="settings-domain" className="mac-input min-w-0" required value={settings.tld} onChange={(event) => set("tld", event.target.value)} /></div>
                  <div className="flex justify-end pt-1"><Button type="button" variant="mac" className="h-7 font-normal" onClick={() => setSettings((current) => ({ ...current, ...DDEV_DEFAULT_PORTS }))}>Revert to defaults</Button></div>
                  <div className="space-y-2 text-muted-foreground">
                    <p>These are DDEV's global settings (<code>ddev config global</code>). A change applies to each site when it is next started; running sites keep their current address until then.</p>
                    {substituted && <p>Ports {initial.httpPort} and {initial.httpsPort} are in use by another program on this machine, so DDEV's router is currently on <strong className="font-semibold text-foreground">{settings.activeHttpPort}</strong> and <strong className="font-semibold text-foreground">{settings.activeHttpsPort}</strong>.</p>}
                    {!substituted && settings.activeHttpPort && <p>The router is listening on {settings.activeHttpPort} and {settings.activeHttpsPort}.</p>}
                    {settings.tld !== "ddev.site" && <p>A domain other than ddev.site is not in public DNS: each site needs a line in /etc/hosts, which DDEV asks for when you run <code>ddev start</code> in a terminal. This panel runs ddev without a terminal and cannot add them.</p>}
                    {portsChanged && <p className="text-foreground">OK will run <code>ddev config global</code> with the changed values.</p>}
                  </div>
                </Tabs.Content>
                <Tabs.Content value="Config" className="space-y-5">
                  <div className={row}><label htmlFor="settings-php" className="font-semibold">PHP for new sites</label><select id="settings-php" className="mac-btn w-fit" value={settings.defaultPhp} onChange={(event) => set("defaultPhp", event.target.value)}><option value="">DDEV default</option>{PHP_VERSIONS.map((version) => <option key={version} value={version}>PHP {version}</option>)}</select></div>
                  {projectPicker}
                  <h2 className="pt-1 font-semibold">Project configuration</h2>
                  {site ? <div className="space-y-3">
                    {fileRow("DDEV", `${site.approot}/.ddev/config.yaml`, "config", "Edit")}
                    {fileRow("PHP", `${site.approot}/.ddev/php/`, "php", "Open")}
                    {fileRow("Database", `${site.approot}/.ddev/mysql/`, "mysql", "Open")}
                  </div> : <p className="text-muted-foreground">No site selected.</p>}
                  <h2 className="pt-1 font-semibold">Global configuration</h2>
                  {fileRow("DDEV", settings.globalConfigPath || "~/.ddev/global_config.yaml", "global", "Edit")}
                  <p className="text-muted-foreground">Edit opens the file in your default text editor; Open shows the folder (DDEV reads <code>*.ini</code> and <code>*.cnf</code> from them). Changes take effect when the site is next restarted.{note ? ` ${note}` : ""}</p>
                </Tabs.Content>
                <Tabs.Content value="Logs" className="space-y-4">
                  {projectPicker}
                  {site && (site.type.startsWith("drupal") || site.type === "backdrop") && <div className={row}><span>{site.type === "backdrop" ? "Backdrop" : "Drupal"} logs</span><a href={`${siteUrl(site)}/admin/reports/dblog`} target="_blank" rel="noreferrer" className="break-all text-link underline">{siteUrl(site)}/admin/reports/dblog</a></div>}
                  {site ? <LogView key={site.name} site={site} /> : <p className="text-muted-foreground">No site selected.</p>}
                  <label className="flex items-start gap-2 pt-1"><input type="checkbox" className="mt-0.5" checked={settings.verbose} onChange={(event) => set("verbose", event.target.checked)} />Verbose logging (the daemon logs every ddev command and how long it took)</label>
                </Tabs.Content>
              </div>
            </Tabs.Root>
            <div className="flex shrink-0 justify-end gap-4 px-5 py-5 sm:px-6">
              <Button type="button" variant="mac" className="h-7 w-24 font-normal" onClick={onCancel}>Cancel</Button>
              <Button type="submit" variant="macPrimary" className="h-7 w-24 font-normal">OK</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Container logs for one site: pick web or db, follow `ddev logs -f`. */
function LogView({ site }: { site: Site }) {
  const [service, setService] = useState<"web" | "db">("web");
  const [lines, setLines] = useState<string[]>([]);
  const [following, setFollowing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const pre = useRef<HTMLPreElement>(null);

  const end = () => {
    stop.current?.();
    stop.current = null;
    setFollowing(false);
  };
  useEffect(() => end, []);
  useEffect(() => {
    pre.current?.scrollTo({ top: pre.current.scrollHeight });
  }, [lines.length]);

  const start = () => {
    end();
    setLines([]);
    setStatus(null);
    setFollowing(true);
    stop.current = ddev.followLogs(
      site.name,
      service,
      (line) => setLines((cur) => (cur.length > 2000 ? [...cur.slice(-1500), line] : [...cur, line])),
      (r) => {
        setFollowing(false);
        setStatus(r.ok ? "ddev logs ended." : r.error);
      },
    );
  };

  const running = site.status === "running";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <select aria-label="Service" className="mac-btn w-fit" value={service} onChange={(e) => { setService(e.target.value as "web" | "db"); end(); }}>
          <option value="web">Web server</option>
          <option value="db">Database</option>
        </select>
        {following
          ? <Button type="button" variant="mac" className="h-7 font-normal" onClick={end}>Stop</Button>
          : <Button type="button" variant="mac" className="h-7 font-normal" disabled={!running} onClick={start}>View</Button>}
        <span className="text-muted-foreground">{!running ? "The site is not running." : following ? `Following ddev logs -s ${service} ${site.name}…` : status ?? ""}</span>
      </div>
      <pre ref={pre} className="h-44 overflow-auto rounded-md border border-border bg-pane p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">
        {lines.length ? lines.join("\n") : following ? "Waiting for output…" : ""}
      </pre>
    </div>
  );
}
