import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ddev,
  PHP_VERSIONS,
  PROJECT_TYPES,
  type Check,
  type CreateSpec,
  type Settings,
} from "@/lib/ddev";

/**
 * "New Drupal site…" and "Import local site…". Both turn a folder into a
 * DDEV project; New also offers to create a fresh Drupal codebase with
 * Composer when the folder is empty or missing, Import also offers a
 * database dump. Nothing runs until the daemon's pre-flight check allows it.
 */
export function SiteDialog({ mode, settings, chooser, onCancel, onOk, Modal, Footer }: {
  mode: "new" | "import";
  settings: Settings;
  chooser: boolean;
  onCancel: () => void;
  onOk: (spec: CreateSpec) => void;
  Modal: (p: { title: string; children: ReactNode; onClose: () => void; width?: string }) => ReactNode;
  Footer: (p: { onCancel: () => void; onOk: () => void; okLabel?: string; disabled?: boolean }) => ReactNode;
}) {
  const [approot, setApproot] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [type, setType] = useState<string>(mode === "new" ? "drupal11" : "");
  const [php, setPhp] = useState("");
  const [dbMode, setDbMode] = useState<"new" | "import">("new");
  const [dump, setDump] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  // Ask the daemon about the folder and name as the user types (debounced).
  useEffect(() => {
    if (!approot.trim()) {
      setCheck(null);
      return;
    }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const c = await ddev.check(approot, name);
        setCheck(c);
        if (!nameTouched && c.suggested_name) setName(c.suggested_name);
      } catch (e) {
        setCheck({ error: (e as Error).message } as Check);
      } finally {
        setChecking(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [approot, name, nameTouched]);

  const isDrupal = type.startsWith("drupal");
  const create = mode === "new" && !!check && (!check.exists || check.empty) && isDrupal;
  const wantsDump = mode === "import" && dbMode === "import";

  // The verdict shown under the fields, and whether OK is allowed.
  let verdict: { text: string; ok: boolean; warn?: boolean } | null = null;
  if (check?.error) verdict = { text: check.error, ok: false };
  else if (check && !check.exists) {
    verdict = isDrupal && mode === "new"
      ? { text: "Folder does not exist: it will be created and a fresh Drupal codebase installed with Composer.", ok: true, warn: true }
      : { text: "Folder not found.", ok: false };
  } else if (check && !check.is_dir) verdict = { text: "That path is a file, not a folder.", ok: false };
  else if (check && check.empty) {
    verdict = isDrupal && mode === "new"
      ? { text: "Empty folder: a fresh Drupal codebase will be installed with Composer (a few minutes).", ok: true, warn: true }
      : { text: "The folder is empty. Choose a folder that holds the code" + (mode === "new" ? ", or pick a Drupal type to create one." : "."), ok: false };
  } else if (check?.has_ddev && check.ddev_name && check.ddev_name.toLowerCase() !== name.toLowerCase()) {
    verdict = { text: `This folder is already the DDEV project “${check.ddev_name}”. Use that name to adopt it, or a different folder.`, ok: false };
  } else if (check?.name_taken) verdict = { text: `A project named “${name}” already exists.`, ok: false };
  else if (check?.has_ddev) verdict = { text: `Already configured for DDEV as “${check.ddev_name}”${check.ddev_type ? ` (${check.ddev_type})` : ""}; its settings will be kept and the project started.`, ok: true };
  else if (check) verdict = { text: `Will run ddev config in this folder${check.docroot ? ` (docroot ${check.docroot})` : ""} and start it.`, ok: true };

  const nameOk = /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
  const canOk = !!verdict?.ok && nameOk && !checking && (!wantsDump || dump.trim() !== "");
  const row = "grid grid-cols-[170px_1fr] items-center gap-3";
  const host = name ? `${name.toLowerCase()}.${settings.tld}` : "";

  const choose = async (kind: "folder" | "file") => {
    const res = await ddev.choose(kind).catch(() => undefined);
    if (!res?.path) return;
    if (kind === "folder") setApproot(res.path);
    else setDump(res.path);
  };

  const submit = () =>
    onOk({
      approot: approot.trim(),
      name,
      type,
      php,
      docroot: "",
      dump: wantsDump ? dump.trim() : "",
      create,
    });

  return (
    <Modal title={mode === "new" ? "New Drupal site" : "Import local site"} onClose={onCancel} width="max-w-2xl">
      <div className="space-y-3">
        <div className={row}>
          <label htmlFor="site-approot">Local codebase</label>
          <div className="flex gap-2">
            <input
              id="site-approot"
              ref={ref}
              className="mac-input min-w-0 flex-1"
              placeholder="~/Sites/my-site"
              value={approot}
              onChange={(e) => setApproot(e.target.value)}
            />
            {chooser && <button type="button" className="mac-btn" onClick={() => choose("folder")}>Choose…</button>}
          </div>
        </div>
        <div className={row}>
          <label htmlFor="site-name">Project name</label>
          <input
            id="site-name"
            className="mac-input"
            placeholder={check?.suggested_name || "my-site"}
            value={name}
            onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
          />
        </div>
        <div className={row}>
          <span>Local site</span>
          <span className="text-muted-foreground">{host || "—"}</span>
        </div>
        <div className={row}>
          <label htmlFor="site-type">Project type</label>
          <select id="site-type" className="mac-btn !pl-2 w-fit" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Detect automatically</option>
            {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className={row}>
          <label htmlFor="site-php">Use PHP</label>
          <select id="site-php" className="mac-btn !pl-2 w-fit" value={php} onChange={(e) => setPhp(e.target.value)}>
            <option value="">DDEV default</option>
            {PHP_VERSIONS.map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        {mode === "import" && (
          <>
            <div className={row}>
              <label htmlFor="site-db">Database</label>
              <select id="site-db" className="mac-btn !pl-2 w-fit" value={dbMode} onChange={(e) => setDbMode(e.target.value as "new" | "import")}>
                <option value="new">Start with an empty database</option>
                <option value="import">Import from a dump file</option>
              </select>
            </div>
            {dbMode === "import" && (
              <div className={row}>
                <label htmlFor="site-dump">Dump file</label>
                <div className="flex gap-2">
                  <input
                    id="site-dump"
                    className="mac-input min-w-0 flex-1"
                    placeholder="~/Downloads/db.sql.gz"
                    value={dump}
                    onChange={(e) => setDump(e.target.value)}
                  />
                  {chooser && <button type="button" className="mac-btn" onClick={() => choose("file")}>Choose…</button>}
                </div>
              </div>
            )}
          </>
        )}
        <div className={row}>
          <span />
          <p className={`min-h-[2.5em] text-[13px] ${checking || !verdict ? "text-muted-foreground" : verdict.ok ? (verdict.warn ? "text-foreground" : "text-muted-foreground") : "text-destructive"}`}>
            {checking ? "Checking…" : verdict?.text ?? (approot ? "" : "Pick the folder that holds the site's code.")}
            {!nameOk && name && <><br />Names may contain letters, digits, dots, dashes and underscores.</>}
          </p>
        </div>
      </div>
      <div className="mt-6">
        <Footer onCancel={onCancel} disabled={!canOk} onOk={submit} okLabel={create ? "Create" : mode === "new" ? "Add" : "Import"} />
      </div>
    </Modal>
  );
}
