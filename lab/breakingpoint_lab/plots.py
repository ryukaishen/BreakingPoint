"""Publication-quality validation figures (matplotlib, headless)."""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Sequence

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.ticker import MaxNLocator  # noqa: E402

MODE_COLORS = {"ewma": "#4C78A8", "cusum": "#F58518", "combined": "#54A24B", "consecutive": "#B279A2"}
MODE_LABELS = {"ewma": "EWMA only", "cusum": "CUSUM only", "combined": "EWMA + CUSUM", "consecutive": "Consecutive threshold"}
SELECTED_COLOR = "#E45756"
INK = "#1F2430"
MUTED = "#6B7280"
GRID = "#E5E7EB"
STATE_COLORS = {"STABLE": "#22C55E", "DRIFT": "#F59E0B", "BREAKPOINT": "#EF4444"}
DETECTOR_STYLES = [
    ("#E45756", "-", "o"), ("#4C78A8", "--", "s"), ("#F58518", "--", "^"), ("#54A24B", "--", "D"),
    ("#B279A2", ":", "v"), ("#9CA3AF", ":", "x"), ("#0EA5E9", "-.", "P"), ("#A16207", "-.", "*"),
]


def setup_style() -> None:
    plt.rcParams.update({
        "figure.dpi": 110, "savefig.dpi": 220, "savefig.bbox": "tight", "savefig.facecolor": "white",
        "font.family": "DejaVu Sans", "font.size": 10, "axes.titlesize": 11.5, "axes.titleweight": "bold",
        "axes.labelsize": 10, "axes.edgecolor": "#9CA3AF", "axes.labelcolor": INK, "axes.titlecolor": INK,
        "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.color": GRID,
        "grid.linewidth": 0.8, "xtick.color": MUTED, "ytick.color": MUTED, "legend.frameon": False,
        "legend.fontsize": 8.5, "figure.facecolor": "white", "axes.facecolor": "white",
    })


def _save(fig, out: Path, name: str) -> List[str]:
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for ext in ("png", "pdf"):
        p = out / f"{name}.{ext}"
        fig.savefig(p)
        paths.append(str(p))
    plt.close(fig)
    return paths


def _footnote(fig, text: str) -> None:
    fig.text(0.01, -0.02, text, fontsize=7.5, color=MUTED, ha="left", va="top")


# --------------------------------------------------------------------------
def detection_tradeoff(metrics: Dict[str, np.ndarray], grid: Sequence[dict], selected: tuple, out: Path,
                       baselines: Dict[str, tuple], n_sessions: int) -> List[str]:
    """FPR vs mean detection delay for every configuration (held-out split)."""
    setup_style()
    fig, ax = plt.subplots(figsize=(8.2, 5.4))
    fpr = metrics["fpr"] * 100
    delay = metrics["mean_delay"]
    miss = metrics["miss"] * 100
    V, C = fpr.shape
    modes = np.array([g["mode"] for g in grid])
    for mode in ("consecutive", "ewma", "cusum", "combined"):
        mk = modes == mode
        x = fpr[:, mk].ravel()
        y = delay[:, mk].ravel()
        ok = np.isfinite(x) & np.isfinite(y)
        ax.scatter(x[ok], y[ok], s=7, alpha=0.22, color=MODE_COLORS[mode], label=MODE_LABELS[mode],
                   rasterized=True, linewidths=0)
    # Pareto frontier over all configs (min FPR, min delay)
    xs, ys = fpr.ravel(), delay.ravel()
    ok = np.isfinite(xs) & np.isfinite(ys)
    order = np.argsort(xs[ok])
    px, py, best = [], [], np.inf
    for xv, yv in zip(xs[ok][order], ys[ok][order]):
        if yv < best:
            px.append(xv)
            py.append(yv)
            best = yv
    ax.step(px, py, where="post", color=INK, lw=1.2, alpha=0.8, label="Pareto frontier")
    ax.axvspan(0, 5, color="#22C55E", alpha=0.06, lw=0)
    ax.axvline(5, color="#16A34A", lw=1, ls="--")
    ax.text(5.15, ax.get_ylim()[1] * 0.97 if ax.get_ylim()[1] > 0 else 1, "5% FPR limit", color="#16A34A",
            fontsize=8, va="top")
    for label, (v, c) in baselines.items():
        ax.scatter(fpr[v, c], delay[v, c], s=55, marker="X", color="#374151", zorder=5)
        ax.annotate(label, (fpr[v, c], delay[v, c]), xytext=(6, 4), textcoords="offset points", fontsize=8, color="#374151")
    v, c = selected
    ax.scatter(fpr[v, c], delay[v, c], s=260, marker="*", color=SELECTED_COLOR, edgecolor="white", lw=1.2, zorder=6,
               label="Selected (BreakingPoint)")
    ax.annotate(f"Selected\nFPR {fpr[v, c]:.1f}% · miss {miss[v, c]:.1f}%\nmean delay {delay[v, c]:.2f} reps",
                (fpr[v, c], delay[v, c]), xytext=(70, 95), textcoords="offset points", fontsize=8.5, color=SELECTED_COLOR,
                fontweight="bold", bbox=dict(boxstyle="round,pad=0.35", fc="white", ec=SELECTED_COLOR, lw=0.8),
                arrowprops=dict(arrowstyle="-", color=SELECTED_COLOR, lw=0.9), zorder=7)
    ax.set_xlabel("False-positive rate on no-change sessions (%)")
    ax.set_ylabel("Mean detection delay (reps after true change)")
    ax.set_title("Detection trade-off across all tested detector configurations")
    ax.set_xlim(left=0)
    ax.set_xlim(right=min(60, max(10, np.nanpercentile(xs, 97))))
    ax.set_ylim(bottom=0)
    leg = ax.legend(loc="upper right", ncol=1, markerscale=2.2)
    for h in leg.legend_handles:
        h.set_alpha(1)
    _footnote(fig, f"Held-out evaluation split, {n_sessions:,} sessions · each dot = one (detector, drift-score variant) configuration")
    return _save(fig, out, "detection_tradeoff")


def robustness(rows: List[dict], experiment: str, out: Path, xlabel: str, title: str, name: str,
               note: str = "") -> List[str]:
    setup_style()
    rows = [r for r in rows if r["experiment"] == experiment]
    labels = list(dict.fromkeys(r["detector"] for r in rows))
    fig, axes = plt.subplots(1, 3, figsize=(13, 4.0))
    for i, lab in enumerate(labels):
        col, ls, mk = DETECTOR_STYLES[i % len(DETECTOR_STYLES)]
        rr = sorted([r for r in rows if r["detector"] == lab], key=lambda r: r["level"])
        x = np.array([r["level"] for r in rr])
        for ax, key, scale in ((axes[0], "fpr", 100), (axes[1], "tpr", 100)):
            y = np.array([r[key] for r in rr]) * scale
            lo = np.array([r[f"{key}_lo"] for r in rr]) * scale
            hi = np.array([r[f"{key}_hi"] for r in rr]) * scale
            ax.plot(x, y, ls=ls, marker=mk, color=col, lw=1.8 if i == 0 else 1.3, ms=4.5, label=lab)
            ax.fill_between(x, lo, hi, color=col, alpha=0.12 if i == 0 else 0.06, lw=0)
        y = np.array([r["median_delay"] for r in rr], dtype=float)
        axes[2].plot(x, y, ls=ls, marker=mk, color=col, lw=1.8 if i == 0 else 1.3, ms=4.5, label=lab)
    axes[0].axhline(5, color="#16A34A", ls="--", lw=1)
    axes[0].set_ylabel("False-positive rate (%)")
    axes[0].set_title("False alarms (no true change)")
    axes[1].set_ylabel("Detection rate (%)")
    axes[1].set_title("Detection of gradual fatigue drift")
    axes[1].set_ylim(0, 102)
    axes[2].set_ylabel("Median detection delay (reps)")
    axes[2].set_title("Speed of detection")
    fig.supxlabel(xlabel, fontsize=10, color=INK, y=0.02)
    axes[0].set_ylim(bottom=0)
    axes[2].set_ylim(bottom=0)
    axes[2].legend(loc="upper left", bbox_to_anchor=(1.02, 1.0))
    fig.suptitle(title, fontweight="bold", color=INK, x=0.01, ha="left", y=1.03)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    _footnote(fig, (note + " · " if note else "") + "Shaded bands: Wilson 95% confidence intervals")
    return _save(fig, out, name)


def changepoint_accuracy(tau: np.ndarray, onset: np.ndarray, alarm: np.ndarray, scen_label: np.ndarray, out: Path,
                         seed: int) -> List[str]:
    setup_style()
    rng = np.random.default_rng(seed)
    fig, axes = plt.subplots(1, 3, figsize=(13.2, 4.3))
    det = (alarm >= tau) & (alarm > 0) & (tau > 0)
    t, o, a, sl = tau[det], onset[det], alarm[det], scen_label[det]
    jit = lambda n: rng.uniform(-0.28, 0.28, n)  # noqa: E731
    cmap = {"C · Gradual fatigue drift": "#4C78A8", "D · Sudden change": "#F58518", "H · Drift then recovery": "#54A24B"}
    lim = (0, max(t.max(initial=1), o.max(initial=1), a.max(initial=1)) + 1)
    for lab, colr in cmap.items():
        mk = sl == lab
        axes[0].scatter(t[mk] + jit(mk.sum()), o[mk] + jit(mk.sum()), s=6, alpha=0.25, color=colr, label=lab,
                        rasterized=True, linewidths=0)
        axes[1].scatter(t[mk] + jit(mk.sum()), a[mk] + jit(mk.sum()), s=6, alpha=0.25, color=colr, label=lab,
                        rasterized=True, linewidths=0)
    for ax in axes[:2]:
        ax.plot(lim, lim, color=INK, lw=1, ls="--")
        ax.set_xlim(lim)
        ax.set_ylim(lim)
        ax.set_xlabel("True simulated change-point (rep)")
    axes[0].set_ylabel("Estimated drift onset (rep)")
    axes[0].set_title("Change-point (onset) estimate")
    axes[1].set_ylabel("BreakingPoint alarm (rep)")
    axes[1].set_title("Alarm rep vs true change")
    axes[0].legend(loc="upper left", markerscale=3)
    err = np.abs(o - t)
    delay = a - t
    bins = np.arange(0, max(12, int(np.percentile(delay, 99)) + 2)) - 0.5
    axes[2].hist(err, bins=bins, alpha=0.75, color="#4C78A8", label=f"|onset − true|  (median {np.median(err):.0f})")
    axes[2].hist(delay, bins=bins, alpha=0.55, color=SELECTED_COLOR, label=f"alarm − true  (median {np.median(delay):.0f})")
    axes[2].set_xlabel("Reps")
    axes[2].set_ylabel("Detected sessions")
    axes[2].set_title("Localization error vs detection delay")
    axes[2].legend(loc="upper right")
    _footnote(fig, f"Selected detector, detected drift sessions only (n = {det.sum():,}); points jittered ±0.3 rep for visibility")
    fig.tight_layout()
    return _save(fig, out, "changepoint_accuracy")


def scenario_examples(traces: List[dict], out: Path, seed_note: str) -> List[str]:
    setup_style()
    n = len(traces)
    cols = 3
    rows = int(np.ceil(n / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(13.5, 3.6 * rows), squeeze=False)
    for ax, tr in zip(axes.ravel(), traces):
        reps = np.arange(1, len(tr["score"]) + 1)
        sc = np.array([np.nan if s is None else s for s in tr["score"]], dtype=float)
        colors = [STATE_COLORS[s] for s in tr["state"]]
        ax.axhspan(0, tr["normal_upper"], color="#22C55E", alpha=0.07, lw=0)
        ax.bar(reps, np.nan_to_num(sc), color=colors, alpha=0.85, width=0.72)
        for r in reps[np.isnan(sc)]:
            ax.text(r, 0.05, "×", ha="center", va="bottom", color=MUTED, fontsize=8)
        ax.plot(reps, tr["ewma_level"], color=INK, lw=1.6, label="EWMA (smoothed drift)")
        ax.axhline(tr["warning_level"], color="#F59E0B", ls="--", lw=1, label="Warning level")
        ax.axhline(tr["breakpoint_level"], color="#EF4444", ls="--", lw=1, label="BreakingPoint level")
        if tr["tau"]:
            ax.axvline(tr["tau"] - 0.5, color="#2563EB", lw=1.6, ls=":", label="True change")
        if tr["onset"]:
            ax.axvline(tr["onset"] - 0.5, color="#7C3AED", lw=1.2, ls="-.", label="Estimated onset")
        if tr["alarm"]:
            ax.axvline(tr["alarm"], color="#EF4444", lw=2.0, alpha=0.6, label="BreakingPoint alarm")
            ax.annotate("BREAKING POINT", (tr["alarm"], ax.get_ylim()[1] if ax.get_ylim()[1] else 1), xytext=(3, -12),
                        textcoords="offset points", color="#EF4444", fontsize=7.5, fontweight="bold")
        for r in tr.get("bad_reps", []):
            ax.annotate("bad rep", (r, sc[r - 1] if np.isfinite(sc[r - 1]) else 0), xytext=(0, 4),
                        textcoords="offset points", ha="center", fontsize=7, color=MUTED)
        ax.set_title(tr["title"])
        ax.set_xlabel("Rep")
        ax.set_ylabel("Movement Drift Score")
        ax.set_xlim(0.4, len(reps) + 0.6)
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))
        ax.set_ylim(0, max(np.nanmax(sc) if np.isfinite(sc).any() else 1, tr["breakpoint_level"]) * 1.18)
    for ax in axes.ravel()[n:]:
        ax.axis("off")
    handles = [Line2D([0], [0], color=STATE_COLORS[s], lw=6) for s in ("STABLE", "DRIFT", "BREAKPOINT")]
    handles += [Line2D([0], [0], color=INK, lw=1.6), Line2D([0], [0], color="#F59E0B", ls="--"),
                Line2D([0], [0], color="#EF4444", ls="--"), Line2D([0], [0], color="#2563EB", ls=":", lw=1.6),
                Line2D([0], [0], color="#7C3AED", ls="-.")]
    labels = ["Stable", "Drift emerging", "BreakingPoint", "EWMA (smoothed drift)", "Warning level",
              "BreakingPoint level", "True change (simulated)", "Estimated onset"]
    fig.legend(handles, labels, loc="lower center", ncol=8, bbox_to_anchor=(0.5, -0.03), fontsize=8.5)
    fig.suptitle("Example sessions: rep-level Movement Drift Score with true and detected change points",
                 fontweight="bold", color=INK, x=0.01, ha="left")
    _footnote(fig, seed_note)
    fig.tight_layout(rect=(0, 0.03, 1, 0.97))
    return _save(fig, out, "scenario_examples")


def parameter_heatmaps(panels: List[dict], out: Path) -> List[str]:
    """panels: dicts with title, xlabel, ylabel, xticks, yticks, fpr (2D), miss (2D), delay (2D), sel (i, j) or None."""
    setup_style()
    nrow = len(panels)
    fig, axes = plt.subplots(nrow, 3, figsize=(13.5, 3.5 * nrow), squeeze=False)
    specs = (("fpr", "False-positive rate (%)", "Reds", 100), ("miss", "Miss rate (%)", "Blues", 100),
             ("delay", "Median detection delay (reps)", "Purples", 1))
    for r, p in enumerate(panels):
        for cidx, (key, lab, cmap, scale) in enumerate(specs):
            ax = axes[r, cidx]
            M = np.asarray(p[key], dtype=float) * scale
            im = ax.imshow(M, origin="lower", aspect="auto", cmap=cmap)
            ax.grid(False)
            ax.set_xticks(range(len(p["xticks"])))
            ax.set_xticklabels([f"{x:g}" for x in p["xticks"]])
            ax.set_yticks(range(len(p["yticks"])))
            ax.set_yticklabels([f"{y:g}" for y in p["yticks"]])
            ax.set_xlabel(p["xlabel"])
            ax.set_ylabel(p["ylabel"])
            for i in range(M.shape[0]):
                for j in range(M.shape[1]):
                    if np.isfinite(M[i, j]):
                        val = M[i, j]
                        ax.text(j, i, f"{val:.1f}" if key != "delay" else f"{val:g}", ha="center", va="center",
                                fontsize=7.5, color="white" if val > np.nanmax(M) * 0.6 else INK)
            if key == "fpr":
                for i in range(M.shape[0]):
                    for j in range(M.shape[1]):
                        if np.isfinite(M[i, j]) and M[i, j] <= 5:
                            ax.add_patch(plt.Rectangle((j - 0.5, i - 0.5), 1, 1, fill=False, ec="#16A34A", lw=1.2, ls=":"))
            if p.get("sel") is not None:
                i, j = p["sel"]
                ax.add_patch(plt.Rectangle((j - 0.5, i - 0.5), 1, 1, fill=False, ec=SELECTED_COLOR, lw=2.4))
            fig.colorbar(im, ax=ax, fraction=0.046, pad=0.03).set_label(lab, fontsize=8)
            ax.set_title(f"{p['title']} — {lab.split(' (')[0]}", fontsize=10)
    _footnote(fig, "Held-out evaluation split. Other parameters fixed at the best configuration of each family. "
                   "Red box = chosen cell; green dotted = FPR ≤ 5%.")
    fig.tight_layout()
    return _save(fig, out, "parameter_heatmap")


def personal_vs_population(res: Dict[str, Dict[str, float]], out: Path, note: str) -> List[str]:
    setup_style()
    fig, axes = plt.subplots(1, 3, figsize=(12, 3.9))
    groups = list(res.keys())
    colors = {"Personal baseline (BreakingPoint)": SELECTED_COLOR, "Population norm (universal rules)": "#6B7280"}
    metrics = (("fpr_all", "False-positive rate,\nall no-change sessions (%)"),
               ("fpr_G", "False-positive rate,\nhigh-variability athletes (%)"),
               ("tpr", "Detection rate,\ndrift sessions (%)"))
    for ax, (key, lab) in zip(axes, metrics):
        vals = [res[g][key] * 100 for g in groups]
        lo = [res[g][key + "_lo"] * 100 for g in groups]
        hi = [res[g][key + "_hi"] * 100 for g in groups]
        x = np.arange(len(groups))
        ax.bar(x, vals, color=[colors.get(g, "#4C78A8") for g in groups], width=0.6)
        ax.errorbar(x, vals, yerr=[np.subtract(vals, lo), np.subtract(hi, vals)], fmt="none", ecolor=INK, capsize=4, lw=1)
        top = max(hi)
        for xi, v, h in zip(x, vals, hi):
            ax.text(xi, h + top * 0.03, f"{v:.1f}%", ha="center", va="bottom", fontsize=10, color=INK, fontweight="bold")
        ax.grid(axis="x", visible=False)
        ax.set_xticks(x)
        ax.set_xticklabels([g.split(" (")[0] for g in groups], fontsize=8.5)
        ax.set_title(lab, fontsize=10)
        ax.set_ylim(0, max(105 if key == "tpr" else 10, max(hi) * 1.2))
    fig.suptitle("Why individualized baselines matter: same detector, personal vs population reference",
                 fontweight="bold", color=INK, x=0.01, ha="left", y=1.04)
    _footnote(fig, note)
    fig.tight_layout()
    return _save(fig, out, "personal_vs_population")


def ablation(rows: List[dict], out: Path, note: str) -> List[str]:
    setup_style()
    fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.6))
    labels = [r["label"] for r in rows]
    y = np.arange(len(rows))[::-1]
    cols = [r.get("color", "#4C78A8") for r in rows]
    for ax, key, lab, scale in ((axes[0], "fpr", "False-positive rate (%)", 100), (axes[1], "miss", "Miss rate (%)", 100),
                                (axes[2], "median_delay", "Median detection delay (reps)", 1)):
        vals = np.array([r[key] for r in rows], dtype=float) * scale
        ax.barh(y, vals, color=cols, height=0.62)
        if key in ("fpr", "miss"):
            lo = np.array([r[key + "_lo"] for r in rows]) * scale
            hi = np.array([r[key + "_hi"] for r in rows]) * scale
            ax.errorbar(vals, y, xerr=[vals - lo, hi - vals], fmt="none", ecolor=INK, capsize=3, lw=0.9)
        for yi, v in zip(y, vals):
            if np.isfinite(v):
                ax.text(v, yi, f"  {v:.1f}" if key != "median_delay" else f"  {v:g}", va="center", fontsize=8, color=INK)
        ax.set_xlabel(lab)
        ax.grid(axis="y", visible=False)
        ax.set_yticks(y)
        ax.set_yticklabels(labels if ax is axes[0] else [])
        if key == "fpr":
            ax.axvline(5, color="#16A34A", ls="--", lw=1)
    fig.suptitle("Ablation: detector family and drift-score design (each at its best configuration)",
                 fontweight="bold", color=INK, x=0.01, ha="left", y=1.02)
    _footnote(fig, note)
    fig.tight_layout()
    return _save(fig, out, "ablation")


def severity(rows: List[dict], out: Path, note: str) -> List[str]:
    setup_style()
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 3.9))
    labels = list(dict.fromkeys(r["detector"] for r in rows))
    for i, lab in enumerate(labels):
        col, ls, mk = DETECTOR_STYLES[i % len(DETECTOR_STYLES)]
        rr = [r for r in rows if r["detector"] == lab]
        x = [r["severity_mid"] for r in rr]
        axes[0].plot(x, [r["tpr"] * 100 for r in rr], ls=ls, marker=mk, color=col, label=lab)
        axes[0].fill_between(x, [r["tpr_lo"] * 100 for r in rr], [r["tpr_hi"] * 100 for r in rr], color=col, alpha=0.1, lw=0)
        axes[1].plot(x, [r["median_delay"] for r in rr], ls=ls, marker=mk, color=col, label=lab)
    axes[0].set_ylabel("Detection rate (%)")
    axes[0].set_ylim(0, 102)
    axes[1].set_ylabel("Median detection delay (reps)")
    axes[1].set_ylim(bottom=0)
    for ax in axes:
        ax.set_xlabel("Peak drift magnitude (athlete's own SD units)")
    axes[0].set_title("Detection vs drift severity")
    axes[1].set_title("Delay vs drift severity")
    axes[1].legend(loc="upper right")
    _footnote(fig, note)
    fig.tight_layout()
    return _save(fig, out, "detection_by_severity")
