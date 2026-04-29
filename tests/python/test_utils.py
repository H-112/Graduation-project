"""
env_loader 模块测试
验证 .env 加载幂等性和安全性
"""
import os
import tempfile
from pathlib import Path
import env_loader


def test_load_env_idempotent():
    """多次调用 load_env 应该是安全的"""
    env_loader._loaded = False  # reset
    env_loader.load_env()
    loaded = env_loader._loaded
    env_loader.load_env()
    assert env_loader._loaded == loaded


def test_sanitize_prompt_text():
    """验证 Prompt 文本清理"""
    from utils import sanitize_prompt_text

    assert sanitize_prompt_text("hello\x00world") == "helloworld"
    long_text = "a" * 600
    assert len(sanitize_prompt_text(long_text)) <= 503  # 500 + "..."
    assert sanitize_prompt_text("  hello  ") == "hello"


def test_validate_path():
    """验证路径白名单"""
    from utils import validate_path

    # 有效路径
    p = validate_path(str(Path(__file__).parent.parent.parent / "data"))
    assert p.exists()

    # 无效路径
    try:
        validate_path("/etc/passwd")
        assert False, "Should have raised ValueError"
    except ValueError:
        pass
