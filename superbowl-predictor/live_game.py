#!/usr/bin/env python3
"""
Super Bowl LX Live Game Tracker

Interactive CLI for inputting current game state and receiving
updated win probability calculations in real-time.

New England Patriots vs. Seattle Seahawks
February 8, 2026 — Levi's Stadium

Built by Brendan Cameron | BCABC, LLC
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import warnings
warnings.filterwarnings('ignore')

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt, IntPrompt, FloatPrompt
from rich.text import Text
from rich.align import Align
from rich import box

from data.data_loader import DataLoader
from live.game_state import GameState
from live.win_probability import WinProbabilityCalculator
from live.recalculator import GameRecalculator
from visualization.report_generator import ReportGenerator
from visualization.charts import PredictionCharts


console = Console(width=80)


def get_pregame_predictions():
    """Load data and run models to establish pre-game baseline."""
    console.print("[dim]Loading pre-game predictions as baseline...[/]")

    loader = DataLoader()
    all_data = loader.load_all()
    team_stats = all_data['team_stats']

    # Run a quick composite for baseline
    from models.elo_model import EloModel
    from models.efficiency_model import EfficiencyModel
    from models.bayesian_model import BayesianModel

    ne = team_stats['patriots']
    sea = team_stats['seahawks']

    results = []
    for ModelClass in [EloModel, EfficiencyModel, BayesianModel]:
        try:
            model = ModelClass()
            results.append(model.predict(ne, sea))
        except Exception:
            pass

    if results:
        avg_ne_prob = sum(r.get('patriots_win_prob', 0.5) for r in results) / len(results)
    else:
        avg_ne_prob = 0.40  # Default: SEA slight favorite

    pregame = {
        'patriots_win_prob': avg_ne_prob,
        'seahawks_win_prob': 1 - avg_ne_prob,
        'predicted_spread': (avg_ne_prob - 0.5) / 0.145 if avg_ne_prob != 0.5 else -4.5,
    }

    console.print(f"[dim]Pre-game baseline: NE {avg_ne_prob*100:.1f}% | SEA {(1-avg_ne_prob)*100:.1f}%[/]\n")

    return pregame, team_stats


def input_game_state():
    """Interactively get current game state from user."""
    console.print("[bold bright_blue]ENTER CURRENT GAME STATE[/]")
    console.print("━" * 50)

    # Score
    ne_score = IntPrompt.ask("  [red]Patriots score[/]", default=0)
    sea_score = IntPrompt.ask("  [green]Seahawks score[/]", default=0)

    # Quarter and time
    quarter = IntPrompt.ask("  Quarter (1-4, 5=OT)", default=1)
    time_str = Prompt.ask("  Time remaining (MM:SS)", default="15:00")
    try:
        parts = time_str.split(":")
        time_remaining = int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        time_remaining = 900

    # Possession and field position
    possession = Prompt.ask("  Possession", choices=["NE", "SEA"], default="NE")
    field_pos_str = Prompt.ask("  Field position (e.g., 'own 25' or 'opp 40')", default="own 25")
    try:
        parts = field_pos_str.lower().split()
        yard = int(parts[1])
        if parts[0] == 'own':
            field_position = yard
        else:
            field_position = 100 - yard
    except (ValueError, IndexError):
        field_position = 25

    # Down and distance
    down = IntPrompt.ask("  Down", default=1)
    distance = IntPrompt.ask("  Distance", default=10)

    # Yardage stats
    ne_total_yards = IntPrompt.ask("  NE total yards", default=0)
    sea_total_yards = IntPrompt.ask("  SEA total yards", default=0)

    # Turnovers
    ne_turnovers = IntPrompt.ask("  NE turnovers", default=0)
    sea_turnovers = IntPrompt.ask("  SEA turnovers", default=0)

    # Time of possession
    ne_top_str = Prompt.ask("  NE time of possession (MM:SS)", default="00:00")
    sea_top_str = Prompt.ask("  SEA time of possession (MM:SS)", default="00:00")

    try:
        ne_parts = ne_top_str.split(":")
        ne_top = int(ne_parts[0]) * 60 + int(ne_parts[1])
    except (ValueError, IndexError):
        ne_top = 0

    try:
        sea_parts = sea_top_str.split(":")
        sea_top = int(sea_parts[0]) * 60 + int(sea_parts[1])
    except (ValueError, IndexError):
        sea_top = 0

    # Passing/rushing
    ne_pass_yards = IntPrompt.ask("  NE passing yards", default=0)
    sea_pass_yards = IntPrompt.ask("  SEA passing yards", default=0)
    ne_rush_yards = IntPrompt.ask("  NE rushing yards", default=0)
    sea_rush_yards = IntPrompt.ask("  SEA rushing yards", default=0)

    # Key events
    events = Prompt.ask("  Key events (injuries, momentum shifts)", default="none")
    key_events = [] if events.lower() == 'none' else [events]

    state = GameState(
        score_patriots=ne_score,
        score_seahawks=sea_score,
        quarter=quarter,
        time_remaining=time_remaining,
        possession=possession,
        field_position=field_position,
        down=down,
        distance=distance,
        ne_total_yards=ne_total_yards,
        sea_total_yards=sea_total_yards,
        ne_turnovers=ne_turnovers,
        sea_turnovers=sea_turnovers,
        ne_passing_yards=ne_pass_yards,
        sea_passing_yards=sea_pass_yards,
        ne_rushing_yards=ne_rush_yards,
        sea_rushing_yards=sea_rush_yards,
        ne_time_of_possession=ne_top,
        sea_time_of_possession=sea_top,
        key_events=key_events
    )

    return state


def main():
    """Main interactive loop for live game tracking."""
    # Header
    header = Text()
    header.append("SUPER BOWL LX — LIVE GAME TRACKER\n", style="bold white")
    header.append("Patriots", style="bold red")
    header.append(" vs. ", style="white")
    header.append("Seahawks", style="bold green")
    header.append("\nLive Win Probability Calculator", style="dim")

    panel = Panel(Align.center(header), border_style="bright_blue", box=box.DOUBLE, padding=(1, 2))
    console.print(panel)
    console.print()

    # Load pre-game baseline
    pregame_probs, team_stats = get_pregame_predictions()

    # Initialize calculators
    wp_calculator = WinProbabilityCalculator(pregame_probs)
    recalculator = GameRecalculator(pregame_probs, team_stats)
    report = ReportGenerator()
    charts = PredictionCharts(output_dir=os.path.join(os.path.dirname(__file__), 'output'))

    trend_data = []

    console.print("[bold]Ready for live game input. Type 'quit' to exit, 'chart' to save win probability chart.[/]\n")

    while True:
        try:
            action = Prompt.ask("\n[bold]Action[/]", choices=["update", "chart", "quit"], default="update")

            if action == "quit":
                console.print("[dim]Exiting live tracker. Final trend data saved.[/]")
                break

            if action == "chart":
                if trend_data:
                    try:
                        filepath = charts.win_probability_live(trend_data)
                        console.print(f"[green]Win probability chart saved to {filepath}[/]")
                    except Exception as e:
                        console.print(f"[red]Could not generate chart: {e}[/]")
                else:
                    console.print("[yellow]No data points yet. Enter at least one game update first.[/]")
                continue

            # Get game state
            game_state = input_game_state()

            # Calculate win probability
            win_probs = wp_calculator.calculate(game_state)

            # Recalculate with efficiency adjustments
            try:
                recalc = recalculator.recalculate(game_state)
                # Blend WP calculator with recalculator
                blend_ne = (win_probs['patriots_win_prob'] + recalc.get('patriots_win_prob', win_probs['patriots_win_prob'])) / 2
                win_probs['patriots_win_prob'] = blend_ne
                win_probs['seahawks_win_prob'] = 1 - blend_ne
            except Exception:
                pass

            # Projected final score
            total_seconds = game_state.total_seconds_remaining()
            elapsed_fraction = 1 - (total_seconds / 3600)

            if elapsed_fraction > 0:
                projected_ne = game_state.score_patriots / elapsed_fraction if elapsed_fraction > 0.1 else game_state.score_patriots
                projected_sea = game_state.score_seahawks / elapsed_fraction if elapsed_fraction > 0.1 else game_state.score_seahawks
            else:
                projected_ne = 20
                projected_sea = 24

            projected_score = {'patriots': projected_ne, 'seahawks': projected_sea}

            # Add to trend data
            q = game_state.quarter
            t = game_state.time_remaining
            time_label = f"Q{q} {t//60}:{t%60:02d}"
            trend_data.append((time_label, win_probs['patriots_win_prob'], win_probs['seahawks_win_prob']))

            # Display update
            report.print_live_update(game_state, win_probs, projected_score)

            # Show trend
            if len(trend_data) > 1:
                console.print("[dim]Win Probability Trend:[/]")
                for tl, ne_p, sea_p in trend_data[-5:]:
                    ne_bar = "█" * int(ne_p * 30)
                    console.print(f"  {tl:>12}  [red]{ne_bar}[/] {ne_p*100:.1f}%")

        except KeyboardInterrupt:
            console.print("\n[dim]Interrupted. Type 'quit' to exit cleanly.[/]")
        except Exception as e:
            console.print(f"[red]Error: {e}[/]")
            import traceback
            traceback.print_exc()

    # Save final chart
    if trend_data:
        try:
            filepath = charts.win_probability_live(trend_data)
            console.print(f"\n[green]Final win probability chart saved to {filepath}[/]")
        except Exception:
            pass

    console.print("\n[dim italic]Built by Brendan Cameron | BCABC, LLC | Super Bowl Sunday 2026[/]")


if __name__ == '__main__':
    main()
