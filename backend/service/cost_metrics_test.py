"""cost_metrics_test.py — 成本可观测模块单测（纯标准库）。"""

import os
import tempfile
import unittest

from backend.service.cost_metrics import CostMetrics


class TestCostMetrics(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        self.m = CostMetrics(self.path, budget_usd=100.0)

    def tearDown(self):
        if os.path.exists(self.path):
            os.remove(self.path)

    def test_record_and_monthly_total(self):
        self.m.record("ai_text_to_audio", 0.0)  # 不计零成本
        self.m.record("ai_text_to_audio", 0.02)
        self.m.record("ai_text_to_video", 0.05)
        self.assertAlmostEqual(self.m.monthly_total(), 0.07, places=6)
        self.assertAlmostEqual(self.m.snapshot()["remaining_usd"], 99.93, places=4)

    def test_per_tool_breakdown(self):
        self.m.record("ai_text_to_audio", 0.02)
        self.m.record("ai_text_to_audio", 0.03)
        self.m.record("ai_text_to_video", 0.10)
        per = self.m.per_tool()
        self.assertAlmostEqual(per["ai_text_to_audio"], 0.05, places=6)
        self.assertAlmostEqual(per["ai_text_to_video"], 0.10, places=6)

    def test_persistence_reload(self):
        self.m.record("ai_text_to_video", 0.07)
        m2 = CostMetrics(self.path, budget_usd=100.0)
        self.assertAlmostEqual(m2.monthly_total(), 0.07, places=6)

    def test_prometheus_format(self):
        self.m.record("ai_text_to_audio", 0.02)
        out = self.m.render_prometheus()
        self.assertIn("ai_cost_spent_usd", out)
        self.assertIn('tool="ai_text_to_audio"', out)

    def test_text_format(self):
        self.m.record("ai_text_to_video", 0.05)
        out = self.m.render_text()
        self.assertIn("剩余", out)
        self.assertIn("0.05", out)


if __name__ == "__main__":
    unittest.main()
