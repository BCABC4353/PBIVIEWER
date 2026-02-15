#!/usr/bin/env python3
"""
Divorce Settlement Retirement Forecaster — Dinner Version
=========================================================
How much does she need from the settlement to make it to 87?

Two balance modes:
  DEPLETE   → balance hits $0 at age 87
  PRESERVE  → balance is fully intact at age 87

Two expense scenarios:
  A → Memory care stays flat at $8,000/mo
  B → Memory care increases 2% per year

Multiple return rates: 3%, 4%, 5%, 6%, 7%
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker

# ── Configuration ────────────────────────────────────────────

CURRENT_AGE = 73
END_AGE     = 87
YEARS       = END_AGE - CURRENT_AGE  # 14

RETURN_RATES = [0.03, 0.04, 0.05, 0.06, 0.07]

INCOME = [
    {"name": "Social Security",  "annual": 21_600, "growth": 0.025},
    {"name": "Pension",          "annual":  4_404, "growth": 0.00},
]

EXPENSES_A = [
    {"name": "Memory Care",   "annual": 96_000, "growth": 0.00},
    {"name": "Prescriptions", "annual":  2_160, "growth": 0.03},
    {"name": "Storage Unit",  "annual":  1_560, "growth": 0.03},
    {"name": "Personal",      "annual":    500, "growth": 0.00},
]

EXPENSES_B = [
    {"name": "Memory Care",   "annual": 96_000, "growth": 0.02},
    {"name": "Prescriptions", "annual":  2_160, "growth": 0.03},
    {"name": "Storage Unit",  "annual":  1_560, "growth": 0.03},
    {"name": "Personal",      "annual":    500, "growth": 0.00},
]

SCENARIOS = {
    "A: Care flat":  EXPENSES_A,
    "B: Care +2%":   EXPENSES_B,
}

# ── Math ─────────────────────────────────────────────────────

def flow_at_year(items, y):
    """Total cash flow for a list of items at year y (0-indexed)."""
    return sum(item["annual"] * (1 + item["growth"]) ** y for item in items)


def net_deficits(years):
    """Return dict of scenario_name → list of annual deficits."""
    result = {}
    for name, expenses in SCENARIOS.items():
        result[name] = [
            flow_at_year(expenses, y) - flow_at_year(INCOME, y)
            for y in range(years)
        ]
    return result


def solve_settlement(deficits, r, mode="deplete"):
    """
    Solve for starting balance B.

    After n years:  B·(1+r)^n − Σ d_i·(1+r)^(n−i) = end_balance

    deplete:   end_balance = 0  →  B = Σ d_i / (1+r)^i
    preserve:  end_balance = B  →  B = Σ d_i·(1+r)^(n−i) / ((1+r)^n − 1)
    """
    n = len(deficits)
    if mode == "deplete":
        return sum(d / (1 + r) ** (i + 1) for i, d in enumerate(deficits))
    else:
        fv = sum(d * (1 + r) ** (n - 1 - i) for i, d in enumerate(deficits))
        denom = (1 + r) ** n - 1
        return fv / denom if denom != 0 else float("inf")


def project(starting_balance, income, expenses, r, years, start_age):
    """Year-by-year projection → list of row dicts."""
    rows = []
    bal = starting_balance
    for y in range(years):
        inc = flow_at_year(income, y)
        exp = flow_at_year(expenses, y)
        ret = bal * r
        bal = bal + ret + inc - exp
        rows.append({
            "age":      start_age + y,
            "income":   inc,
            "expenses": exp,
            "returns":  ret,
            "net":      inc + ret - exp,
            "balance":  bal,
        })
    return rows

# ── Display helpers ──────────────────────────────────────────

W = 78  # output width

def banner(text):
    print(f"\n{'=' * W}")
    print(f"  {text}")
    print(f"{'=' * W}")


def section(text):
    print(f"\n  {text}")
    print(f"  {'-' * (W - 4)}")

# ── Main ─────────────────────────────────────────────────────

def main():
    banner(f"DIVORCE SETTLEMENT FORECASTER  ·  Age {CURRENT_AGE} → {END_AGE}  ({YEARS} years)")

    # ── Year-1 snapshot ──────────────────────────────────────
    section("YEAR 1 SNAPSHOT (age 73)")
    y1_inc = flow_at_year(INCOME, 0)
    print(f"  {'Income':.<40} ${y1_inc:>12,.0f}")
    for item in INCOME:
        print(f"    {item['name']:.<38} ${item['annual']:>12,.0f}")
    print()
    for sc_name, expenses in SCENARIOS.items():
        y1_exp = flow_at_year(expenses, 0)
        print(f"  Expenses ({sc_name})")
        for item in expenses:
            print(f"    {item['name']:.<38} ${item['annual']:>12,.0f}")
        print(f"  {'Total expenses':.<40} ${y1_exp:>12,.0f}")
        print(f"  {'Annual deficit':.<40} ${y1_exp - y1_inc:>12,.0f}")
        print()

    # ── Target settlement matrix ─────────────────────────────
    all_deficits = net_deficits(YEARS)

    for mode, label in [("deplete", "DEPLETE TO $0 AT 87"),
                        ("preserve", "PRESERVE 100% OF PRINCIPAL")]:
        banner(f"TARGET SETTLEMENT  —  {label}")
        # header
        hdr = f"  {'Scenario':<18}"
        for r in RETURN_RATES:
            hdr += f"  {r*100:.0f}% return"
        print(hdr)
        print(f"  {'-' * (W - 4)}")

        for sc_name, defs in all_deficits.items():
            row = f"  {sc_name:<18}"
            for r in RETURN_RATES:
                t = solve_settlement(defs, r, mode)
                row += f"  ${t:>9,.0f}"
            print(row)

    # ── Detailed year-by-year tables ─────────────────────────
    detail_rate = 0.05
    for mode, label in [("deplete", "DEPLETE"), ("preserve", "PRESERVE")]:
        for sc_name, expenses in SCENARIOS.items():
            defs = all_deficits[sc_name]
            target = solve_settlement(defs, detail_rate, mode)

            banner(f"YEAR-BY-YEAR  ·  {label}  ·  {sc_name}  ·  {detail_rate*100:.0f}% return")
            print(f"  Starting settlement: ${target:>14,.0f}")
            print()
            print(f"  {'Age':<5} {'Income':>10} {'Expenses':>10}"
                  f" {'Returns':>10} {'Net':>11} {'Balance':>14}")
            print(f"  {'-' * (W - 4)}")

            rows = project(target, INCOME, expenses, detail_rate, YEARS, CURRENT_AGE)
            for row in rows:
                print(f"  {row['age']:<5}"
                      f" ${row['income']:>9,.0f}"
                      f" ${row['expenses']:>9,.0f}"
                      f" ${row['returns']:>9,.0f}"
                      f" ${row['net']:>10,.0f}"
                      f" ${row['balance']:>13,.0f}")

    # ── Charts ───────────────────────────────────────────────
    fig, axes = plt.subplots(2, 2, figsize=(15, 10))
    fig.suptitle(
        "Divorce Settlement Analysis: Target Amounts & Balance Projections",
        fontsize=14, fontweight="bold", y=0.98,
    )
    colors = ["#2563eb", "#dc2626"]

    for col, (mode, mode_label) in enumerate(
        [("deplete", "Deplete to $0"), ("preserve", "Preserve Principal")]
    ):
        # Row 0: target settlement vs return rate
        ax = axes[0][col]
        for i, (sc_name, defs) in enumerate(all_deficits.items()):
            targets = [solve_settlement(defs, r, mode) for r in RETURN_RATES]
            ax.plot(
                [r * 100 for r in RETURN_RATES],
                [t / 1000 for t in targets],
                "o-", color=colors[i], label=sc_name, linewidth=2, markersize=7,
            )
            for x, y in zip([r * 100 for r in RETURN_RATES], targets):
                ax.annotate(f"${y/1000:,.0f}K", (x, y / 1000),
                            textcoords="offset points", xytext=(0, 10),
                            ha="center", fontsize=7, color=colors[i])
        ax.set_title(f"Settlement Needed: {mode_label}", fontweight="bold")
        ax.set_xlabel("Annual Return Rate (%)")
        ax.set_ylabel("Settlement ($K)")
        ax.legend()
        ax.grid(True, alpha=0.3)
        ax.yaxis.set_major_formatter(
            ticker.FuncFormatter(lambda x, _: f"${x:,.0f}K")
        )

        # Row 1: balance over time at 5%
        ax = axes[1][col]
        for i, (sc_name, expenses) in enumerate(SCENARIOS.items()):
            defs = all_deficits[sc_name]
            target = solve_settlement(defs, 0.05, mode)
            rows = project(target, INCOME, expenses, 0.05, YEARS, CURRENT_AGE)
            ages = [CURRENT_AGE] + [r["age"] + 1 for r in rows]
            bals = [target] + [r["balance"] for r in rows]
            ax.plot(
                ages, [b / 1000 for b in bals],
                "o-", color=colors[i], linewidth=2, markersize=5,
                label=f"{sc_name}  (${target/1000:,.0f}K)",
            )
        if mode == "deplete":
            ax.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
        ax.set_title(f"Balance Over Time: {mode_label} @ 5%", fontweight="bold")
        ax.set_xlabel("Age")
        ax.set_ylabel("Balance ($K)")
        ax.legend(fontsize=8)
        ax.grid(True, alpha=0.3)
        ax.yaxis.set_major_formatter(
            ticker.FuncFormatter(lambda x, _: f"${x:,.0f}K")
        )

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    chart_path = "/home/user/PBIVIEWER/settlement_analysis_dinner.png"
    plt.savefig(chart_path, dpi=150, bbox_inches="tight")
    plt.close()

    print(f"\n  Chart saved → settlement_analysis_dinner.png")
    banner("DONE — Happy Valentine's Day!")


if __name__ == "__main__":
    main()
