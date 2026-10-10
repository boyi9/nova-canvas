"""拍摄任务卡生成测试。"""
import pytest
from web.backend.host.shot_card import (
    build_shot_card,
    generate_shot_cards_from_manifest,
    ShotCard,
)


def test_build_shot_card_basic():
    """测试基础任务卡生成。"""
    shot = {
        "shot_id": "S01",
        "shot_size": "近景",
        "camera_move": "固定",
        "duration_sec": 3.0,
        "scene": "day",
    }
    card = build_shot_card(shot, device="generic_2026_flagship")
    assert isinstance(card, ShotCard)
    assert card.shot_id == "S01"
    assert card.shot_size == "近景"
    assert card.camera_move == "固定"
    assert card.gear == "三脚架"
    assert card.fps == 60  # 默认 60
    assert card.shutter == "1/120s"
    assert card.white_balance_k == 5600
    assert card.subject_ratio_pct == 70
    assert card.device_warning == ""


def test_build_shot_card_emotion_emphasis():
    """测试强调情绪镜头请求 120fps。"""
    shot = {
        "shot_id": "S02",
        "shot_size": "特写",
        "camera_move": "推近",
        "duration_sec": 2.0,
        "emotion": "强调",
    }
    card = build_shot_card(shot, device="generic_2026_flagship")
    # 普通机型上限 60fps，应自动下调
    assert card.fps == 60
    assert "已自动下调" in card.device_warning
    assert card.gear == "滑轨或手机稳定器"


def test_build_shot_card_flagship_device():
    """测试旗舰机型支持 120fps。"""
    shot = {
        "shot_id": "S03",
        "shot_size": "特写",
        "emotion": "强调",
    }
    card = build_shot_card(shot, device="iphone_18_pro_max")
    assert card.fps == 120  # 旗舰支持 120
    assert card.device_warning == ""


def test_shot_card_warnings():
    """测试警告生成。"""
    shot = {
        "shot_id": "S04",
        "shot_size": "近景",
        "warnings": ["逆光", "反光"],
    }
    card = build_shot_card(shot)
    assert any("逆光" in n for n in card.notes)
    assert any("反光" in n for n in card.notes)
    assert any("手指" in n for n in card.notes)  # 近景自动添加


def test_generate_from_manifest():
    """测试从 Manifest 批量生成。"""
    manifest = {
        "project_id": "PRJ-001",
        "shots": [
            {"shot_id": "S01", "source": "live_action", "shot_size": "近景"},
            {"shot_id": "S02", "source": "ai_generated", "shot_size": "全景"},
            {"shot_id": "S03", "source": "live_action", "shot_size": "特写"},
        ],
    }
    cards = generate_shot_cards_from_manifest(manifest)
    assert len(cards) == 2  # 只有 source=live_action 的
    assert cards[0].shot_id == "S01"
    assert cards[1].shot_id == "S03"


def test_shot_card_to_dict():
    """测试序列化。"""
    shot = {"shot_id": "S05", "shot_size": "中景"}
    card = build_shot_card(shot)
    d = card.to_dict()
    assert d["shot_id"] == "S05"
    assert d["shot_size"] == "中景"
    assert "camera_distance_m" in d


if __name__ == "__main__":
    pytest.main([__file__, "-v"])