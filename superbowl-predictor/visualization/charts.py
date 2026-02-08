"""
Chart generation for Super Bowl LX Prediction Engine.
All charts use matplotlib with the Agg backend for non-interactive saving.

Team colors:
    Patriots  — #C60C30 (red)   primary chart color
    Seahawks  — #69BE28 (action green) primary chart color
    Both teams share navy #002244 as a secondary / background accent.
"""

import os
import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PAT_COLOR = "#C60C30"
SEA_COLOR = "#69BE28"
PAT_NAVY = "#002244"
SEA_NAVY = "#002244"
ACCENT_GRAY = "#AAAAAA"
GRID_COLOR = "#444444"

RADAR_CATEGORIES = [
    "Offense PPG",
    "Defense PPG",
    "Passing YPG",
    "Rushing YPG",
    "Turnover Diff",
    "3rd Down %",
    "Red Zone %",
    "EPA/Play",
]


def _apply_dark_style(fig, ax):
    """Apply consistent dark styling to a figure/axes pair."""
    fig.patch.set_facecolor("#1a1a2e")
    if isinstance(ax, np.ndarray):
        for a in ax.flat:
            a.set_facecolor("#16213e")
            a.tick_params(colors="white")
            a.xaxis.label.set_color("white")
            a.yaxis.label.set_color("white")
            a.title.set_color("white")
            for spine in a.spines.values():
                spine.set_color(GRID_COLOR)
    else:
        ax.set_facecolor("#16213e")
        ax.tick_params(colors="white")
        ax.xaxis.label.set_color("white")
        ax.yaxis.label.set_color("white")
        ax.title.set_color("white")
        for spine in ax.spines.values():
            spine.set_color(GRID_COLOR)


class PredictionCharts:
    """Generate and save prediction-related charts to *output_dir*."""

    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # 1. Model comparison — grouped bar chart
    # ------------------------------------------------------------------
    def model_comparison_chart(self, model_results: dict) -> str:
        """Grouped bar chart: each model's NE vs SEA win probability.

        Parameters
        ----------
        model_results : dict
            ``{'Elo': {'patriots_win_prob': 0.42, 'seahawks_win_prob': 0.58, ...}, ...}``

        Returns
        -------
        str  – path of saved PNG
        """
        plt.style.use("dark_background")
        # Filter to only entries that have win probabilities (skip Intangibles, composite, etc.)
        models = [m for m in model_results.keys()
                  if isinstance(model_results[m], dict) and 'patriots_win_prob' in model_results[m]
                  and m not in ('composite', 'Intangibles')]
        ne_probs = [model_results[m]["patriots_win_prob"] * 100 for m in models]
        sea_probs = [model_results[m]["seahawks_win_prob"] * 100 for m in models]

        x = np.arange(len(models))
        width = 0.35

        fig, ax = plt.subplots(figsize=(12, 6))
        _apply_dark_style(fig, ax)

        bars_ne = ax.bar(x - width / 2, ne_probs, width, label="Patriots",
                         color=PAT_COLOR, edgecolor="white", linewidth=0.5)
        bars_sea = ax.bar(x + width / 2, sea_probs, width, label="Seahawks",
                          color=SEA_COLOR, edgecolor="white", linewidth=0.5)

        # Value labels on bars
        for bar in bars_ne:
            h = bar.get_height()
            ax.text(bar.get_x() + bar.get_width() / 2, h + 0.8,
                    f"{h:.1f}%", ha="center", va="bottom", fontsize=9,
                    color="white", fontweight="bold")
        for bar in bars_sea:
            h = bar.get_height()
            ax.text(bar.get_x() + bar.get_width() / 2, h + 0.8,
                    f"{h:.1f}%", ha="center", va="bottom", fontsize=9,
                    color="white", fontweight="bold")

        ax.set_ylabel("Win Probability (%)", fontsize=12)
        ax.set_title("Model Win-Probability Comparison — Super Bowl LX",
                      fontsize=14, fontweight="bold", pad=15)
        ax.set_xticks(x)
        ax.set_xticklabels(models, fontsize=11)
        ax.set_ylim(0, max(max(ne_probs), max(sea_probs)) + 10)
        ax.axhline(50, color=ACCENT_GRAY, linestyle="--", linewidth=0.7, alpha=0.6)
        ax.legend(fontsize=11, loc="upper right")
        ax.grid(axis="y", color=GRID_COLOR, linestyle="--", linewidth=0.4, alpha=0.5)

        filepath = os.path.join(self.output_dir, "model_comparison.png")
        fig.tight_layout()
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        return filepath

    # ------------------------------------------------------------------
    # 2. Monte Carlo distribution — histogram
    # ------------------------------------------------------------------
    def monte_carlo_distribution(self, simulation_results: dict) -> str:
        """Histogram of simulated margin-of-victory with mean / median / std.

        Parameters
        ----------
        simulation_results : dict
            Must contain ``'margins'`` — array of point differentials
            (positive = Patriots win, negative = Seahawks win).

        Returns
        -------
        str  – path of saved PNG
        """
        plt.style.use("dark_background")
        margins = np.asarray(simulation_results["margins"])
        mean_m = np.mean(margins)
        median_m = np.median(margins)
        std_m = np.std(margins)

        fig, ax = plt.subplots(figsize=(12, 6))
        _apply_dark_style(fig, ax)

        # Colour bins by sign
        n_bins = 60
        counts, bin_edges, patches = ax.hist(
            margins, bins=n_bins, edgecolor="white", linewidth=0.4, alpha=0.85,
        )
        for patch, left_edge in zip(patches, bin_edges[:-1]):
            patch.set_facecolor(PAT_COLOR if left_edge >= 0 else SEA_COLOR)

        # Reference lines
        ax.axvline(mean_m, color="#FFD700", linestyle="-", linewidth=2,
                    label=f"Mean: {mean_m:+.1f}")
        ax.axvline(median_m, color="#FF6347", linestyle="--", linewidth=2,
                    label=f"Median: {median_m:+.1f}")
        ax.axvline(mean_m + std_m, color=ACCENT_GRAY, linestyle=":", linewidth=1.2,
                    label=f"+1 SD: {mean_m + std_m:+.1f}")
        ax.axvline(mean_m - std_m, color=ACCENT_GRAY, linestyle=":", linewidth=1.2,
                    label=f"-1 SD: {mean_m - std_m:+.1f}")
        ax.axvline(0, color="white", linestyle="-", linewidth=0.8, alpha=0.5)

        ne_wins = np.sum(margins > 0)
        sea_wins = np.sum(margins < 0)
        total = len(margins)
        ax.text(0.02, 0.95,
                f"NE wins: {ne_wins / total * 100:.1f}%  |  SEA wins: {sea_wins / total * 100:.1f}%",
                transform=ax.transAxes, fontsize=10, color="white",
                verticalalignment="top",
                bbox=dict(boxstyle="round,pad=0.3", facecolor="#16213e",
                          edgecolor=GRID_COLOR, alpha=0.9))

        ax.set_xlabel("Margin of Victory (+ = Patriots, - = Seahawks)", fontsize=11)
        ax.set_ylabel("Frequency", fontsize=11)
        ax.set_title(
            f"Monte Carlo Simulation — {total:,} Games",
            fontsize=14, fontweight="bold", pad=15,
        )
        ax.legend(fontsize=9, loc="upper right")
        ax.grid(axis="y", color=GRID_COLOR, linestyle="--", linewidth=0.4, alpha=0.5)

        filepath = os.path.join(self.output_dir, "monte_carlo_distribution.png")
        fig.tight_layout()
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        return filepath

    # ------------------------------------------------------------------
    # 3. Radar chart — team comparison
    # ------------------------------------------------------------------
    def radar_chart(self, patriots_stats: dict, seahawks_stats: dict) -> str:
        """Spider / radar chart comparing teams across 8 categories.

        Parameters
        ----------
        patriots_stats, seahawks_stats : dict
            Keys must match ``RADAR_CATEGORIES``.  Raw values are normalised
            to a 0-100 scale internally (higher = better *for that team*).

        Returns
        -------
        str  – path of saved PNG
        """
        plt.style.use("dark_background")
        categories = RADAR_CATEGORIES
        n = len(categories)

        # Gather raw values
        ne_raw = np.array([patriots_stats.get(c, 50) for c in categories], dtype=float)
        sea_raw = np.array([seahawks_stats.get(c, 50) for c in categories], dtype=float)

        # Normalise each stat to 0-100 across the two teams
        ne_norm = np.zeros(n)
        sea_norm = np.zeros(n)
        for i in range(n):
            lo = min(ne_raw[i], sea_raw[i])
            hi = max(ne_raw[i], sea_raw[i])
            if hi == lo:
                ne_norm[i] = 50
                sea_norm[i] = 50
            else:
                # For "Defense PPG" lower is better — invert
                if categories[i] == "Defense PPG":
                    ne_norm[i] = (1 - (ne_raw[i] - lo) / (hi - lo)) * 80 + 10
                    sea_norm[i] = (1 - (sea_raw[i] - lo) / (hi - lo)) * 80 + 10
                else:
                    ne_norm[i] = ((ne_raw[i] - lo) / (hi - lo)) * 80 + 10
                    sea_norm[i] = ((sea_raw[i] - lo) / (hi - lo)) * 80 + 10

        angles = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
        # Close the polygon
        ne_vals = np.concatenate([ne_norm, [ne_norm[0]]])
        sea_vals = np.concatenate([sea_norm, [sea_norm[0]]])
        angles += angles[:1]

        fig, ax = plt.subplots(figsize=(9, 9), subplot_kw=dict(polar=True))
        fig.patch.set_facecolor("#1a1a2e")
        ax.set_facecolor("#16213e")

        ax.plot(angles, ne_vals, color=PAT_COLOR, linewidth=2.2, label="Patriots")
        ax.fill(angles, ne_vals, color=PAT_COLOR, alpha=0.20)
        ax.plot(angles, sea_vals, color=SEA_COLOR, linewidth=2.2, label="Seahawks")
        ax.fill(angles, sea_vals, color=SEA_COLOR, alpha=0.20)

        # Mark data points
        ax.scatter(angles[:-1], ne_vals[:-1], color=PAT_COLOR, s=40, zorder=5)
        ax.scatter(angles[:-1], sea_vals[:-1], color=SEA_COLOR, s=40, zorder=5)

        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(categories, fontsize=10, color="white")
        ax.set_ylim(0, 100)
        ax.set_yticks([20, 40, 60, 80, 100])
        ax.set_yticklabels(["20", "40", "60", "80", "100"], fontsize=8, color=ACCENT_GRAY)
        ax.yaxis.grid(color=GRID_COLOR, linestyle="--", linewidth=0.5)
        ax.xaxis.grid(color=GRID_COLOR, linestyle="--", linewidth=0.5)

        ax.set_title("Team Comparison — Super Bowl LX",
                      fontsize=14, fontweight="bold", pad=25, color="white")
        ax.legend(loc="upper right", bbox_to_anchor=(1.25, 1.1), fontsize=11)

        filepath = os.path.join(self.output_dir, "radar_chart.png")
        fig.tight_layout()
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        return filepath

    # ------------------------------------------------------------------
    # 4. Value map — model spread vs Vegas spread
    # ------------------------------------------------------------------
    def value_map(self, model_predictions: dict, vegas_lines: dict) -> str:
        """Scatter of each model's predicted spread versus the Vegas spread.

        Parameters
        ----------
        model_predictions : dict
            ``{'Elo': -2.5, 'Regression': -5.1, ...}``
            Negative = Seahawks favoured.
        vegas_lines : dict
            Must contain ``'spread'`` (e.g. -4.5 meaning SEA -4.5).

        Returns
        -------
        str  – path of saved PNG
        """
        plt.style.use("dark_background")
        vegas_spread = vegas_lines.get("spread", -4.5)

        fig, ax = plt.subplots(figsize=(11, 7))
        _apply_dark_style(fig, ax)

        models = list(model_predictions.keys())
        spreads = [model_predictions[m] for m in models]

        colors = []
        for s in spreads:
            # If the model spread is more positive than Vegas, value on NE side
            if s > vegas_spread:
                colors.append(PAT_COLOR)
            else:
                colors.append(SEA_COLOR)

        ax.scatter(range(len(models)), spreads, c=colors, s=180,
                   edgecolors="white", linewidths=1.2, zorder=5)

        for i, (model, spread) in enumerate(zip(models, spreads)):
            ax.annotate(f"{spread:+.1f}", (i, spread),
                        textcoords="offset points", xytext=(0, 14),
                        ha="center", fontsize=10, color="white", fontweight="bold")

        # Vegas reference line
        ax.axhline(vegas_spread, color="#FFD700", linestyle="--", linewidth=2,
                    label=f"Vegas Spread: {vegas_spread:+.1f}", zorder=3)
        ax.axhline(0, color=ACCENT_GRAY, linestyle=":", linewidth=0.7, alpha=0.5)

        # Shade value regions
        y_min, y_max = ax.get_ylim()
        ax.fill_between([-0.5, len(models) - 0.5], vegas_spread, y_max,
                         color=PAT_COLOR, alpha=0.06, label="Value on NE")
        ax.fill_between([-0.5, len(models) - 0.5], y_min, vegas_spread,
                         color=SEA_COLOR, alpha=0.06, label="Value on SEA")

        ax.set_xticks(range(len(models)))
        ax.set_xticklabels(models, fontsize=11)
        ax.set_ylabel("Predicted Spread (+ = NE favoured)", fontsize=11)
        ax.set_title("Value Map — Model Spreads vs. Vegas Line",
                      fontsize=14, fontweight="bold", pad=15)
        ax.legend(fontsize=10, loc="best")
        ax.grid(axis="y", color=GRID_COLOR, linestyle="--", linewidth=0.4, alpha=0.5)

        filepath = os.path.join(self.output_dir, "value_map.png")
        fig.tight_layout()
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        return filepath

    # ------------------------------------------------------------------
    # 5. Intangibles breakdown — horizontal bar
    # ------------------------------------------------------------------
    def intangibles_breakdown(self, intangibles_results: dict) -> str:
        """Horizontal bar chart of intangible factors' point adjustments.

        Parameters
        ----------
        intangibles_results : dict
            ``{'factor_name': {'adjustment': float, 'confidence': float}, ...}``
            Positive adjustment helps NE; confidence in 0-1.

        Returns
        -------
        str  – path of saved PNG
        """
        plt.style.use("dark_background")
        factors = list(intangibles_results.keys())
        adjustments = [intangibles_results[f]["adjustment"] for f in factors]
        confidences = [intangibles_results[f]["confidence"] for f in factors]

        fig, ax = plt.subplots(figsize=(11, max(5, len(factors) * 0.7)))
        _apply_dark_style(fig, ax)

        y_pos = np.arange(len(factors))
        bar_colors = [PAT_COLOR if a >= 0 else SEA_COLOR for a in adjustments]
        bar_alphas = [max(0.35, c) for c in confidences]

        bars = ax.barh(y_pos, adjustments, height=0.6, edgecolor="white",
                       linewidth=0.5)
        for bar, color, alpha in zip(bars, bar_colors, bar_alphas):
            bar.set_color(color)
            bar.set_alpha(alpha)

        # Value labels
        for i, (adj, conf) in enumerate(zip(adjustments, confidences)):
            offset = 0.15 if adj >= 0 else -0.15
            ha = "left" if adj >= 0 else "right"
            ax.text(adj + offset, i,
                    f"{adj:+.1f} pts  ({conf:.0%} conf)",
                    va="center", ha=ha, fontsize=9, color="white")

        ax.axvline(0, color="white", linewidth=0.8)
        ax.set_yticks(y_pos)
        ax.set_yticklabels(factors, fontsize=10)
        ax.set_xlabel("Point Adjustment (+ helps NE, - helps SEA)", fontsize=11)
        ax.set_title("Intangibles Factor Breakdown",
                      fontsize=14, fontweight="bold", pad=15)
        ax.grid(axis="x", color=GRID_COLOR, linestyle="--", linewidth=0.4, alpha=0.5)

        filepath = os.path.join(self.output_dir, "intangibles_breakdown.png")
        fig.tight_layout()
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        return filepath

    # ------------------------------------------------------------------
    # 6. Sensitivity tornado chart
    # ------------------------------------------------------------------
    def sensitivity_tornado(self, scenario_results: dict) -> str:
        """Tornado chart showing spread sensitivity to each variable.

        Parameters
        ----------
        scenario_results : dict
            ``{variable_name: (low_spread, high_spread), ...}``

        Returns
        -------
        str  – path of saved PNG
        """
        plt.style.use("dark_background")
        variables = list(scenario_results.keys())
        lows = np.array([scenario_results[v][0] for v in variables])
        highs = np.array([scenario_results[v][1] for v in variables])

        # Sort by range (largest swing at top)
        ranges = highs - lows
        sort_idx = np.argsort(ranges)
        variables = [variables[i] for i in sort_idx]
        lows = lows[sort_idx]
        highs = highs[sort_idx]
        ranges = ranges[sort_idx]

        base_spread = (lows + highs) / 2  # midpoint as reference

        fig, ax = plt.subplots(figsize=(11, max(5, len(variables) * 0.65)))
        _apply_dark_style(fig, ax)

        y_pos = np.arange(len(variables))

        # Draw bars from low to high
        for i in range(len(variables)):
            ax.barh(i, highs[i] - lows[i], left=lows[i], height=0.55,
                    color=SEA_COLOR if lows[i] < 0 else PAT_COLOR,
                    edgecolor="white", linewidth=0.5, alpha=0.8)
            # Low label
            ax.text(lows[i] - 0.2, i, f"{lows[i]:+.1f}", va="center",
                    ha="right", fontsize=9, color="white")
            # High label
            ax.text(highs[i] + 0.2, i, f"{highs[i]:+.1f}", va="center",
                    ha="left", fontsize=9, color="white")

        ax.axvline(0, color=ACCENT_GRAY, linestyle=":", linewidth=0.8)
        ax.set_yticks(y_pos)
        ax.set_yticklabels(variables, fontsize=10)
        ax.set_xlabel("Predicted Spread (+ = NE favoured)", fontsize=11)
        ax.set_title("Sensitivity Analysis — Tornado Chart",
                      fontsize=14, fontweight="bold", pad=15)
        ax.grid(axis="x", color=GRID_COLOR, linestyle="--", linewidth=0.4, alpha=0.5)

        filepath = os.path.join(self.output_dir, "sensitivity_tornado.png")
        fig.tight_layout()
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        return filepath

    # ------------------------------------------------------------------
    # 7. Live win-probability line chart
    # ------------------------------------------------------------------
    def win_probability_live(self, trend_data: list) -> str:
        """Line chart of NE / SEA win probability over the course of the game.

        Parameters
        ----------
        trend_data : list[tuple]
            ``[(time_label, ne_prob, sea_prob), ...]``
            Probabilities in 0-1.

        Returns
        -------
        str  – path of saved PNG
        """
        plt.style.use("dark_background")
        labels = [t[0] for t in trend_data]
        ne_probs = [t[1] * 100 for t in trend_data]
        sea_probs = [t[2] * 100 for t in trend_data]
        x = np.arange(len(labels))

        fig, ax = plt.subplots(figsize=(14, 6))
        _apply_dark_style(fig, ax)

        ax.plot(x, ne_probs, color=PAT_COLOR, linewidth=2.5, label="Patriots",
                marker="o", markersize=4)
        ax.plot(x, sea_probs, color=SEA_COLOR, linewidth=2.5, label="Seahawks",
                marker="o", markersize=4)
        ax.fill_between(x, ne_probs, 50, where=[p >= 50 for p in ne_probs],
                         color=PAT_COLOR, alpha=0.10, interpolate=True)
        ax.fill_between(x, sea_probs, 50, where=[p >= 50 for p in sea_probs],
                         color=SEA_COLOR, alpha=0.10, interpolate=True)

        ax.axhline(50, color=ACCENT_GRAY, linestyle="--", linewidth=1, alpha=0.7,
                    label="50 % line")

        # Quarter dividers (approximate)
        quarter_ticks = []
        for i, label in enumerate(labels):
            if label.startswith("Q") and label.endswith("0:00"):
                quarter_ticks.append(i)
        for qt in quarter_ticks:
            ax.axvline(qt, color=ACCENT_GRAY, linestyle=":", linewidth=0.6, alpha=0.5)

        ax.set_xticks(x[::max(1, len(x) // 20)])
        ax.set_xticklabels([labels[i] for i in range(0, len(labels), max(1, len(labels) // 20))],
                           fontsize=8, rotation=45, ha="right")
        ax.set_ylim(0, 100)
        ax.set_ylabel("Win Probability (%)", fontsize=11)
        ax.set_xlabel("Game Time", fontsize=11)
        ax.set_title("Live Win Probability — Super Bowl LX",
                      fontsize=14, fontweight="bold", pad=15)
        ax.legend(fontsize=10, loc="upper right")
        ax.grid(color=GRID_COLOR, linestyle="--", linewidth=0.4, alpha=0.5)

        filepath = os.path.join(self.output_dir, "win_probability_live.png")
        fig.tight_layout()
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        return filepath

    # ------------------------------------------------------------------
    # 8. Score and probability — dual-axis chart
    # ------------------------------------------------------------------
    def score_and_probability(self, trend_data: list, score_data: list) -> str:
        """Dual-axis chart: win-probability lines + score step chart.

        Parameters
        ----------
        trend_data : list[tuple]
            ``[(time_label, ne_prob, sea_prob), ...]``
        score_data : list[tuple]
            ``[(time_label, ne_score, sea_score), ...]``
            Must align chronologically with trend_data (same time labels).

        Returns
        -------
        str  – path of saved PNG
        """
        plt.style.use("dark_background")
        labels = [t[0] for t in trend_data]
        ne_probs = [t[1] * 100 for t in trend_data]
        sea_probs = [t[2] * 100 for t in trend_data]

        score_labels = [s[0] for s in score_data]
        ne_scores = [s[1] for s in score_data]
        sea_scores = [s[2] for s in score_data]

        x_prob = np.arange(len(labels))

        fig, ax1 = plt.subplots(figsize=(14, 7))
        _apply_dark_style(fig, ax1)

        # Left axis — win probability
        ax1.plot(x_prob, ne_probs, color=PAT_COLOR, linewidth=2.2,
                 label="NE Win Prob", alpha=0.9)
        ax1.plot(x_prob, sea_probs, color=SEA_COLOR, linewidth=2.2,
                 label="SEA Win Prob", alpha=0.9)
        ax1.axhline(50, color=ACCENT_GRAY, linestyle="--", linewidth=0.8, alpha=0.5)
        ax1.set_ylabel("Win Probability (%)", fontsize=11, color="white")
        ax1.set_ylim(0, 100)
        ax1.set_xlabel("Game Time", fontsize=11)

        # Right axis — score
        ax2 = ax1.twinx()
        ax2.set_facecolor("none")

        # Map score_data x to the probability x axis via label matching
        label_to_x = {lab: idx for idx, lab in enumerate(labels)}
        x_score = [label_to_x.get(sl, i) for i, sl in enumerate(score_labels)]

        ax2.step(x_score, ne_scores, where="post", color=PAT_COLOR,
                 linewidth=1.8, linestyle=":", alpha=0.7, label="NE Score")
        ax2.step(x_score, sea_scores, where="post", color=SEA_COLOR,
                 linewidth=1.8, linestyle=":", alpha=0.7, label="SEA Score")
        ax2.set_ylabel("Score", fontsize=11, color="white")
        ax2.tick_params(colors="white")
        for spine in ax2.spines.values():
            spine.set_color(GRID_COLOR)

        # X ticks
        step = max(1, len(labels) // 20)
        ax1.set_xticks(x_prob[::step])
        ax1.set_xticklabels([labels[i] for i in range(0, len(labels), step)],
                            fontsize=8, rotation=45, ha="right")

        ax1.set_title("Win Probability & Score — Super Bowl LX",
                       fontsize=14, fontweight="bold", pad=15)

        # Combined legend
        lines1, labels1 = ax1.get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        ax1.legend(lines1 + lines2, labels1 + labels2, fontsize=9,
                   loc="upper left")

        ax1.grid(color=GRID_COLOR, linestyle="--", linewidth=0.4, alpha=0.4)

        filepath = os.path.join(self.output_dir, "score_and_probability.png")
        fig.tight_layout()
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close(fig)
        return filepath

    # ------------------------------------------------------------------
    # 9. Save all pre-game charts
    # ------------------------------------------------------------------
    def save_all_pregame(
        self,
        model_results: dict,
        simulation_results: dict,
        patriots_stats: dict,
        seahawks_stats: dict,
        vegas_lines: dict,
        intangibles_results: dict,
        scenario_results: dict,
    ) -> dict:
        """Generate and save every pre-game chart.

        Returns
        -------
        dict  – mapping of chart name to filepath
        """
        saved = {}

        saved["model_comparison"] = self.model_comparison_chart(model_results)

        saved["monte_carlo"] = self.monte_carlo_distribution(simulation_results)

        saved["radar"] = self.radar_chart(patriots_stats, seahawks_stats)

        # Build model_predictions dict for value map (extract spreads)
        model_predictions = {}
        for name, res in model_results.items():
            model_predictions[name] = res.get("predicted_spread", 0.0)
        saved["value_map"] = self.value_map(model_predictions, vegas_lines)

        saved["intangibles"] = self.intangibles_breakdown(intangibles_results)

        saved["sensitivity"] = self.sensitivity_tornado(scenario_results)

        return saved
