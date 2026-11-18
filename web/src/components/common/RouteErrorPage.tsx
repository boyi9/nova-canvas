import { Button, Result } from "antd";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ROUTES } from "@/router/routes";

/**
 * 路由级错误边界（createBrowserRouter 的 errorElement）。
 *
 * 与组件级 ErrorBoundary 的分工：
 * - 组件级边界捕获子树渲染异常，保留布局；
 * - 路由级边界兜住 loader/懒加载/布局本身的异常，仍可导航回首页。
 */
export function RouteErrorPage() {
    const error = useRouteError();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const status = isRouteErrorResponse(error) ? error.status : 500;
    const subTitle = isRouteErrorResponse(error) ? String(error.data ?? error.statusText ?? "") : error instanceof Error ? error.message : "";

    return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Result
                status={status === 404 ? "404" : "error"}
                title={status === 404 ? t("routeError.notFound", "页面不存在") : t("routeError.title", "页面加载失败")}
                subTitle={subTitle || t("routeError.subtitle", "请重试，或返回首页继续操作。")}
                extra={[
                    <Button key="home" type="primary" onClick={() => navigate(ROUTES.nova)}>
                        {t("routeError.goHome", "返回首页")}
                    </Button>,
                    <Button key="reload" onClick={() => window.location.reload()}>
                        {t("routeError.reload", "重新加载")}
                    </Button>,
                ]}
            />
        </div>
    );
}
