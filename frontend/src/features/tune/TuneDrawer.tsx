import { useState } from "react";
import { useT } from "../../shared/i18n";
import { Drawer } from "../../shared/ui";
import { useSession } from "../presets";
import { LiveTune } from "./LiveTune";
import { NasaTune } from "./NasaTune";
import type { TabId } from "./SettingsTabs";
import styles from "./tune.module.css";
import { baseFor, useTuneApply } from "./useTuneApply";

interface TuneDrawerProps {
  open: boolean;
  onClose(): void;
}

export default function TuneDrawer({ open, onClose }: TuneDrawerProps) {
  const { t } = useT();
  const source = useSession((s) => s.source);
  const presetId = useSession((s) => s.presetId);
  const custom = useSession((s) => s.custom);
  const base = baseFor(source, presetId, custom);
  const { schedule, amend, busy } = useTuneApply(base);

  // The last tab stays chosen between openings; a tab the other source lacks falls back to Sound.
  const [tab, setTab] = useState<TabId>("sound");

  return (
    <Drawer open={open} onClose={onClose} side="right" title={t("tune.title")}>
      {/* Its content exists only while open, so every opening starts from what is selected now. */}
      {open && (
        <>
          <p className={styles.status} role="status">
            {busy ? t("tune.syncing") : ""}
          </p>
          {base.source === "live" ? (
            <LiveTune key="live" base={base} schedule={schedule} tab={tab} onTab={setTab} />
          ) : (
            <NasaTune
              key="nasa"
              base={base}
              schedule={schedule}
              amend={amend}
              tab={tab}
              onTab={setTab}
            />
          )}
        </>
      )}
    </Drawer>
  );
}

export { TuneDrawer };
