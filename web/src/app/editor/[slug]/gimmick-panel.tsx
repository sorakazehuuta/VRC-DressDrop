"use client";

import { useMemo, useState } from "react";
import {
  defaultGimmickParams,
  gimmickConflict,
  type GimmickDefinition,
  type GimmickParam,
  type GimmickParamValue,
  type GimmickSelection,
} from "@/lib/gimmicks/schema";
import { Slider } from "./controls";

type Change = (update: (prev: GimmickSelection[]) => GimmickSelection[], commit?: boolean) => void;

export function GimmickPanel({
  defs,
  selected,
  onChange,
  onCommit,
}: {
  defs: GimmickDefinition[];
  selected: GimmickSelection[];
  onChange: Change;
  onCommit: () => void;
}) {
  const [open, setOpen] = useState(true);
  const defMap = useMemo(() => new Map(defs.map((d) => [d.slug, d])), [defs]);
  const categories = useMemo(() => {
    const map = new Map<string, GimmickDefinition[]>();
    for (const d of [...defs].sort((a, b) => a.sortOrder - b.sortOrder)) map.set(d.category, [...(map.get(d.category) ?? []), d]);
    return [...map.entries()];
  }, [defs]);
  const total = selected.reduce((sum, s) => sum + (defMap.get(s.slug)?.tokenCost ?? 0), 0);

  if (defs.length === 0) return null;

  function toggle(def: GimmickDefinition, on: boolean) {
    onChange((prev) => {
      if (!on) {
        // これを外すと条件を満たさなくなるギミック（例: 持てる を外したときの 軌跡）も一緒に外す
        let next = prev.filter((s) => s.slug !== def.slug);
        let changed = true;
        while (changed) {
          changed = false;
          for (const s of next) {
            const d = defMap.get(s.slug);
            if (d && gimmickConflict(d, next, defMap)) {
              next = next.filter((x) => x.slug !== s.slug);
              changed = true;
              break;
            }
          }
        }
        return next;
      }
      return [...prev, { slug: def.slug, params: defaultGimmickParams(def) }];
    });
  }

  function setParam(slug: string, key: string, value: GimmickParamValue, commit: boolean) {
    onChange((prev) => prev.map((s) => (s.slug === slug ? { ...s, params: { ...s.params, [key]: value } } : s)), commit);
  }

  return (
    <section className="flex flex-col gap-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex cursor-pointer items-center justify-between text-left" aria-expanded={open}>
        <span className="font-semibold">ギミック（動き・演出）</span>
        <span className="text-sm text-zinc-500">
          {selected.length > 0 ? `${selected.length}個・+${total} トークン` : "なし"} {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            ギミックを使うには、ワールドの Unity プロジェクトに UdonSharp が必要です（VCC の Manage Project で追加できます）。
            見た目のプレビューには動きは反映されません。
          </p>
          {categories.map(([category, items]) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-zinc-500">{category}</h3>
              {items.map((def) => {
                const selection = selected.find((s) => s.slug === def.slug);
                const conflict = selection ? null : gimmickConflict(def, selected, defMap);
                return (
                  <div
                    key={def.slug}
                    className={`rounded-lg border p-3 ${selection ? "border-accent bg-accent-soft/40" : "border-zinc-200"} ${conflict ? "opacity-60" : ""}`}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selection)}
                        disabled={Boolean(conflict)}
                        onChange={(e) => toggle(def, e.target.checked)}
                        className="mt-1 accent-brand"
                      />
                      <span className="flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">{def.name}</span>
                          <span className="shrink-0 text-xs text-zinc-500">+{def.tokenCost} トークン</span>
                        </span>
                        <span className="block text-xs text-zinc-600">{def.description}</span>
                        {conflict && <span className="block text-xs text-zinc-500">※ {conflict}</span>}
                        {def.note && selection && <span className="mt-1 block text-xs text-amber-800">⚠ {def.note}</span>}
                      </span>
                    </label>
                    {selection && def.params.length > 0 && (
                      <div className="mt-3 flex flex-col gap-3 border-t border-zinc-200 pt-3">
                        {def.params.map((param) => (
                          <ParamInput
                            key={param.key}
                            param={param}
                            value={selection.params[param.key] ?? param.default}
                            onChange={(v, commit) => setParam(def.slug, param.key, v, commit)}
                            onCommit={onCommit}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ParamInput({
  param,
  value,
  onChange,
  onCommit,
}: {
  param: GimmickParam;
  value: GimmickParamValue;
  onChange: (value: GimmickParamValue, commit: boolean) => void;
  onCommit: () => void;
}) {
  switch (param.type) {
    case "number": {
      // 刻み幅（0.1 や 0.01）に合わせて小数の桁数を決める
      const decimals = Math.max(0, -Math.floor(Math.log10(param.step) + 1e-9));
      return (
        <Slider
          label={param.label}
          value={Number(value)}
          limits={{ min: param.min, max: param.max, step: param.step }}
          display={{ scale: 1, unit: param.unit }}
          decimals={decimals}
          onChange={(v) => onChange(v, false)}
          onCommit={onCommit}
        />
      );
    }
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked, true)} className="accent-brand" />
          {param.label}
        </label>
      );
    case "color":
      return (
        <label className="flex items-center gap-3 text-sm">
          <input
            type="color"
            value={String(value)}
            onChange={(e) => onChange(e.target.value, false)}
            onBlur={onCommit}
            className="h-8 w-12 cursor-pointer rounded border border-zinc-300 bg-transparent"
          />
          <span>{param.label}</span>
        </label>
      );
    case "select":
      return (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{param.label}</span>
          <select
            value={String(value)}
            onChange={(e) => onChange(e.target.value, true)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            {param.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
  }
}
