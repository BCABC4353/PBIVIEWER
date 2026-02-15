#!/usr/bin/env python3
"""
Comprehensive Financial Reporting & Analysis Suite
===================================================
Divorce Settlement Retirement Forecaster — "Take-Home" Edition

Generates 10 high-quality PNG financial reports for a 73-year-old woman
planning for a 14-year horizon (to age 87).

Author: Financial Analysis Suite
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import matplotlib.patches as mpatches
from matplotlib.gridspec import GridSpec
from matplotlib import colormaps
import warnings
warnings.filterwarnings("ignore", category=UserWarning)
# Disable math text parsing so '$' signs render literally
matplotlib.rcParams["text.parse_math"] = False

# ---------------------------------------------------------------------------
# GLOBAL CONFIGURATION
# ---------------------------------------------------------------------------
OUTPUT_DIR = "/home/user/PBIVIEWER/reports"
DPI = 200

# Professional color palette
COLORS = {
    "dark_blue":   "#1B2A4A",
    "mid_blue":    "#2E5090",
    "teal":        "#2A9D8F",
    "light_teal":  "#76C7B7",
    "gray":        "#6B7280",
    "light_gray":  "#E5E7EB",
    "bg_gray":     "#F8F9FA",
    "red":         "#E63946",
    "orange":      "#F4A261",
    "gold":        "#E9C46A",
    "green":       "#52B788",
    "white":       "#FFFFFF",
    "text":        "#1F2937",
    "subtitle":    "#4B5563",
}

RETURN_RATES = [0.03, 0.04, 0.05, 0.06, 0.07]
RETURN_LABELS = ["3%", "4%", "5%", "6%", "7%"]
HORIZON = 14  # years
START_AGE = 73
END_AGE = 87

# Income
SS_BASE = 21_600.0
SS_GROWTH = 0.025
PENSION = 4_404.0

# Expenses
MEMORY_CARE_BASE = 96_000.0
RX_BASE = 2_160.0
STORAGE_BASE = 1_560.0
PERSONAL = 500.0
RX_GROWTH = 0.03
STORAGE_GROWTH = 0.03

FOOTNOTE = (
    "Assumptions: SS 21,600/yr (+2.5% COLA) | Pension 4,404/yr (flat) | "
    "Memory Care 96,000/yr | Rx 2,160/yr (+3%) | Storage 1,560/yr (+3%) | "
    "Personal 500/yr (flat) | Tax 0 (memory care deduction)"
)


def setup_style():
    """Apply a consistent, professional matplotlib style."""
    plt.rcParams.update({
        "figure.facecolor": COLORS["bg_gray"],
        "axes.facecolor": COLORS["white"],
        "axes.edgecolor": COLORS["light_gray"],
        "axes.labelcolor": COLORS["text"],
        "axes.titlesize": 14,
        "axes.labelsize": 11,
        "xtick.color": COLORS["gray"],
        "ytick.color": COLORS["gray"],
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "legend.fontsize": 9,
        "legend.framealpha": 0.9,
        "grid.color": COLORS["light_gray"],
        "grid.alpha": 0.6,
        "font.family": "sans-serif",
        "font.sans-serif": ["DejaVu Sans", "Arial", "Helvetica"],
        "text.color": COLORS["text"],
        "text.parse_math": False,
    })


# ---------------------------------------------------------------------------
# FINANCIAL ENGINE
# ---------------------------------------------------------------------------

def calc_income(year_idx):
    """Return (ss, pension, total) for a given 0-indexed year."""
    ss = SS_BASE * (1 + SS_GROWTH) ** year_idx
    return ss, PENSION, ss + PENSION


def calc_expenses(year_idx, care_growth=0.0):
    """Return (care, rx, storage, personal, total) for a given 0-indexed year."""
    care = MEMORY_CARE_BASE * (1 + care_growth) ** year_idx
    rx = RX_BASE * (1 + RX_GROWTH) ** year_idx
    stor = STORAGE_BASE * (1 + STORAGE_GROWTH) ** year_idx
    total = care + rx + stor + PERSONAL
    return care, rx, stor, PERSONAL, total


def calc_deficit(year_idx, care_growth=0.0):
    """Return the annual deficit (expenses - income) for year i."""
    _, _, inc = calc_income(year_idx)
    _, _, _, _, exp = calc_expenses(year_idx, care_growth)
    return exp - inc


def solve_target_deplete(r, care_growth=0.0, horizon=HORIZON):
    """
    Solve for the starting balance B such that it depletes to $0 at end.
    B = sum( deficit_i / (1+r)^(i+1) ) for i in 0..horizon-1
    """
    total = 0.0
    for i in range(horizon):
        d = calc_deficit(i, care_growth)
        total += d / (1 + r) ** (i + 1)
    return total


def solve_target_preserve(r, care_growth=0.0, horizon=HORIZON):
    """
    Solve for B such that the full balance B remains at end of horizon.
    B = sum( deficit_i * (1+r)^(horizon-1-i) ) / ((1+r)^horizon - 1)
    """
    numerator = 0.0
    for i in range(horizon):
        d = calc_deficit(i, care_growth)
        numerator += d * (1 + r) ** (horizon - 1 - i)
    denominator = (1 + r) ** horizon - 1.0
    return numerator / denominator


def simulate_balance(start_balance, r, care_growth=0.0, horizon=HORIZON):
    """
    Simulate year-by-year balance. Returns a list of dicts with all columns.
    """
    rows = []
    balance = start_balance
    for i in range(horizon):
        ss, pen, inc = calc_income(i)
        care, rx, stor, pers, exp = calc_expenses(i, care_growth)
        deficit = exp - inc
        ret = balance * r
        net_change = ret + inc - exp
        balance = balance + net_change
        rows.append({
            "year_idx": i,
            "age": START_AGE + i,
            "year": 2026 + i,
            "ss": ss,
            "pension": pen,
            "income": inc,
            "care": care,
            "rx": rx,
            "storage": stor,
            "personal": pers,
            "expenses": exp,
            "deficit": deficit,
            "returns": ret,
            "net_change": net_change,
            "ending_balance": balance,
        })
    return rows


def add_footnote(fig, text=FOOTNOTE, y=0.01):
    """Add a footnote to the bottom of a figure."""
    fig.text(0.5, y, text, ha="center", va="bottom",
             fontsize=6.5, color=COLORS["gray"], style="italic")


def fmt_dollars(x, pos=None):
    """Format a number as a dollar string."""
    if abs(x) >= 1e6:
        return f"${x/1e6:.1f}M"
    elif abs(x) >= 1e3:
        return f"${x/1e3:.0f}K"
    else:
        return f"${x:,.0f}"


def fmt_dollars_full(x):
    """Format a full dollar amount."""
    return f"${x:,.0f}"


# ---------------------------------------------------------------------------
# REPORT 1: EXECUTIVE SUMMARY DASHBOARD
# ---------------------------------------------------------------------------
def report_01_executive_summary():
    print("  [1/10] Executive Summary Dashboard...")
    fig = plt.figure(figsize=(16, 11))
    fig.suptitle("DIVORCE SETTLEMENT ANALYSIS", fontsize=22, fontweight="bold",
                 color=COLORS["dark_blue"], y=0.97)
    fig.text(0.5, 0.94, "Executive Summary Dashboard  |  14-Year Retirement Forecast (Age 73-87)",
             ha="center", fontsize=12, color=COLORS["subtitle"])

    gs = GridSpec(3, 4, figure=fig, hspace=0.45, wspace=0.35,
                  top=0.90, bottom=0.10, left=0.06, right=0.94)

    # --- Top row: Key metric cards ---
    scenarios = [
        ("Scenario A\n(Flat Care Cost)", 0.0),
        ("Scenario B\n(+2% Care Growth)", 0.02),
    ]
    modes = [
        ("DEPLETE\n(Balance -> $0)", solve_target_deplete),
        ("PRESERVE\n(Balance Intact)", solve_target_preserve),
    ]

    card_data = []
    for sc_name, cg in scenarios:
        for mode_name, solver in modes:
            vals = [solver(r, cg) for r in RETURN_RATES]
            card_data.append((sc_name, mode_name, min(vals), max(vals), vals))

    for idx, (sc, mode, lo, hi, vals) in enumerate(card_data):
        row = idx // 4
        col = idx % 4
        ax = fig.add_subplot(gs[0, col])
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")

        bg_color = COLORS["mid_blue"] if "DEPLETE" in mode else COLORS["teal"]
        rect = mpatches.FancyBboxPatch(
            (0.03, 0.03), 0.94, 0.94, boxstyle="round,pad=0.05",
            facecolor=bg_color, edgecolor="none", alpha=0.12
        )
        ax.add_patch(rect)

        ax.text(0.5, 0.88, sc, ha="center", va="top", fontsize=8.5,
                fontweight="bold", color=COLORS["text"])
        ax.text(0.5, 0.72, mode, ha="center", va="top", fontsize=7.5,
                color=COLORS["subtitle"])
        ax.text(0.5, 0.45, f"{fmt_dollars(lo)} - {fmt_dollars(hi)}",
                ha="center", va="center", fontsize=13, fontweight="bold",
                color=bg_color)
        ax.text(0.5, 0.25, f"(at {RETURN_LABELS[0]}-{RETURN_LABELS[-1]} returns)",
                ha="center", va="center", fontsize=7.5, color=COLORS["gray"])

    # --- Middle row: Target settlement bar chart ---
    ax_bar = fig.add_subplot(gs[1, :3])
    x = np.arange(len(RETURN_RATES))
    w = 0.18
    labels_list = []
    colors_list = [COLORS["mid_blue"], COLORS["teal"], COLORS["orange"], COLORS["red"]]
    for i, (sc_name, cg) in enumerate(scenarios):
        for j, (mode_name, solver) in enumerate(modes):
            vals = [solver(r, cg) for r in RETURN_RATES]
            short_sc = "A-Flat" if cg == 0.0 else "B-+2%"
            short_mode = "Deplete" if "DEPLETE" in mode_name.upper() else "Preserve"
            label = f"{short_sc} / {short_mode}"
            offset = (i * 2 + j - 1.5) * w
            bars = ax_bar.bar(x + offset, vals, w * 0.92, label=label,
                              color=colors_list[i * 2 + j], alpha=0.85,
                              edgecolor="white", linewidth=0.5)

    ax_bar.set_xticks(x)
    ax_bar.set_xticklabels([f"{r*100:.0f}%" for r in RETURN_RATES])
    ax_bar.set_xlabel("Annual Return Rate", fontsize=10)
    ax_bar.set_ylabel("Target Settlement ($)", fontsize=10)
    ax_bar.set_title("Target Settlement by Scenario & Return Rate", fontsize=12,
                     fontweight="bold", color=COLORS["dark_blue"], pad=10)
    ax_bar.yaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
    ax_bar.legend(loc="upper right", fontsize=8, framealpha=0.9)
    ax_bar.grid(axis="y", alpha=0.3)
    ax_bar.spines["top"].set_visible(False)
    ax_bar.spines["right"].set_visible(False)

    # --- Middle row right: Key assumptions ---
    ax_info = fig.add_subplot(gs[1, 3])
    ax_info.axis("off")
    info_lines = [
        ("Age Range:", f"{START_AGE} - {END_AGE}"),
        ("Horizon:", f"{HORIZON} years"),
        ("SS Income:", f"${SS_BASE:,.0f}/yr (+{SS_GROWTH*100:.1f}%)"),
        ("Pension:", f"${PENSION:,.0f}/yr (flat)"),
        ("Memory Care:", f"${MEMORY_CARE_BASE:,.0f}/yr"),
        ("Prescriptions:", f"${RX_BASE:,.0f}/yr (+{RX_GROWTH*100:.0f}%)"),
        ("Storage:", f"${STORAGE_BASE:,.0f}/yr (+{STORAGE_GROWTH*100:.0f}%)"),
        ("Personal:", f"${PERSONAL:,.0f}/yr (flat)"),
        ("Taxes:", "$0 (care deduction)"),
    ]
    ax_info.text(0.5, 0.98, "KEY ASSUMPTIONS", ha="center", va="top",
                 fontsize=10, fontweight="bold", color=COLORS["dark_blue"])
    for i, (k, v) in enumerate(info_lines):
        y = 0.88 - i * 0.095
        ax_info.text(0.08, y, k, ha="left", va="top", fontsize=8,
                     fontweight="bold", color=COLORS["text"])
        ax_info.text(0.92, y, v, ha="right", va="top", fontsize=8,
                     color=COLORS["subtitle"])

    # --- Bottom row: Recommendation ---
    ax_rec = fig.add_subplot(gs[2, :])
    ax_rec.axis("off")

    # Calculate the recommended range
    deplete_5_b = solve_target_deplete(0.05, 0.02)
    preserve_5_b = solve_target_preserve(0.05, 0.02)
    rec_text = (
        f"RECOMMENDATION:  At a moderate 5% return with 2% care cost increases, "
        f"the settlement should be between {fmt_dollars_full(deplete_5_b)} (deplete mode) "
        f"and {fmt_dollars_full(preserve_5_b)} (preserve mode).  "
        f"A conservative target of ~{fmt_dollars_full((deplete_5_b + preserve_5_b) / 2)} "
        f"provides a reasonable middle ground."
    )

    rect_bg = mpatches.FancyBboxPatch(
        (0.02, 0.15), 0.96, 0.75, boxstyle="round,pad=0.03",
        facecolor=COLORS["teal"], edgecolor="none", alpha=0.08
    )
    ax_rec.add_patch(rect_bg)
    ax_rec.text(0.5, 0.55, rec_text, ha="center", va="center", fontsize=10.5,
                color=COLORS["dark_blue"], fontweight="bold",
                linespacing=1.6,
                bbox=dict(boxstyle="round,pad=0.4", facecolor=COLORS["light_teal"],
                          alpha=0.15, edgecolor="none"))

    add_footnote(fig, FOOTNOTE, y=0.02)
    fig.savefig(os.path.join(OUTPUT_DIR, "01_executive_summary.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ---------------------------------------------------------------------------
# REPORT 2: CASH FLOW WATERFALL
# ---------------------------------------------------------------------------
def report_02_cashflow_waterfall():
    print("  [2/10] Cash Flow Waterfall Chart...")
    fig, axes = plt.subplots(2, 1, figsize=(16, 12))
    fig.suptitle("CASH FLOW WATERFALL CHART", fontsize=18, fontweight="bold",
                 color=COLORS["dark_blue"], y=0.98)
    fig.text(0.5, 0.955, "Year-by-Year Flow  |  5% Return  |  Scenario B (+2% Care Growth)",
             ha="center", fontsize=11, color=COLORS["subtitle"])

    r = 0.05
    care_growth = 0.02
    mode_configs = [
        ("DEPLETE Mode (Balance -> $0 at Age 87)", solve_target_deplete),
        ("PRESERVE Mode (Balance Intact at Age 87)", solve_target_preserve),
    ]

    for ax_idx, (title, solver) in enumerate(mode_configs):
        ax = axes[ax_idx]
        start_bal = solver(r, care_growth)
        rows = simulate_balance(start_bal, r, care_growth)

        ages = [row["age"] for row in rows]
        incomes = [row["income"] for row in rows]
        expenses = [-row["expenses"] for row in rows]
        returns = [row["returns"] for row in rows]
        net_changes = [row["net_change"] for row in rows]

        x = np.arange(len(ages))
        width = 0.22

        bars_inc = ax.bar(x - width, incomes, width, label="Income",
                          color=COLORS["green"], alpha=0.85, edgecolor="white")
        bars_exp = ax.bar(x, expenses, width, label="Expenses",
                          color=COLORS["red"], alpha=0.85, edgecolor="white")
        bars_ret = ax.bar(x + width, returns, width, label="Inv. Returns",
                          color=COLORS["teal"], alpha=0.85, edgecolor="white")

        # Net change line
        ax2 = ax.twinx()
        ax2.plot(x, net_changes, color=COLORS["dark_blue"], linewidth=2,
                 marker="o", markersize=4, label="Net Change", zorder=5)
        ax2.axhline(0, color=COLORS["gray"], linewidth=0.5, linestyle="--")
        ax2.set_ylabel("Net Change ($)", fontsize=9, color=COLORS["dark_blue"])
        ax2.yaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
        ax2.spines["top"].set_visible(False)
        ax2.tick_params(axis="y", colors=COLORS["dark_blue"])

        ax.set_xticks(x)
        ax.set_xticklabels([str(a) for a in ages], fontsize=8)
        ax.set_xlabel("Age", fontsize=10)
        ax.set_ylabel("Amount ($)", fontsize=10)
        ax.set_title(f"{title}  |  Starting Balance: {fmt_dollars_full(start_bal)}",
                     fontsize=11, fontweight="bold", color=COLORS["dark_blue"], pad=8)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
        ax.axhline(0, color=COLORS["gray"], linewidth=0.8)
        ax.grid(axis="y", alpha=0.3)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        # Combined legend
        lines1, labels1 = ax.get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        ax.legend(lines1 + lines2, labels1 + labels2, loc="lower left", fontsize=8)

    plt.tight_layout(rect=[0, 0.04, 1, 0.94])
    add_footnote(fig, FOOTNOTE + "  |  Return: 5%  |  Care Growth: +2%/yr", y=0.005)
    fig.savefig(os.path.join(OUTPUT_DIR, "02_cashflow_waterfall.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ---------------------------------------------------------------------------
# REPORT 3: SENSITIVITY TORNADO CHART
# ---------------------------------------------------------------------------
def report_03_sensitivity_tornado():
    print("  [3/10] Sensitivity Analysis Tornado Chart...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 9))
    fig.suptitle("SENSITIVITY ANALYSIS  \u2014  TORNADO CHART", fontsize=18,
                 fontweight="bold", color=COLORS["dark_blue"], y=0.97)
    fig.text(0.5, 0.935, "Impact of \u00b120% Parameter Variation on Target Settlement  |  5% Return  |  Scenario B",
             ha="center", fontsize=11, color=COLORS["subtitle"])

    base_r = 0.05
    base_cg = 0.02

    params = [
        ("Memory Care ($96K)", "care"),
        ("SS Income ($21.6K)", "ss"),
        ("Return Rate (5%)", "return"),
        ("Care Growth (2%)", "care_growth"),
        ("Rx Cost ($2.16K)", "rx"),
        ("Storage ($1.56K)", "storage"),
        ("Pension ($4.4K)", "pension"),
        ("Personal ($500)", "personal"),
    ]

    mode_info = [
        ("DEPLETE Mode", solve_target_deplete),
        ("PRESERVE Mode", solve_target_preserve),
    ]

    for ax_idx, (mode_title, solver) in enumerate(mode_info):
        ax = axes[ax_idx]
        base_val = solver(base_r, base_cg)

        deltas = []
        labels = []
        for param_name, param_key in params:
            # We'll recompute by varying each parameter
            lo_val = _solve_with_variation(solver, base_r, base_cg, param_key, -0.20)
            hi_val = _solve_with_variation(solver, base_r, base_cg, param_key, +0.20)
            deltas.append((lo_val - base_val, hi_val - base_val))
            labels.append(param_name)

        # Sort by total swing
        swing = [abs(d[1] - d[0]) for d in deltas]
        order = np.argsort(swing)[::-1]

        y_pos = np.arange(len(params))
        for i, idx in enumerate(order):
            lo_d, hi_d = deltas[idx]
            color_lo = COLORS["teal"] if lo_d < 0 else COLORS["red"]
            color_hi = COLORS["red"] if hi_d > 0 else COLORS["teal"]
            ax.barh(i, lo_d, height=0.6, color=color_lo, alpha=0.8, edgecolor="white")
            ax.barh(i, hi_d, height=0.6, color=color_hi, alpha=0.8, edgecolor="white")

        ax.set_yticks(y_pos)
        ax.set_yticklabels([labels[idx] for idx in order], fontsize=9)
        ax.axvline(0, color=COLORS["dark_blue"], linewidth=1)
        ax.set_xlabel("Change in Target Settlement ($)", fontsize=10)
        ax.xaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
        ax.set_title(f"{mode_title}\nBase: {fmt_dollars_full(base_val)}",
                     fontsize=11, fontweight="bold", color=COLORS["dark_blue"], pad=8)
        ax.grid(axis="x", alpha=0.3)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        # Legend
        low_patch = mpatches.Patch(color=COLORS["teal"], alpha=0.8, label="-20% change")
        hi_patch = mpatches.Patch(color=COLORS["red"], alpha=0.8, label="+20% change")
        ax.legend(handles=[low_patch, hi_patch], loc="lower right", fontsize=8)

    plt.tight_layout(rect=[0, 0.05, 1, 0.92])
    add_footnote(fig, FOOTNOTE + "  |  Base: 5% Return, +2% Care Growth", y=0.005)
    fig.savefig(os.path.join(OUTPUT_DIR, "03_sensitivity_tornado.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def _solve_with_variation(solver, base_r, base_cg, param_key, pct):
    """
    Re-solve the target settlement with one parameter varied by pct (e.g., +0.20).
    We do this by temporarily monkey-patching globals — but to keep it clean,
    we'll just recompute inline.
    """
    global SS_BASE, PENSION, MEMORY_CARE_BASE, RX_BASE, STORAGE_BASE, PERSONAL

    orig = {
        "ss": SS_BASE, "pension": PENSION, "care": MEMORY_CARE_BASE,
        "rx": RX_BASE, "storage": STORAGE_BASE, "personal": PERSONAL,
    }
    r = base_r
    cg = base_cg

    if param_key == "ss":
        SS_BASE = orig["ss"] * (1 + pct)
    elif param_key == "pension":
        PENSION = orig["pension"] * (1 + pct)
    elif param_key == "care":
        MEMORY_CARE_BASE = orig["care"] * (1 + pct)
    elif param_key == "rx":
        RX_BASE = orig["rx"] * (1 + pct)
    elif param_key == "storage":
        STORAGE_BASE = orig["storage"] * (1 + pct)
    elif param_key == "personal":
        PERSONAL = orig["personal"] * (1 + pct)
    elif param_key == "return":
        r = base_r * (1 + pct)
    elif param_key == "care_growth":
        cg = base_cg * (1 + pct)

    result = solver(r, cg)

    # Restore
    SS_BASE = orig["ss"]
    PENSION = orig["pension"]
    MEMORY_CARE_BASE = orig["care"]
    RX_BASE = orig["rx"]
    STORAGE_BASE = orig["storage"]
    PERSONAL = orig["personal"]

    return result


# ---------------------------------------------------------------------------
# REPORT 4: MONTE CARLO SIMULATION
# ---------------------------------------------------------------------------
def report_04_monte_carlo():
    print("  [4/10] Monte Carlo Simulation...")
    np.random.seed(42)
    n_sims = 10_000
    start_balance = 825_000.0
    mean_return = 0.07
    std_return = 0.12
    care_growth = 0.02

    ending_balances = np.zeros(n_sims)
    all_paths = np.zeros((n_sims, HORIZON + 1))

    for sim in range(n_sims):
        balance = start_balance
        all_paths[sim, 0] = balance
        annual_returns = np.random.normal(mean_return, std_return, HORIZON)
        for i in range(HORIZON):
            r_i = annual_returns[i]
            _, _, inc = calc_income(i)
            _, _, _, _, exp = calc_expenses(i, care_growth)
            ret = balance * r_i
            balance = balance + ret + inc - exp
            all_paths[sim, i + 1] = balance
        ending_balances[sim] = balance

    # Percentiles for paths
    pcts = [5, 25, 50, 75, 95]
    path_pcts = np.percentile(all_paths, pcts, axis=0)

    fig = plt.figure(figsize=(16, 10))
    fig.suptitle("MONTE CARLO SIMULATION", fontsize=18, fontweight="bold",
                 color=COLORS["dark_blue"], y=0.97)
    fig.text(0.5, 0.94,
             f"10,000 Scenarios  |  Starting Balance: $825,000  |  Returns ~ N(7%, 12%)  |  Scenario B (+2% Care)",
             ha="center", fontsize=11, color=COLORS["subtitle"])

    gs = GridSpec(2, 2, figure=fig, hspace=0.35, wspace=0.3,
                  top=0.90, bottom=0.08, left=0.07, right=0.95)

    # Panel 1: Balance paths with confidence bands
    ax1 = fig.add_subplot(gs[0, :])
    ages = np.arange(START_AGE, START_AGE + HORIZON + 1)
    colors_band = [COLORS["red"], COLORS["orange"], COLORS["teal"],
                   COLORS["orange"], COLORS["red"]]

    # Plot sample paths (light)
    for sim in range(min(200, n_sims)):
        ax1.plot(ages, all_paths[sim], color=COLORS["gray"], alpha=0.02, linewidth=0.5)

    # Confidence bands
    ax1.fill_between(ages, path_pcts[0], path_pcts[4],
                     alpha=0.15, color=COLORS["red"], label="5th-95th percentile")
    ax1.fill_between(ages, path_pcts[1], path_pcts[3],
                     alpha=0.25, color=COLORS["orange"], label="25th-75th percentile")
    ax1.plot(ages, path_pcts[2], color=COLORS["dark_blue"], linewidth=2.5,
             label="Median (50th)", zorder=5)

    ax1.axhline(0, color=COLORS["red"], linewidth=1, linestyle="--", alpha=0.7)
    ax1.set_xlabel("Age", fontsize=10)
    ax1.set_ylabel("Portfolio Balance ($)", fontsize=10)
    ax1.set_title("Projected Balance Paths with Confidence Bands", fontsize=12,
                  fontweight="bold", color=COLORS["dark_blue"], pad=8)
    ax1.yaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
    ax1.legend(loc="upper right", fontsize=9)
    ax1.grid(alpha=0.3)
    ax1.spines["top"].set_visible(False)
    ax1.spines["right"].set_visible(False)

    # Panel 2: Histogram of ending balances
    ax2 = fig.add_subplot(gs[1, 0])
    ruin_pct = np.sum(ending_balances < 0) / n_sims * 100
    bins = np.linspace(np.percentile(ending_balances, 1),
                       np.percentile(ending_balances, 99), 60)
    ax2.hist(ending_balances, bins=bins, color=COLORS["mid_blue"], alpha=0.8,
             edgecolor="white", linewidth=0.5)
    ax2.axvline(0, color=COLORS["red"], linewidth=2, linestyle="--",
                label=f"Ruin line (P(ruin)={ruin_pct:.1f}%)")
    ax2.axvline(np.median(ending_balances), color=COLORS["teal"], linewidth=2,
                linestyle="-", label=f"Median: {fmt_dollars_full(np.median(ending_balances))}")
    ax2.set_xlabel("Ending Balance at Age 87 ($)", fontsize=10)
    ax2.set_ylabel("Frequency", fontsize=10)
    ax2.set_title("Distribution of Ending Balances", fontsize=11,
                  fontweight="bold", color=COLORS["dark_blue"], pad=8)
    ax2.xaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
    ax2.legend(fontsize=8)
    ax2.grid(axis="y", alpha=0.3)
    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_visible(False)

    # Panel 3: Percentile statistics
    ax3 = fig.add_subplot(gs[1, 1])
    ax3.axis("off")
    pct_labels = ["5th", "10th", "25th", "50th (Median)", "75th", "90th", "95th"]
    pct_vals = np.percentile(ending_balances, [5, 10, 25, 50, 75, 90, 95])

    ax3.text(0.5, 0.98, "ENDING BALANCE STATISTICS", ha="center", va="top",
             fontsize=12, fontweight="bold", color=COLORS["dark_blue"])

    for i, (lbl, val) in enumerate(zip(pct_labels, pct_vals)):
        y = 0.85 - i * 0.10
        color = COLORS["red"] if val < 0 else COLORS["teal"]
        ax3.text(0.15, y, lbl, ha="left", va="center", fontsize=10,
                 fontweight="bold", color=COLORS["text"])
        ax3.text(0.85, y, fmt_dollars_full(val), ha="right", va="center",
                 fontsize=10, color=color, fontweight="bold")

    # Extra stats
    ax3.text(0.15, 0.12, "Probability of Ruin:", ha="left", va="center",
             fontsize=10, fontweight="bold", color=COLORS["text"])
    ax3.text(0.85, 0.12, f"{ruin_pct:.1f}%", ha="right", va="center",
             fontsize=12, fontweight="bold",
             color=COLORS["red"] if ruin_pct > 10 else COLORS["teal"])

    ax3.text(0.15, 0.02, "Mean Ending Balance:", ha="left", va="center",
             fontsize=10, fontweight="bold", color=COLORS["text"])
    ax3.text(0.85, 0.02, fmt_dollars_full(np.mean(ending_balances)), ha="right",
             va="center", fontsize=10, fontweight="bold", color=COLORS["mid_blue"])

    add_footnote(fig, FOOTNOTE + "  |  Simulated returns: N(7%, 12%)", y=0.005)
    fig.savefig(os.path.join(OUTPUT_DIR, "04_monte_carlo.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ---------------------------------------------------------------------------
# REPORT 5: SCENARIO COMPARISON HEATMAP
# ---------------------------------------------------------------------------
def report_05_scenario_heatmap():
    print("  [5/10] Scenario Comparison Heatmap...")
    return_rates = np.arange(0.02, 0.09, 0.005)
    care_growths = np.arange(0.00, 0.051, 0.005)

    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    fig.suptitle("SCENARIO COMPARISON HEATMAP", fontsize=18, fontweight="bold",
                 color=COLORS["dark_blue"], y=0.97)
    fig.text(0.5, 0.935,
             "Target Settlement Amount by Return Rate & Care Cost Growth Rate",
             ha="center", fontsize=11, color=COLORS["subtitle"])

    mode_info = [
        ("DEPLETE Mode", solve_target_deplete),
        ("PRESERVE Mode", solve_target_preserve),
    ]

    for ax_idx, (title, solver) in enumerate(mode_info):
        ax = axes[ax_idx]
        grid = np.zeros((len(care_growths), len(return_rates)))
        for i, cg in enumerate(care_growths):
            for j, r in enumerate(return_rates):
                grid[i, j] = solver(r, cg)

        im = ax.imshow(grid, aspect="auto", origin="lower",
                       cmap="YlOrRd", interpolation="bilinear")
        cbar = fig.colorbar(im, ax=ax, shrink=0.85, pad=0.02)
        cbar.ax.yaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
        cbar.set_label("Target Settlement ($)", fontsize=9)

        # Labels
        xtick_idx = np.arange(0, len(return_rates), 2)
        ytick_idx = np.arange(0, len(care_growths), 2)
        ax.set_xticks(xtick_idx)
        ax.set_xticklabels([f"{return_rates[i]*100:.1f}%" for i in xtick_idx], fontsize=8)
        ax.set_yticks(ytick_idx)
        ax.set_yticklabels([f"{care_growths[i]*100:.1f}%" for i in ytick_idx], fontsize=8)
        ax.set_xlabel("Annual Return Rate", fontsize=10)
        ax.set_ylabel("Memory Care Cost Growth Rate", fontsize=10)
        ax.set_title(title, fontsize=12, fontweight="bold",
                     color=COLORS["dark_blue"], pad=8)

        # Annotate selected cells
        for i in range(0, len(care_growths), 3):
            for j in range(0, len(return_rates), 3):
                val = grid[i, j]
                text_color = "white" if val > grid.mean() else "black"
                ax.text(j, i, fmt_dollars(val), ha="center", va="center",
                        fontsize=6.5, color=text_color, fontweight="bold")

    plt.tight_layout(rect=[0, 0.05, 1, 0.92])
    add_footnote(fig, FOOTNOTE, y=0.005)
    fig.savefig(os.path.join(OUTPUT_DIR, "05_scenario_heatmap.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ---------------------------------------------------------------------------
# REPORT 6: INCOME VS EXPENSES OVER TIME
# ---------------------------------------------------------------------------
def report_06_income_vs_expenses():
    print("  [6/10] Income vs Expenses Over Time...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    fig.suptitle("INCOME vs. EXPENSES OVER TIME", fontsize=18, fontweight="bold",
                 color=COLORS["dark_blue"], y=0.97)
    fig.text(0.5, 0.935, "Stacked Area Chart  |  Showing the Growing Annual Deficit",
             ha="center", fontsize=11, color=COLORS["subtitle"])

    scenarios = [
        ("Scenario A  (Flat Care Cost)", 0.0),
        ("Scenario B  (+2% Care Growth)", 0.02),
    ]

    for ax_idx, (title, cg) in enumerate(scenarios):
        ax = axes[ax_idx]
        ages = list(range(START_AGE, START_AGE + HORIZON))
        ss_vals, pen_vals = [], []
        care_vals, rx_vals, stor_vals, pers_vals = [], [], [], []
        deficits = []

        for i in range(HORIZON):
            ss, pen, inc = calc_income(i)
            care, rx, stor, pers, exp = calc_expenses(i, cg)
            ss_vals.append(ss)
            pen_vals.append(pen)
            care_vals.append(care)
            rx_vals.append(rx)
            stor_vals.append(stor)
            pers_vals.append(pers)
            deficits.append(exp - inc)

        # Stacked income
        ax.fill_between(ages, 0, ss_vals, alpha=0.7, color=COLORS["green"],
                        label="Social Security")
        ax.fill_between(ages, ss_vals, [s + p for s, p in zip(ss_vals, pen_vals)],
                        alpha=0.7, color=COLORS["light_teal"], label="Pension")

        # Total expense line
        total_exp = [c + r + s + p for c, r, s, p in
                     zip(care_vals, rx_vals, stor_vals, pers_vals)]
        ax.plot(ages, total_exp, color=COLORS["red"], linewidth=2.5,
                label="Total Expenses", zorder=5)
        ax.fill_between(ages,
                        [s + p for s, p in zip(ss_vals, pen_vals)],
                        total_exp,
                        alpha=0.15, color=COLORS["red"], hatch="//",
                        label="Annual Deficit")

        # Annotate first and last deficit
        ax.annotate(f"Deficit: {fmt_dollars_full(deficits[0])}/yr",
                    xy=(ages[0], total_exp[0]),
                    xytext=(ages[0] + 1, total_exp[0] + 5000),
                    fontsize=8, color=COLORS["red"], fontweight="bold",
                    arrowprops=dict(arrowstyle="->", color=COLORS["red"], lw=1))
        ax.annotate(f"Deficit: {fmt_dollars_full(deficits[-1])}/yr",
                    xy=(ages[-1], total_exp[-1]),
                    xytext=(ages[-1] - 3, total_exp[-1] + 8000),
                    fontsize=8, color=COLORS["red"], fontweight="bold",
                    arrowprops=dict(arrowstyle="->", color=COLORS["red"], lw=1))

        ax.set_xlabel("Age", fontsize=10)
        ax.set_ylabel("Annual Amount ($)", fontsize=10)
        ax.set_title(title, fontsize=12, fontweight="bold",
                     color=COLORS["dark_blue"], pad=8)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
        ax.legend(loc="upper left", fontsize=8)
        ax.grid(alpha=0.3)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    plt.tight_layout(rect=[0, 0.05, 1, 0.92])
    add_footnote(fig, FOOTNOTE, y=0.005)
    fig.savefig(os.path.join(OUTPUT_DIR, "06_income_vs_expenses.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ---------------------------------------------------------------------------
# REPORT 7: PRESENT VALUE ANALYSIS
# ---------------------------------------------------------------------------
def report_07_present_value():
    print("  [7/10] Present Value Analysis...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    fig.suptitle("PRESENT VALUE ANALYSIS", fontsize=18, fontweight="bold",
                 color=COLORS["dark_blue"], y=0.97)
    fig.text(0.5, 0.935,
             "Present Value of All Future Deficits at Various Discount Rates",
             ha="center", fontsize=11, color=COLORS["subtitle"])

    discount_rates = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08]
    scenarios = [
        ("Scenario A (Flat Care)", 0.0),
        ("Scenario B (+2% Care)", 0.02),
    ]

    sc_colors = [COLORS["mid_blue"], COLORS["red"]]

    for ax_idx, mode_label in enumerate(["Deplete (PV of Deficits)", "Preserve (Full Balance Intact)"]):
        ax = axes[ax_idx]
        solver = solve_target_deplete if ax_idx == 0 else solve_target_preserve

        x = np.arange(len(discount_rates))
        width = 0.35

        for sc_idx, (sc_name, cg) in enumerate(scenarios):
            vals = [solver(r, cg) for r in discount_rates]
            offset = (sc_idx - 0.5) * width
            bars = ax.bar(x + offset, vals, width * 0.9, label=sc_name,
                          color=sc_colors[sc_idx], alpha=0.8, edgecolor="white")
            # Label top of each bar
            for bar, val in zip(bars, vals):
                ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 5000,
                        fmt_dollars(val), ha="center", va="bottom", fontsize=7,
                        fontweight="bold", color=sc_colors[sc_idx])

        ax.set_xticks(x)
        ax.set_xticklabels([f"{r*100:.0f}%" for r in discount_rates])
        ax.set_xlabel("Discount / Return Rate", fontsize=10)
        ax.set_ylabel("Target Settlement ($)", fontsize=10)
        ax.set_title(mode_label, fontsize=12, fontweight="bold",
                     color=COLORS["dark_blue"], pad=8)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
        ax.legend(fontsize=9)
        ax.grid(axis="y", alpha=0.3)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    plt.tight_layout(rect=[0, 0.05, 1, 0.92])
    add_footnote(fig, FOOTNOTE, y=0.005)
    fig.savefig(os.path.join(OUTPUT_DIR, "07_present_value.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ---------------------------------------------------------------------------
# REPORT 8: BREAK-EVEN ANALYSIS
# ---------------------------------------------------------------------------
def report_08_breakeven():
    print("  [8/10] Break-Even Analysis...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    fig.suptitle("BREAK-EVEN ANALYSIS", fontsize=18, fontweight="bold",
                 color=COLORS["dark_blue"], y=0.97)
    fig.text(0.5, 0.935,
             "Required Return Rate for a Given Settlement to Last 14 Years  |  Scenario B (+2% Care)",
             ha="center", fontsize=11, color=COLORS["subtitle"])

    balances = [600_000, 700_000, 800_000, 900_000, 1_000_000]
    bal_colors = [COLORS["red"], COLORS["orange"], COLORS["gold"],
                  COLORS["teal"], COLORS["green"]]
    care_growth = 0.02

    test_rates = np.linspace(0.01, 0.15, 200)

    mode_info = [
        ("DEPLETE Mode", "deplete"),
        ("PRESERVE Mode", "preserve"),
    ]

    for ax_idx, (mode_title, mode_key) in enumerate(mode_info):
        ax = axes[ax_idx]

        for bi, (bal, col) in enumerate(zip(balances, bal_colors)):
            ending_vals = []
            for r in test_rates:
                rows = simulate_balance(bal, r, care_growth)
                ending_vals.append(rows[-1]["ending_balance"])

            if mode_key == "preserve":
                # For preserve, the ending balance should equal the starting balance
                target_vals = [ev - bal for ev in ending_vals]
            else:
                target_vals = ending_vals

            ax.plot(test_rates * 100, [v / 1000 for v in target_vals],
                    color=col, linewidth=2,
                    label=f"${bal/1000:.0f}K starting")

            # Find break-even (where target_vals crosses zero)
            arr = np.array(target_vals)
            sign_changes = np.where(np.diff(np.sign(arr)))[0]
            if len(sign_changes) > 0:
                idx = sign_changes[0]
                # Linear interpolation
                r_be = test_rates[idx] + (test_rates[idx+1] - test_rates[idx]) * \
                       (-arr[idx]) / (arr[idx+1] - arr[idx])
                ax.axvline(r_be * 100, color=col, linewidth=0.8, linestyle=":",
                           alpha=0.6)
                ax.plot(r_be * 100, 0, marker="o", color=col, markersize=8, zorder=5)
                ax.annotate(f"{r_be*100:.1f}%",
                            xy=(r_be * 100, 0),
                            xytext=(r_be * 100 + 0.5, (bi - 2) * 30),
                            fontsize=8, color=col, fontweight="bold",
                            arrowprops=dict(arrowstyle="->", color=col, lw=0.8))

        ax.axhline(0, color=COLORS["dark_blue"], linewidth=1.2, linestyle="--")
        ax.set_xlabel("Annual Return Rate (%)", fontsize=10)
        ylabel = "Ending Balance ($K)" if mode_key == "deplete" else "Ending - Starting ($K)"
        ax.set_ylabel(ylabel, fontsize=10)
        ax.set_title(mode_title, fontsize=12, fontweight="bold",
                     color=COLORS["dark_blue"], pad=8)
        ax.legend(fontsize=8, loc="upper left")
        ax.grid(alpha=0.3)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    plt.tight_layout(rect=[0, 0.05, 1, 0.92])
    add_footnote(fig, FOOTNOTE + "  |  Scenario B (+2% Care Growth)", y=0.005)
    fig.savefig(os.path.join(OUTPUT_DIR, "08_breakeven.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ---------------------------------------------------------------------------
# REPORT 9: LONGEVITY SENSITIVITY
# ---------------------------------------------------------------------------
def report_09_longevity():
    print("  [9/10] Longevity Sensitivity...")
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    fig.suptitle("LONGEVITY SENSITIVITY ANALYSIS", fontsize=18, fontweight="bold",
                 color=COLORS["dark_blue"], y=0.97)
    fig.text(0.5, 0.935,
             "Target Settlement vs. End Age  |  Scenario B (+2% Care Growth)",
             ha="center", fontsize=11, color=COLORS["subtitle"])

    end_ages = [80, 82, 85, 87, 90, 92, 95]
    care_growth = 0.02
    rate_colors = [COLORS["red"], COLORS["orange"], COLORS["gold"],
                   COLORS["teal"], COLORS["green"]]

    mode_info = [
        ("DEPLETE Mode", solve_target_deplete),
        ("PRESERVE Mode", solve_target_preserve),
    ]

    for ax_idx, (mode_title, solver) in enumerate(mode_info):
        ax = axes[ax_idx]

        for ri, (r, col) in enumerate(zip(RETURN_RATES, rate_colors)):
            vals = []
            for ea in end_ages:
                h = ea - START_AGE
                if h <= 0:
                    vals.append(0)
                else:
                    vals.append(solver(r, care_growth, horizon=h))
            ax.plot(end_ages, vals, color=col, linewidth=2, marker="s",
                    markersize=6, label=f"{r*100:.0f}% return")

            # Annotate the age-87 point
            idx_87 = end_ages.index(87)
            ax.plot(87, vals[idx_87], marker="D", color=col, markersize=9,
                    zorder=6, markeredgecolor="white", markeredgewidth=1.5)

        ax.axvline(87, color=COLORS["gray"], linewidth=1, linestyle="--",
                   alpha=0.5, label="Base case (age 87)")
        ax.set_xlabel("End Age (Longevity)", fontsize=10)
        ax.set_ylabel("Target Settlement ($)", fontsize=10)
        ax.set_title(mode_title, fontsize=12, fontweight="bold",
                     color=COLORS["dark_blue"], pad=8)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(fmt_dollars))
        ax.legend(fontsize=8, loc="upper left")
        ax.grid(alpha=0.3)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    plt.tight_layout(rect=[0, 0.05, 1, 0.92])
    add_footnote(fig, FOOTNOTE + "  |  Scenario B (+2% Care Growth)", y=0.005)
    fig.savefig(os.path.join(OUTPUT_DIR, "09_longevity.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ---------------------------------------------------------------------------
# REPORT 10: DETAILED YEAR-BY-YEAR TABLE
# ---------------------------------------------------------------------------
def report_10_detailed_table():
    print("  [10/10] Comprehensive Year-by-Year Table...")
    r = 0.05
    care_growth = 0.02
    start_bal = solve_target_deplete(r, care_growth)
    rows = simulate_balance(start_bal, r, care_growth)

    # Build table data
    col_headers = [
        "Age", "Year", "SS Income", "Pension", "Total\nIncome",
        "Memory\nCare", "Rx", "Storage", "Personal", "Total\nExpenses",
        "Deficit", "Inv.\nReturns", "Net\nChange", "Ending\nBalance"
    ]

    cell_data = []
    for row in rows:
        cell_data.append([
            str(row["age"]),
            str(row["year"]),
            f"${row['ss']:,.0f}",
            f"${row['pension']:,.0f}",
            f"${row['income']:,.0f}",
            f"${row['care']:,.0f}",
            f"${row['rx']:,.0f}",
            f"${row['storage']:,.0f}",
            f"${row['personal']:,.0f}",
            f"${row['expenses']:,.0f}",
            f"${row['deficit']:,.0f}",
            f"${row['returns']:,.0f}",
            f"-${abs(row['net_change']):,.0f}" if row['net_change'] < 0 else f"${row['net_change']:,.0f}",
            f"${row['ending_balance']:,.0f}" if row['ending_balance'] >= 0 else f"-${abs(row['ending_balance']):,.0f}",
        ])

    # Create figure
    fig_height = 2.0 + len(rows) * 0.42
    fig, ax = plt.subplots(figsize=(18, fig_height))
    ax.axis("off")

    fig.suptitle("COMPREHENSIVE YEAR-BY-YEAR FINANCIAL PROJECTION", fontsize=18,
                 fontweight="bold", color=COLORS["dark_blue"], y=0.97)
    fig.text(0.5, 0.945,
             f"5% Return  |  Scenario B (+2% Care Growth)  |  DEPLETE Mode  |  Starting Balance: {fmt_dollars_full(start_bal)}",
             ha="center", fontsize=11, color=COLORS["subtitle"])

    table = ax.table(
        cellText=cell_data,
        colLabels=col_headers,
        cellLoc="center",
        loc="center",
    )

    table.auto_set_font_size(False)
    table.set_fontsize(8.5)
    table.scale(1, 1.6)

    # Style header row
    for j in range(len(col_headers)):
        cell = table[0, j]
        cell.set_facecolor(COLORS["dark_blue"])
        cell.set_text_props(color="white", fontweight="bold", fontsize=8)
        cell.set_edgecolor(COLORS["white"])
        cell.set_linewidth(1.5)

    # Style data rows
    for i in range(1, len(rows) + 1):
        for j in range(len(col_headers)):
            cell = table[i, j]
            bg = COLORS["bg_gray"] if i % 2 == 0 else COLORS["white"]
            cell.set_facecolor(bg)
            cell.set_edgecolor(COLORS["light_gray"])
            cell.set_linewidth(0.5)

            # Highlight deficit and negative values
            text = cell.get_text().get_text()
            if j == 10:  # Deficit column
                cell.get_text().set_color(COLORS["red"])
                cell.get_text().set_fontweight("bold")
            elif j == 11:  # Returns column
                cell.get_text().set_color(COLORS["teal"])
            elif j == 12:  # Net change
                if text.startswith("-"):
                    cell.get_text().set_color(COLORS["red"])
                else:
                    cell.get_text().set_color(COLORS["teal"])
            elif j == 13:  # Ending balance
                if text.startswith("-"):
                    cell.get_text().set_color(COLORS["red"])
                    cell.get_text().set_fontweight("bold")
                else:
                    cell.get_text().set_color(COLORS["dark_blue"])
                    cell.get_text().set_fontweight("bold")

    # Add a summary row
    total_income = sum(r["income"] for r in rows)
    total_expenses = sum(r["expenses"] for r in rows)
    total_returns = sum(r["returns"] for r in rows)
    total_deficit = sum(r["deficit"] for r in rows)

    summary = [
        "TOTAL", "",
        f"${sum(r['ss'] for r in rows):,.0f}",
        f"${sum(r['pension'] for r in rows):,.0f}",
        f"${total_income:,.0f}",
        f"${sum(r['care'] for r in rows):,.0f}",
        f"${sum(r['rx'] for r in rows):,.0f}",
        f"${sum(r['storage'] for r in rows):,.0f}",
        f"${sum(r['personal'] for r in rows):,.0f}",
        f"${total_expenses:,.0f}",
        f"${total_deficit:,.0f}",
        f"${total_returns:,.0f}",
        "", ""
    ]

    # Add summary row to table
    row_idx = len(rows) + 1
    for j, val in enumerate(summary):
        table.add_cell(row_idx, j, width=table[1, j].get_width(),
                       height=table[1, j].get_height(),
                       text=val, loc="center")
        cell = table[row_idx, j]
        cell.set_facecolor(COLORS["dark_blue"])
        cell.set_text_props(color="white", fontweight="bold", fontsize=8.5)
        cell.set_edgecolor(COLORS["white"])
        cell.set_linewidth(1.5)

    add_footnote(fig, FOOTNOTE + "  |  5% Return  |  Scenario B  |  Deplete Mode", y=0.01)
    fig.savefig(os.path.join(OUTPUT_DIR, "10_detailed_table.png"), dpi=DPI,
                bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    print("=" * 70)
    print("  COMPREHENSIVE FINANCIAL REPORTING SUITE")
    print("  Divorce Settlement Retirement Forecaster")
    print("=" * 70)

    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"\n  Output directory: {OUTPUT_DIR}\n")

    # Apply style
    setup_style()

    # Generate all reports
    report_01_executive_summary()
    report_02_cashflow_waterfall()
    report_03_sensitivity_tornado()
    report_04_monte_carlo()
    report_05_scenario_heatmap()
    report_06_income_vs_expenses()
    report_07_present_value()
    report_08_breakeven()
    report_09_longevity()
    report_10_detailed_table()

    # Summary
    print("\n" + "=" * 70)
    print("  ALL REPORTS GENERATED SUCCESSFULLY")
    print("=" * 70)

    # Print key findings
    print("\n  KEY FINDINGS:")
    print(f"  {'Scenario':<35} {'Deplete':>12} {'Preserve':>12}")
    print("  " + "-" * 60)
    for cg_label, cg in [("A (Flat Care)", 0.0), ("B (+2% Care Growth)", 0.02)]:
        for r in RETURN_RATES:
            dep = solve_target_deplete(r, cg)
            pres = solve_target_preserve(r, cg)
            print(f"  {cg_label} @ {r*100:.0f}% return      "
                  f"${dep:>10,.0f}  ${pres:>10,.0f}")
        print()

    print(f"\n  Files saved to: {OUTPUT_DIR}/")
    for f in sorted(os.listdir(OUTPUT_DIR)):
        fpath = os.path.join(OUTPUT_DIR, f)
        size_kb = os.path.getsize(fpath) / 1024
        print(f"    {f:<40} ({size_kb:.0f} KB)")

    print("\n  Done!")


if __name__ == "__main__":
    main()
