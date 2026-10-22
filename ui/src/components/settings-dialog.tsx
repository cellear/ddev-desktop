import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { Button } from "@/components/ui/button";
import { DEFAULT_SETTINGS, PHP_VERSIONS, siteUrl, type Settings, type Site } from "@/lib/ddev";

const tabs = ["General", "Ports", "Config", "Logs"] as const;

export function SettingsDialog({ initial, sites, selected, onCancel, onOk }: {
  initial: Settings;
  sites: Site[];
  selected: string | null;
  onCancel: () => void;
  onOk: (settings: Settings) => void;
}) {
  const [settings, setSettings] = useState(initial);
  const [project, setProject] = useState(selected ?? sites[0]?.name ?? "");
  const site = sites.find((item) => item.name === project);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const row = "grid gap-2 sm:grid-cols-[145px_minmax(0,1fr)] sm:items-center sm:gap-4";
  const projectPicker = (
    <div className={row}>
      <label htmlFor="settings-project">Site</label>
      <select id="settings-project" className="mac-btn min-w-0 w-full" value={project} onChange={(event) => setProject(event.target.value)} disabled={!sites.length}>
        {!sites.length && <option value="">No sites</option>}
        {sites.map((item) => <option key={item.name} value={item.name}>{item.name}.{settings.tld}</option>)}
      </select>
    </div>
  );
  const fileRow = (label: string, path: string) => (
    <div key={label} className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-3">
      <span>{label}</span>
      <input aria-label={`${label} configuration path`} className="mac-input min-w-0 w-full" value={path} readOnly />
      <span title="Requires the local DDEV helper"><Button variant="macLink" className="h-auto p-0" disabled>Edit</Button></span>
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
                    <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={settings.startOnLaunch} onChange={(event) => set("startOnLaunch", event.target.checked)} />Start running sites when opening DDEV Desktop</label>
                    <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={settings.stopOnQuit} onChange={(event) => set("stopOnQuit", event.target.checked)} />Stop all sites when quitting</label>
                  </div>
                </Tabs.Content>
                <Tabs.Content value="Ports" className="space-y-4">
                  <div className={row}><label htmlFor="settings-http">HTTP port</label><input id="settings-http" type="number" min={1} max={65535} required className="mac-input w-28" value={settings.httpPort} onChange={(event) => set("httpPort", Number(event.target.value))} /></div>
                  <div className={row}><label htmlFor="settings-https">HTTPS port</label><input id="settings-https" type="number" min={1} max={65535} required className="mac-input w-28" value={settings.httpsPort} onChange={(event) => set("httpsPort", Number(event.target.value))} /></div>
                  <div className={row}><label htmlFor="settings-domain">Domain (TLD)</label><input id="settings-domain" className="mac-input min-w-0" required value={settings.tld} onChange={(event) => set("tld", event.target.value)} /></div>
                  <div className="flex justify-end pt-3"><Button type="button" variant="mac" className="h-7 font-normal" onClick={() => setSettings((current) => ({ ...current, httpPort: DEFAULT_SETTINGS.httpPort, httpsPort: DEFAULT_SETTINGS.httpsPort, tld: DEFAULT_SETTINGS.tld }))}>Revert to defaults</Button></div>
                </Tabs.Content>
                <Tabs.Content value="Config" className="space-y-5">
                  <div className={row}><label htmlFor="settings-php" className="font-semibold">Default PHP version</label><select id="settings-php" className="mac-btn w-fit" value={settings.defaultPhp} onChange={(event) => set("defaultPhp", event.target.value)}>{PHP_VERSIONS.map((version) => <option key={version} value={version}>PHP {version}</option>)}</select></div>
                  {projectPicker}
                  <h2 className="pt-1 font-semibold">Project configuration</h2>
                  {site ? <div className="space-y-3">
                    {fileRow("DDEV", `${site.approot}/.ddev/config.yaml`)}
                    {fileRow("PHP", `${site.approot}/.ddev/php/`)}
                    {fileRow("Database", `${site.approot}/.ddev/mysql/`)}
                  </div> : <p className="text-muted-foreground">No site selected.</p>}
                  <p className="text-muted-foreground">Local helper not connected. Configuration files are unavailable.</p>
                </Tabs.Content>
                <Tabs.Content value="Logs" className="space-y-5">
                  {projectPicker}
                  {site && (site.type.startsWith("drupal") || site.type === "backdrop") && <div className={row}><span>{site.type === "backdrop" ? "Backdrop" : "Drupal"} logs</span><a href={`${siteUrl(site, settings)}/admin/reports/dblog`} target="_blank" rel="noreferrer" className="break-all text-link underline">{siteUrl(site, settings)}/admin/reports/dblog</a></div>}
                  <div className="space-y-3">
                    {["Web server", "Database"].map((label) => <div key={label} className="grid grid-cols-[145px_minmax(0,1fr)_auto] items-center gap-3"><span>{label}</span><span className="text-muted-foreground">Unavailable</span><span title="Requires the local DDEV helper"><Button variant="macLink" className="h-auto p-0" disabled>View</Button></span></div>)}
                  </div>
                  <p className="text-muted-foreground">Local helper not connected. Live logs are unavailable.</p>
                  <label className="flex items-start gap-2 pt-2"><input type="checkbox" className="mt-0.5" checked={settings.verbose} onChange={(event) => set("verbose", event.target.checked)} />Verbose logging</label>
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