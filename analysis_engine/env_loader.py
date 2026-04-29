"""
统一的 .env 文件加载入口
所有需要环境变量的 Python 脚本应从此模块加载，消除重复的 _load_env() 调用。
"""
import os
from pathlib import Path

_loaded = False


def load_env():
    """从项目根目录加载 .env 文件（幂等，仅首次调用生效）"""
    global _loaded
    if _loaded:
        return
    _loaded = True

    env_file = Path(__file__).parent.parent / ".env"
    if not env_file.exists():
        return

    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k not in os.environ:
                    os.environ[k] = v
