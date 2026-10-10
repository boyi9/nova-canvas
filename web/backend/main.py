# -*- coding: utf-8 -*-
# file: backend/main.py
# 作用：P0-B FastAPI 装配入口 —— 挂载全部已实现 router
# 启动：cd web && uvicorn backend.main:app --reload --port 8000
# 或：  cd web/backend && uvicorn main:app --port 8000
import sys
from pathlib import Path

# 保证 `web` 包可导入（兼容两种启动目录）
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from web.backend.host import host_router
from web.backend.routers import (
    audio_api,
    billing_api,
    collab_api,
    export_api,
    game_assets_api,
    model_router_api,
    pro_router,
    projects_api,
    retouch_api,
)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Nova Canvas Backend",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(host_router.router)
    app.include_router(model_router_api.router)
    app.include_router(pro_router.router)
    app.include_router(retouch_api.router)
    app.include_router(billing_api.router)
    app.include_router(export_api.router)
    app.include_router(projects_api.router)
    app.include_router(collab_api.router)
    app.include_router(audio_api.router)
    app.include_router(game_assets_api.router)

    @app.get("/api/health", summary="健康检查")
    def health() -> dict:
        return {"status": "ok", "service": "nova-canvas-backend"}

    @app.get("/api/catalog/startup-assert", summary="启动期断言（操控配置+模型目录）")
    def startup_assert() -> dict:
        from web.backend.models.control_mode import startup_assert_control_config
        from web.backend.models.catalog import get_catalog

        # 默认档位 M2（流水线自动+人把关），不含任何红线自动动作
        startup_assert_control_config({"control_mode": "M2", "auto_actions": []})
        catalog = get_catalog()
        return {"control_config": "ok", "catalog": catalog.summary()}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
