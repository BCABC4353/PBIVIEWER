"""
Report Generator for Super Bowl LX Prediction Engine.

Produces formatted terminal output using the rich library with
color-coded tables, panels, and progress indicators.
"""

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.columns import Columns
from rich.align import Align
from rich import box


class ReportGenerator:
    """Generates formatted terminal reports for predictions."""

    def __init__(self):
        self.console = Console(width=80)
        self.ne_color = "red"
        self.sea_color = "green"

    def print_header(self):
        """Print the main header banner."""
        header_text = Text()
        header_text.append("SUPER BOWL LX PREDICTION ENGINE\n", style="bold white")
        header_text.append("New England Patriots", style=f"bold {self.ne_color}")
        header_text.append(" vs. ", style="white")
        header_text.append("Seattle Seahawks", style=f"bold {self.sea_color}")
        header_text.append("\nFebruary 8, 2026 — Levi's Stadium, Santa Clara, CA", style="dim white")
        header_text.append("\nKickoff: 6:30 PM ET", style="dim white")

        panel = Panel(
            Align.center(header_text),
            border_style="bright_blue",
            box=box.DOUBLE,
            padding=(1, 2)
        )
        self.console.print(panel)
        self.console.print()

    def print_composite_prediction(self, composite: dict):
        """Print the composite prediction summary."""
        self.console.print("[bold bright_blue]COMPOSITE PREDICTION[/]")
        self.console.print("━" * 60)

        ne_prob = composite.get('patriots_win_prob', 0.5)
        sea_prob = composite.get('seahawks_win_prob', 0.5)
        spread = composite.get('predicted_spread', 0)
        total = composite.get('predicted_total', 44)
        score = composite.get('most_likely_score', (20, 24))

        # Win probability with color
        ne_pct = f"{ne_prob * 100:.1f}%"
        sea_pct = f"{sea_prob * 100:.1f}%"
        self.console.print(f"  Win Probability:   [{self.ne_color}]Patriots {ne_pct}[/]  |  [{self.sea_color}]Seahawks {sea_pct}[/]")

        # Spread
        if spread < 0:
            spread_str = f"Seahawks -{abs(spread):.1f}"
        else:
            spread_str = f"Patriots -{abs(spread):.1f}" if spread > 0 else "PICK"
        self.console.print(f"  Predicted Spread:  {spread_str}")

        # Total
        self.console.print(f"  Predicted Total:   {total:.1f} points")

        # Most likely score
        if isinstance(score, (tuple, list)) and len(score) == 2:
            self.console.print(f"  Most Likely Score: [{self.ne_color}]NE {score[0]}[/] - [{self.sea_color}]SEA {score[1]}[/]")

        # Confidence bar
        confidence = max(ne_prob, sea_prob)
        bar_filled = int(confidence * 20)
        bar_empty = 20 - bar_filled
        bar = "█" * bar_filled + "░" * bar_empty
        self.console.print(f"  Confidence:        [{bar}] {confidence * 100:.0f}%")

        self.console.print()

    def print_model_breakdown(self, all_model_results: dict):
        """Print table showing each model's predictions."""
        self.console.print("[bold bright_blue]MODEL BREAKDOWN[/]")
        self.console.print("━" * 60)

        table = Table(box=box.SIMPLE_HEAVY, show_header=True, header_style="bold")
        table.add_column("Model", style="cyan", width=22)
        table.add_column("NE Win%", justify="center", width=10)
        table.add_column("SEA Win%", justify="center", width=10)
        table.add_column("Spread", justify="center", width=9)
        table.add_column("Total", justify="center", width=8)

        for name, result in all_model_results.items():
            if name == 'composite' or name == 'Intangibles':
                continue
            ne_prob = result.get('patriots_win_prob', 0.5)
            sea_prob = result.get('seahawks_win_prob', 0.5)
            spread = result.get('predicted_spread', 0)
            total = result.get('predicted_total', 44)

            spread_str = f"{spread:+.1f}" if spread != 0 else "PICK"

            table.add_row(
                name,
                f"[{self.ne_color}]{ne_prob * 100:.1f}%[/]",
                f"[{self.sea_color}]{sea_prob * 100:.1f}%[/]",
                spread_str,
                f"{total:.1f}"
            )

        # Add intangibles row if present
        if 'Intangibles' in all_model_results:
            intang = all_model_results['Intangibles']
            adj = intang.get('weighted_adjustment', 0)
            table.add_row(
                "─" * 20, "─" * 8, "─" * 8, "─" * 7, "─" * 6,
                style="dim"
            )
            table.add_row(
                "Intangibles Adj.",
                "", "",
                f"[yellow]{adj:+.1f} pts[/]",
                "",
                style="italic"
            )

        self.console.print(table)
        self.console.print()

    def print_value_assessment(self, value_analysis: dict, vegas_lines: dict):
        """Print Vegas comparison and value assessment."""
        self.console.print("[bold bright_blue]VALUE ASSESSMENT vs. VEGAS[/]")
        self.console.print("━" * 60)

        game = vegas_lines.get('game', vegas_lines)

        # Spread value
        vegas_spread = game.get('spread', {}).get('line', -4.5)
        model_spread = value_analysis.get('model_spread', 0)
        spread_value = value_analysis.get('spread_value', {})

        spread_direction = spread_value.get('direction', 'NO VALUE')
        edge = spread_value.get('edge', 0)

        if spread_direction == 'NE':
            value_str = f"[bold {self.ne_color}]VALUE ON PATRIOTS +4.5[/]"
        elif spread_direction == 'SEA':
            value_str = f"[bold {self.sea_color}]VALUE ON SEAHAWKS -4.5[/]"
        else:
            value_str = "[dim]NO VALUE[/]"

        self.console.print(f"  Vegas Spread: SEA {vegas_spread}  →  Model: SEA {model_spread:+.1f}  →  {value_str}")
        if abs(edge) > 0:
            self.console.print(f"  Edge: {abs(edge):.1f} points")

        # Total value
        vegas_total = game.get('total', {}).get('over_under', 45.5)
        model_total = value_analysis.get('model_total', 44)
        total_value = value_analysis.get('total_value', {})

        total_direction = total_value.get('direction', 'NO VALUE')
        total_edge = total_value.get('edge', 0)

        if total_direction == 'OVER':
            total_str = "[bold yellow]VALUE ON OVER[/]"
        elif total_direction == 'UNDER':
            total_str = "[bold cyan]VALUE ON UNDER[/]"
        else:
            total_str = "[dim]NO VALUE[/]"

        self.console.print(f"  Vegas Total:  {vegas_total}  →  Model: {model_total:.1f}  →  {total_str}")
        if abs(total_edge) > 0:
            self.console.print(f"  Edge: {abs(total_edge):.1f} points")

        self.console.print()

    def print_intangibles(self, intangibles_results: dict):
        """Print intangibles factor breakdown."""
        self.console.print("[bold bright_blue]INTANGIBLES IMPACT[/]")
        self.console.print("━" * 60)

        table = Table(box=box.SIMPLE_HEAVY, show_header=True, header_style="bold")
        table.add_column("Factor", style="cyan", width=32)
        table.add_column("Adjustment", justify="center", width=13)
        table.add_column("Confidence", justify="center", width=12)

        breakdown = intangibles_results.get('breakdown', {})

        for factor_name, factor_data in breakdown.items():
            adj = factor_data.get('weighted_adjustment', 0)
            conf = factor_data.get('confidence', 0)
            desc = factor_data.get('description', factor_name)

            if adj < 0:
                adj_str = f"[{self.ne_color}]NE {adj:+.1f}[/]"
            elif adj > 0:
                adj_str = f"[{self.sea_color}]NE {adj:+.1f}[/]"
            else:
                adj_str = "[dim]0.0[/]"

            table.add_row(desc[:30], adj_str, f"{conf:.2f}")

        self.console.print(table)

        total = intangibles_results.get('weighted_adjustment', 0)
        interp = intangibles_results.get('interpretation', '')
        self.console.print(f"\n  [bold]Total Weighted Adjustment: {total:+.1f} points[/]")
        self.console.print(f"  [italic dim]{interp}[/]")
        self.console.print()

    def print_sensitivity(self, scenario_results: dict):
        """Print key scenario sensitivity impacts."""
        self.console.print("[bold bright_blue]SENSITIVITY ANALYSIS[/]")
        self.console.print("━" * 60)

        baseline = scenario_results.get('baseline_spread', 0)
        tornado = scenario_results.get('tornado_data', {})

        table = Table(box=box.SIMPLE_HEAVY, show_header=True, header_style="bold")
        table.add_column("Variable", style="cyan", width=22)
        table.add_column("Low Spread", justify="center", width=12)
        table.add_column("High Spread", justify="center", width=12)
        table.add_column("Range", justify="center", width=10)

        for var_name, (low, high) in sorted(tornado.items(), key=lambda x: abs(x[1][1] - x[1][0]), reverse=True):
            range_val = abs(high - low)
            table.add_row(
                var_name,
                f"{low:+.1f}",
                f"{high:+.1f}",
                f"{range_val:.1f} pts"
            )

        self.console.print(table)
        self.console.print(f"\n  [dim]Baseline spread: SEA {baseline:+.1f}[/]")
        self.console.print()

    def print_prop_analysis(self, prop_results: list):
        """Print player prop bet recommendations."""
        self.console.print("[bold bright_blue]PLAYER PROP ANALYSIS[/]")
        self.console.print("━" * 60)

        table = Table(box=box.SIMPLE_HEAVY, show_header=True, header_style="bold")
        table.add_column("Player / Prop", style="cyan", width=28)
        table.add_column("Line", justify="center", width=8)
        table.add_column("Projection", justify="center", width=12)
        table.add_column("Edge", justify="center", width=10)
        table.add_column("Pick", justify="center", width=10)

        if isinstance(prop_results, list):
            for prop in prop_results:
                player = prop.get('player', '')
                prop_type = prop.get('prop', '')
                line = prop.get('line', '')
                projection = prop.get('projection', '')
                edge = prop.get('edge', 0)
                pick = prop.get('recommendation', '')

                label = f"{player} {prop_type}"

                if isinstance(edge, (int, float)) and edge > 0:
                    edge_str = f"[bold green]+{edge:.1f}[/]"
                elif isinstance(edge, (int, float)) and edge < 0:
                    edge_str = f"[bold red]{edge:.1f}[/]"
                else:
                    edge_str = "[dim]—[/]"

                line_str = f"{line}" if line else "—"
                proj_str = f"{projection:.1f}" if isinstance(projection, (int, float)) else str(projection)

                pick_color = "green" if 'OVER' in str(pick).upper() else "red" if 'UNDER' in str(pick).upper() else "yellow"

                table.add_row(label[:26], line_str, proj_str, edge_str, f"[{pick_color}]{pick}[/]")

        self.console.print(table)
        self.console.print()

    def print_full_pregame_report(self, composite: dict, all_model_results: dict,
                                   value_analysis: dict, vegas_lines: dict,
                                   intangibles_results: dict, scenario_results: dict = None,
                                   prop_results: list = None):
        """Print the complete pre-game analysis report."""
        self.print_header()
        self.print_composite_prediction(composite)
        self.print_model_breakdown(all_model_results)
        self.print_value_assessment(value_analysis, vegas_lines)
        self.print_intangibles(intangibles_results)

        if scenario_results:
            self.print_sensitivity(scenario_results)

        if prop_results:
            self.print_prop_analysis(prop_results)

        # Footer
        self.console.print("─" * 60)
        self.console.print(
            "[dim italic]Built by Brendan Cameron | BCABC, LLC | Super Bowl Sunday 2026\n"
            "\"For entertainment and analytical purposes\"[/]"
        )
        self.console.print()

    def print_live_update(self, game_state, win_probs: dict, projected_score: dict = None):
        """Print a live game update."""
        self.console.print()

        # Score display
        ne_score = getattr(game_state, 'score_patriots', 0)
        sea_score = getattr(game_state, 'score_seahawks', 0)
        quarter = getattr(game_state, 'quarter', 1)
        time_rem = getattr(game_state, 'time_remaining', 900)

        q_str = f"Q{quarter}" if quarter <= 4 else "OT"
        mins = time_rem // 60
        secs = time_rem % 60

        score_text = Text()
        score_text.append(f"NE ", style=f"bold {self.ne_color}")
        score_text.append(f"{ne_score}", style=f"bold {self.ne_color}")
        score_text.append(f"  —  ", style="white")
        score_text.append(f"SEA ", style=f"bold {self.sea_color}")
        score_text.append(f"{sea_score}", style=f"bold {self.sea_color}")
        score_text.append(f"  |  {q_str} {mins:02d}:{secs:02d}", style="dim white")

        panel = Panel(Align.center(score_text), border_style="bright_blue", box=box.ROUNDED)
        self.console.print(panel)

        # Win probabilities
        ne_prob = win_probs.get('patriots_win_prob', 0.5)
        sea_prob = win_probs.get('seahawks_win_prob', 0.5)

        ne_bar_len = int(ne_prob * 40)
        sea_bar_len = 40 - ne_bar_len

        self.console.print(f"  [{self.ne_color}]NE  {'█' * ne_bar_len}{'░' * sea_bar_len} {ne_prob * 100:.1f}%[/]")
        self.console.print(f"  [{self.sea_color}]SEA {'░' * ne_bar_len}{'█' * sea_bar_len} {sea_prob * 100:.1f}%[/]")

        # Projected final
        if projected_score:
            ne_proj = projected_score.get('patriots', 0)
            sea_proj = projected_score.get('seahawks', 0)
            self.console.print(f"\n  Projected Final: [{self.ne_color}]NE {ne_proj:.0f}[/] - [{self.sea_color}]SEA {sea_proj:.0f}[/]")

        momentum = win_probs.get('momentum_indicator', 'EVEN')
        if momentum != 'EVEN':
            color = self.ne_color if momentum == 'NE' else self.sea_color
            self.console.print(f"  Momentum: [{color}]{momentum}[/]")

        self.console.print()
