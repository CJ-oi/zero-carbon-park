from __future__ import annotations

import unittest

from park_observer.portfolio import Project, select_portfolio


class PortfolioTests(unittest.TestCase):
    def p(self, pid: str, capex: float, abatement: float, saving: float, *, prereq=(), mutex="") -> Project:
        return Project(pid, pid, "测试", capex, abatement, saving, 0, 10, 2027, prerequisites=prereq, mutex_group=mutex)

    def test_meeting_target_prefers_lower_npv_cost(self) -> None:
        projects = [
            self.p("A", 100, 60, 30),
            self.p("B", 100, 60, 10),
            self.p("C", 170, 120, 5),
        ]
        result = select_portfolio(projects, budget_10k_cny=200, annual_target_tco2=120, discount_rate=0.05)
        self.assertTrue(result["meets_target"])
        self.assertEqual(set(result["project_ids"]), {"A", "B"})

    def test_fallback_search_keeps_best_abatement(self) -> None:
        # No combination can reach 100; the exact fallback must still inspect
        # combinations and choose A+B rather than prematurely keeping A.
        projects = [self.p("A", 40, 40, 1), self.p("B", 40, 35, 1), self.p("C", 70, 50, 1)]
        result = select_portfolio(projects, budget_10k_cny=80, annual_target_tco2=100)
        self.assertFalse(result["meets_target"])
        self.assertEqual(set(result["project_ids"]), {"A", "B"})
        self.assertEqual(result["annual_abatement_tco2"], 75)

    def test_prerequisite_and_mutex(self) -> None:
        projects = [
            self.p("BASE", 10, 5, 1),
            self.p("UP", 20, 40, 2, prereq=("BASE",)),
            self.p("X1", 15, 30, 2, mutex="x"),
            self.p("X2", 15, 35, 2, mutex="x"),
        ]
        result = select_portfolio(projects, budget_10k_cny=45, annual_target_tco2=70)
        self.assertIn("BASE", result["project_ids"] if "UP" in result["project_ids"] else ["BASE"])
        self.assertFalse({"X1", "X2"}.issubset(set(result["project_ids"])))


if __name__ == "__main__":
    unittest.main()
