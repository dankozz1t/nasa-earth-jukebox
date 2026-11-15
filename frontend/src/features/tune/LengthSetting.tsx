import { useT } from "../../shared/i18n";
import { Segmented, Slider } from "../../shared/ui";

type Length = "30" | "60" | "90" | "180" | "other";

const PRESET_LENGTHS = [30, 60, 90, 180];

interface LengthSettingProps {
  label: string;
  durationSec: number;
  other: boolean; // "Other" was chosen: the free slider shows even for a preset length
  onOther(other: boolean): void;
  onShow(durationSec: number): void;
  onCommit(durationSec: number): void;
}

export function LengthSetting({
  label,
  durationSec,
  other,
  onOther,
  onShow,
  onCommit,
}: LengthSettingProps) {
  const { t } = useT();
  const formatSeconds = (n: number) => `${n} ${t("unit.sec")}`;

  const value: Length =
    !other && PRESET_LENGTHS.includes(durationSec) ? (String(durationSec) as Length) : "other";

  const options = [
    ...PRESET_LENGTHS.map((n) => ({ value: String(n) as Length, label: formatSeconds(n) })),
    { value: "other" as const, label: t("tune.other") },
  ];

  return (
    <>
      <Segmented<Length>
        label={label}
        value={value}
        onChange={(v) => {
          if (v === "other") {
            onOther(true);
            return;
          }

          onOther(false);
          onCommit(Number(v));
        }}
        options={options}
      />

      {value === "other" && (
        <Slider
          label={label}
          value={durationSec}
          min={20}
          max={180}
          step={1}
          valueText={formatSeconds}
          onChange={onShow}
          onCommit={onCommit}
        />
      )}
    </>
  );
}
