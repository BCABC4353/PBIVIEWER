#!/usr/bin/env python3
"""
Backtest: Super Bowl LIX (2025) — Eagles vs Chiefs
Actual result: Eagles 40, Chiefs 22 (Eagles +18, Total 62)
Vegas line: Chiefs -1, O/U 48.5

Runs our prediction engine against last year's Super Bowl to evaluate accuracy.
"""

import sys
import os
import json
import warnings
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
warnings.filterwarnings('ignore')

# Mapping: In our engine, "patriots" slot = team A, "seahawks" slot = team B
# For this backtest: team A = Eagles, team B = Chiefs
TEAM_A = "Eagles"
TEAM_B = "Chiefs"
ACTUAL_SCORE_A = 40
ACTUAL_SCORE_B = 22
ACTUAL_MARGIN = ACTUAL_SCORE_A - ACTUAL_SCORE_B  # +18 (Eagles won by 18)
ACTUAL_TOTAL = ACTUAL_SCORE_A + ACTUAL_SCORE_B    # 62
VEGAS_SPREAD = 1.0   # Chiefs -1 → from Eagles perspective, Eagles +1
VEGAS_TOTAL = 48.5


def load_backtest_data():
    config_dir = os.path.join(os.path.dirname(__file__), 'config')
    with open(os.path.join(config_dir, 'backtest_sb59_team_stats.json')) as f:
        stats = json.load(f)
    with open(os.path.join(config_dir, 'backtest_sb59_intangibles.json')) as f:
        intangibles = json.load(f)

    # Normalize team stats (reuse data loader logic)
    from data.data_loader import DataLoader
    loader = DataLoader()
    # Remap keys to match engine expectations
    normalized = {"patriots": stats["eagles"], "seahawks": stats["chiefs"]}
    loader._normalize_team_data(normalized["patriots"])
    loader._normalize_team_data(normalized["seahawks"])
    return normalized, intangibles


def main():
    from models.elo_model import EloModel
    from models.regression_model import RegressionModel
    from models.point_differential import PythagoreanModel
    from models.efficiency_model import EfficiencyModel
    from models.bayesian_model import BayesianModel
    from models.monte_carlo import MonteCarloModel
    from models.intangibles_model import IntangiblesModel
    from scipy.special import expit

    team_stats, intangibles_data = load_backtest_data()
    eagles = team_stats['patriots']   # eagles in slot A
    chiefs = team_stats['seahawks']   # chiefs in slot B

    print("=" * 70)
    print("  BACKTEST: Super Bowl LIX (Feb 9, 2025)")
    print("  Philadelphia Eagles vs. Kansas City Chiefs")
    print("  Actual Result: Eagles 40, Chiefs 22  (Eagles +18)")
    print("  Vegas Line: Chiefs -1, O/U 48.5")
    print("=" * 70)
    print()

    # Run all models (team A = Eagles, team B = Chiefs)
    model_results = {}

    print("Running models...")
    models = [
        ("Elo Rating", EloModel()),
        ("Logistic Regression", RegressionModel()),
        ("Pythagorean", PythagoreanModel()),
        ("Efficiency Composite", EfficiencyModel()),
        ("Bayesian Inference", BayesianModel()),
        ("Monte Carlo (100K)", MonteCarloModel(n_simulations=100000, seed=2025)),
    ]

    for name, model in models:
        result = model.predict(eagles, chiefs)
        model_results[name] = result
        print(f"  {name}: done")

    # Intangibles
    intangibles_model = IntangiblesModel(intangibles_data=intangibles_data)
    intangibles_result = intangibles_model.calculate_adjustment()
    intangibles_adj = intangibles_result.get('weighted_adjustment', 0)

    # Composite
    weights = {
        'Monte Carlo (100K)': 0.25,
        'Efficiency Composite': 0.20,
        'Bayesian Inference': 0.20,
        'Elo Rating': 0.15,
        'Logistic Regression': 0.10,
        'Pythagorean': 0.10
    }

    total_w = 0
    comp_a_prob = 0
    comp_spread = 0
    comp_total = 0

    for name, w in weights.items():
        if name in model_results:
            r = model_results[name]
            comp_a_prob += r.get('patriots_win_prob', 0.5) * w
            comp_spread += r.get('predicted_spread', 0) * w
            comp_total += r.get('predicted_total', 44) * w
            total_w += w

    if total_w > 0:
        comp_a_prob /= total_w
        comp_spread /= total_w
        comp_total /= total_w

    # Apply intangibles
    comp_spread_adj = comp_spread + intangibles_adj
    comp_a_prob_adj = float(expit(comp_spread_adj * 0.145))

    print()
    print("─" * 70)
    print(f"  {'MODEL':<25} {'EAGLES WIN%':>12} {'SPREAD':>10} {'TOTAL':>10}")
    print("─" * 70)

    for name, result in model_results.items():
        a_prob = result.get('patriots_win_prob', 0.5) * 100
        spread = result.get('predicted_spread', 0)
        total = result.get('predicted_total', 44)
        # Spread: positive = Eagles favored
        if spread > 0:
            spread_str = f"PHI -{abs(spread):.1f}"
        elif spread < 0:
            spread_str = f"KC -{abs(spread):.1f}"
        else:
            spread_str = "PICK"
        print(f"  {name:<25} {a_prob:>10.1f}%  {spread_str:>10} {total:>10.1f}")

    print("─" * 70)
    print(f"  {'Intangibles Adj.':<25} {'':>12} {intangibles_adj:>+10.1f}")
    print("─" * 70)

    if comp_spread_adj > 0:
        comp_spread_str = f"PHI -{abs(comp_spread_adj):.1f}"
    elif comp_spread_adj < 0:
        comp_spread_str = f"KC -{abs(comp_spread_adj):.1f}"
    else:
        comp_spread_str = "PICK"

    print(f"  {'COMPOSITE':<25} {comp_a_prob_adj*100:>10.1f}%  {comp_spread_str:>10} {comp_total:>10.1f}")
    print("─" * 70)

    # Accuracy Analysis
    print()
    print("=" * 70)
    print("  ACCURACY vs. ACTUAL RESULT")
    print("=" * 70)
    print()
    print(f"  Actual:     Eagles 40 - Chiefs 22  (Eagles +18, Total 62)")
    print(f"  Vegas:      Chiefs -1, O/U 48.5")
    print(f"  Model:      {comp_spread_str}, O/U {comp_total:.1f}")
    print()

    # Did model pick correct winner?
    model_picks_eagles = comp_spread_adj > 0
    eagles_won = True
    correct_winner = model_picks_eagles == eagles_won
    print(f"  Correct Winner?          {'YES' if correct_winner else 'NO'}")

    # Did model beat the spread? (Eagles were +1 underdogs)
    # Eagles covered if actual margin > -1 (Eagles perspective)
    eagles_covered = ACTUAL_MARGIN > -VEGAS_SPREAD  # 18 > -1 → YES
    model_says_eagles_cover = comp_spread_adj > -VEGAS_SPREAD
    print(f"  Eagles covered +1?       YES (won by 18)")
    print(f"  Model on spread?         {'Agreed (Eagles cover)' if model_says_eagles_cover else 'Disagreed'}")

    # Over/under
    actual_over = ACTUAL_TOTAL > VEGAS_TOTAL
    model_over = comp_total > VEGAS_TOTAL
    print(f"  Actual total (62):       OVER {VEGAS_TOTAL}")
    print(f"  Model total ({comp_total:.1f}):      {'OVER' if model_over else 'UNDER'} {VEGAS_TOTAL}")
    print(f"  Model on O/U?            {'Correct' if actual_over == model_over else 'Incorrect'}")

    # Spread accuracy
    print()
    print(f"  Model predicted spread:  {comp_spread_adj:+.1f} (Eagles perspective)")
    print(f"  Actual margin:           +18 (Eagles)")
    print(f"  Spread error:            {abs(ACTUAL_MARGIN - comp_spread_adj):.1f} points")
    print()
    print(f"  Vegas spread:            +1.0 (Eagles perspective)")
    print(f"  Vegas spread error:      {abs(ACTUAL_MARGIN - VEGAS_SPREAD):.1f} points")
    print()

    model_err = abs(ACTUAL_MARGIN - comp_spread_adj)
    vegas_err = abs(ACTUAL_MARGIN - VEGAS_SPREAD)
    if model_err < vegas_err:
        print(f"  Model beat Vegas by {vegas_err - model_err:.1f} points on spread accuracy!")
    else:
        print(f"  Vegas beat model by {model_err - vegas_err:.1f} points on spread accuracy.")

    print()
    print(f"  Total error (model):     {abs(ACTUAL_TOTAL - comp_total):.1f} points")
    print(f"  Total error (Vegas):     {abs(ACTUAL_TOTAL - VEGAS_TOTAL):.1f} points")

    # Per-model accuracy
    print()
    print("─" * 70)
    print(f"  {'MODEL':<25} {'PICK':>8} {'RIGHT?':>8} {'SPREAD ERR':>12} {'TOTAL ERR':>12}")
    print("─" * 70)

    for name, result in model_results.items():
        spread = result.get('predicted_spread', 0)
        total = result.get('predicted_total', 44)
        pick = "Eagles" if spread > 0 else "Chiefs" if spread < 0 else "PICK"
        right = "YES" if (spread > 0) == eagles_won else "NO"
        s_err = abs(ACTUAL_MARGIN - spread)
        t_err = abs(ACTUAL_TOTAL - total)
        print(f"  {name:<25} {pick:>8} {right:>8} {s_err:>10.1f}pt {t_err:>10.1f}pt")

    print(f"  {'COMPOSITE (+ intang.)':<25} {'Eagles' if comp_spread_adj > 0 else 'Chiefs':>8} {'YES' if correct_winner else 'NO':>8} {abs(ACTUAL_MARGIN - comp_spread_adj):>10.1f}pt {abs(ACTUAL_TOTAL - comp_total):>10.1f}pt")
    print(f"  {'VEGAS':<25} {'Chiefs':>8} {'NO':>8} {abs(ACTUAL_MARGIN - VEGAS_SPREAD):>10.1f}pt {abs(ACTUAL_TOTAL - VEGAS_TOTAL):>10.1f}pt")
    print("─" * 70)
    print()
    print("  Note: Super Bowls are single events with high variance.")
    print("  A model's value is in picking the right SIDE, not nailing the margin.")
    print()


if __name__ == '__main__':
    main()
