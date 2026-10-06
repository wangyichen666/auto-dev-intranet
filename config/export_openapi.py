"""导出 BFF 契约，不构建上游运行时、不读取状态目录。"""
import json
from pathlib import Path
from auto_dev_intranet.app import create_app

root = Path(__file__).resolve().parents[1]
(root / "config/openapi.json").write_text(
    json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
