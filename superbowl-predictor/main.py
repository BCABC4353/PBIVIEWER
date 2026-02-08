#!/usr/bin/env python3
"""
Super Bowl LX Prediction Engine — Pre-Game Analysis

New England Patriots vs. Seattle Seahawks
February 8, 2026 — Levi's Stadium, Santa Clara, CA
Kickoff: 6:30 PM ET | Seahawks -4.5

Built by Brendan Cameron | BCABC, LLC
"For entertainment and analytical purposes"
"""

import sys
import os
import warnings
import numpy as np

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

warnings.filterwarnings('ignore')


def main():
    """Run the complete pre-game analysis."""
    from data.data_loader import DataLoader
    from models.elo_model import EloModel
    from models.regression_model import RegressionModel
    from models.point_differential import PythagoreanModel
    from models.efficiency_model import EfficiencyModel
    from models.bayesian_model import BayesianModel
    from models.monte_carlo import MonteCarloModel
    from models.intangibles_model import IntangiblesModel
    from analysis.value_finder import ValueFinder
    from analysis.prop_analyzer import PropAnalyzer
    from analysis.scenario_engine import ScenarioEngine
    from visualization.charts import PredictionCharts
    from visualization.report_generator import ReportGenerator

    # ─── Step 1: Load Data ───
    print("Loading data...", flush=True)
    loader = DataLoader()
    all_data = loader.load_all()

    team_stats = all_data['team_stats']
    player_stats = all_data['player_stats']
    intangibles_data = all_data['intangibles']
    vegas_lines = all_data['vegas_lines']

    ne_stats = team_stats['patriots']
    sea_stats = team_stats['seahawks']

    # ─── Step 2: Run All Prediction Models ───
    print("Running prediction models...", flush=True)

    models = {}
    all_model_results = {}

    # Elo Rating Model
    print("  → Elo Rating Model...", flush=True)
    elo = EloModel()
    elo_result = elo.predict(ne_stats, sea_stats)
    models['Elo Rating'] = elo
    all_model_results['Elo Rating'] = elo_result

    # Logistic Regression Model
    print("  → Logistic Regression Model...", flush=True)
    regression = RegressionModel()
    reg_result = regression.predict(ne_stats, sea_stats)
    models['Logistic Regression'] = regression
    all_model_results['Logistic Regression'] = reg_result

    # Pythagorean / Point Differential Model
    print("  → Pythagorean Model...", flush=True)
    pythag = PythagoreanModel()
    pythag_result = pythag.predict(ne_stats, sea_stats)
    models['Pythagorean'] = pythag
    all_model_results['Pythagorean'] = pythag_result

    # Efficiency Composite Model
    print("  → Efficiency Composite Model...", flush=True)
    efficiency = EfficiencyModel()
    eff_result = efficiency.predict(ne_stats, sea_stats)
    models['Efficiency Composite'] = efficiency
    all_model_results['Efficiency Composite'] = eff_result

    # Bayesian Inference Model
    print("  → Bayesian Inference Model...", flush=True)
    bayesian = BayesianModel()
    bayes_result = bayesian.predict(ne_stats, sea_stats)
    models['Bayesian Inference'] = bayesian
    all_model_results['Bayesian Inference'] = bayes_result

    # Monte Carlo Simulation (100K sims)
    print("  → Monte Carlo Simulation (100,000 games)...", flush=True)
    monte_carlo = MonteCarloModel(n_simulations=100000, seed=2026)
    mc_result = monte_carlo.predict(ne_stats, sea_stats)
    models['Monte Carlo'] = monte_carlo
    all_model_results['Monte Carlo'] = mc_result

    # ─── Step 3: Apply Intangibles ───
    print("Calculating intangibles adjustments...", flush=True)
    intangibles = IntangiblesModel(intangibles_data=intangibles_data)
    intangibles_result = intangibles.calculate_adjustment()
    all_model_results['Intangibles'] = intangibles_result

    # ─── Step 4: Compute Composite Prediction ───
    print("Computing composite prediction...", flush=True)

    model_weights = {
        'Monte Carlo': 0.25,
        'Efficiency Composite': 0.20,
        'Bayesian Inference': 0.20,
        'Elo Rating': 0.15,
        'Logistic Regression': 0.10,
        'Pythagorean': 0.10
    }

    total_weight = 0
    composite_ne_prob = 0
    composite_spread = 0
    composite_total = 0

    for name, weight in model_weights.items():
        if name in all_model_results:
            result = all_model_results[name]
            composite_ne_prob += result.get('patriots_win_prob', 0.5) * weight
            composite_spread += result.get('predicted_spread', 0) * weight
            composite_total += result.get('predicted_total', 44) * weight
            total_weight += weight

    if total_weight > 0:
        composite_ne_prob /= total_weight
        composite_spread /= total_weight
        composite_total /= total_weight

    # Apply intangibles adjustment to spread
    intangibles_adj = intangibles_result.get('weighted_adjustment', 0)
    composite_spread += intangibles_adj

    # Recalculate win prob from adjusted spread
    from scipy.special import expit
    composite_ne_prob_adjusted = float(expit(composite_spread * 0.145))

    # Get most likely score from Monte Carlo
    most_likely_score = mc_result.get('most_likely_score', (20, 24))

    composite = {
        'patriots_win_prob': composite_ne_prob_adjusted,
        'seahawks_win_prob': 1 - composite_ne_prob_adjusted,
        'predicted_spread': composite_spread,
        'predicted_total': composite_total,
        'most_likely_score': most_likely_score,
        'confidence': max(composite_ne_prob_adjusted, 1 - composite_ne_prob_adjusted),
        'intangibles_adjustment': intangibles_adj
    }

    # ─── Step 5: Value Analysis ───
    print("Analyzing value vs. Vegas lines...", flush=True)
    value_finder = ValueFinder(vegas_lines)

    # Determine spread value
    vegas_spread = vegas_lines.get('game', {}).get('spread', {}).get('line', -4.5)
    vegas_total = vegas_lines.get('game', {}).get('total', {}).get('over_under', 45.5)

    spread_edge = composite_spread - vegas_spread
    total_edge = composite_total - vegas_total

    spread_value = {}
    if abs(spread_edge) > 1.5:
        if spread_edge > 0:  # Model says NE should be closer / SEA not as big a favorite
            spread_value = {'direction': 'NE', 'edge': spread_edge, 'recommendation': 'Patriots +4.5'}
        else:
            spread_value = {'direction': 'SEA', 'edge': abs(spread_edge), 'recommendation': 'Seahawks -4.5'}
    else:
        spread_value = {'direction': 'NO VALUE', 'edge': spread_edge, 'recommendation': 'No bet'}

    total_value = {}
    if abs(total_edge) > 2.0:
        if total_edge > 0:
            total_value = {'direction': 'OVER', 'edge': total_edge, 'recommendation': f'OVER {vegas_total}'}
        else:
            total_value = {'direction': 'UNDER', 'edge': abs(total_edge), 'recommendation': f'UNDER {vegas_total}'}
    else:
        total_value = {'direction': 'NO VALUE', 'edge': total_edge, 'recommendation': 'No bet'}

    value_analysis = {
        'model_spread': composite_spread,
        'model_total': composite_total,
        'spread_value': spread_value,
        'total_value': total_value,
        'vegas_spread': vegas_spread,
        'vegas_total': vegas_total
    }

    # ─── Step 6: Player Prop Analysis ───
    print("Analyzing player props...", flush=True)
    prop_analyzer = PropAnalyzer(player_stats, team_stats)
    prop_results = prop_analyzer.generate_prop_report()

    # ─── Step 7: Scenario Analysis ───
    print("Running scenario/sensitivity analysis...", flush=True)
    scenario_engine = ScenarioEngine(models, team_stats, intangibles)
    scenario_results = scenario_engine.sensitivity_analysis()

    # ─── Step 8: Generate Visualizations ───
    print("Generating visualizations...", flush=True)
    charts = PredictionCharts(output_dir=os.path.join(os.path.dirname(__file__), 'output'))

    try:
        # Model comparison chart
        charts.model_comparison_chart(all_model_results)
        print("  → Saved model_comparison.png")
    except Exception as e:
        print(f"  → Warning: Could not generate model comparison chart: {e}")

    try:
        # Monte Carlo distribution
        charts.monte_carlo_distribution(mc_result)
        print("  → Saved monte_carlo_distribution.png")
    except Exception as e:
        print(f"  → Warning: Could not generate MC distribution chart: {e}")

    try:
        # Radar chart
        charts.radar_chart(ne_stats, sea_stats)
        print("  → Saved radar_comparison.png")
    except Exception as e:
        print(f"  → Warning: Could not generate radar chart: {e}")

    try:
        # Value map — expects {model_name: spread_float, ...} and vegas_lines with flat 'spread' key
        value_map_spreads = {name: result.get('predicted_spread', 0)
                            for name, result in all_model_results.items()
                            if isinstance(result, dict) and 'predicted_spread' in result
                            and name not in ('composite', 'Intangibles')}
        vegas_flat = {'spread': vegas_lines.get('game', {}).get('spread', {}).get('line', -4.5)}
        charts.value_map(value_map_spreads, vegas_flat)
        print("  → Saved value_map.png")
    except Exception as e:
        print(f"  → Warning: Could not generate value map: {e}")

    try:
        # Intangibles breakdown — expects {factor_name: {'adjustment': float, 'confidence': float}}
        intangibles_chart_data = {}
        for factor_name, factor_data in intangibles_result.get('breakdown', {}).items():
            intangibles_chart_data[factor_data.get('description', factor_name)[:30]] = {
                'adjustment': factor_data.get('weighted_adjustment', 0),
                'confidence': factor_data.get('confidence', 0.5)
            }
        charts.intangibles_breakdown(intangibles_chart_data)
        print("  → Saved intangibles_breakdown.png")
    except Exception as e:
        print(f"  → Warning: Could not generate intangibles chart: {e}")

    try:
        # Sensitivity tornado — expects {variable: (low, high), ...}
        tornado_data = scenario_results.get('tornado_data', {})
        charts.sensitivity_tornado(tornado_data)
        print("  → Saved sensitivity_tornado.png")
    except Exception as e:
        print(f"  → Warning: Could not generate sensitivity chart: {e}")

    # ─── Step 9: Print Report ───
    print("\n" + "=" * 60 + "\n", flush=True)

    report = ReportGenerator()
    report.print_full_pregame_report(
        composite=composite,
        all_model_results=all_model_results,
        value_analysis=value_analysis,
        vegas_lines=vegas_lines,
        intangibles_results=intangibles_result,
        scenario_results=scenario_results,
        prop_results=prop_results
    )

    print(f"\nCharts saved to: {os.path.join(os.path.dirname(__file__), 'output')}/")

    return composite, all_model_results


if __name__ == '__main__':
    main()
