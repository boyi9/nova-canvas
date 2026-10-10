import { Component, ErrorInfo, ReactNode } from "react";
import { Alert, Button, Card, Modal, Typography } from "antd";
import { Bug, RefreshCw, Home, Copy, AlertOctagon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    showDetails?: boolean;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

// 类组件不能调用 Hook：把需要 t() 的错误 UI 抽成函数组件
function ErrorBoundaryFallback({ error, errorInfo, showDetails, onRetry }: {
    error: Error | null;
    errorInfo: ErrorInfo | null;
    showDetails: boolean;
    onRetry: () => void;
}) {
    const { t } = useTranslation();

    const handleCopyError = (): void => {
        if (!error) return;
        const text = `Error: ${error.message}\nStack: ${error.stack}\nComponent Stack: ${errorInfo?.componentStack}`;
        navigator.clipboard.writeText(text);
    };

    const handleGoHome = (): void => {
        window.location.href = "/";
    };

    return (
        <Card
            style={{ maxWidth: 600, margin: "40px auto", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}
            bordered={false}
        >
            <div style={{ padding: 32, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}><AlertOctagon className="size-12 text-destructive" /></div>
                <Typography.Title level={3} style={{ marginBottom: 8 }}>
                    {t("errorBoundary.title", "组件渲染出错了")}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ marginBottom: 24 }}>
                    {t("errorBoundary.subtitle", "别担心，这不是你的错。开发团队已收到错误报告。")}
                </Typography.Text>

                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 24 }}>
                    <Button
                        type="primary"
                        icon={<RefreshCw />}
                        onClick={onRetry}
                        size="large"
                    >
                        {t("errorBoundary.retry", "重试")}
                    </Button>
                    <Button icon={<Home />} onClick={handleGoHome} size="large">
                        {t("errorBoundary.goHome", "返回首页")}
                    </Button>
                </div>

                {showDetails && error && (
                    <Alert
                        type="error"
                        closable
                        message={t("errorBoundary.errorDetails", "错误详情")}
                        description={
                            <div style={{ textAlign: "left", maxHeight: 300, overflow: "auto" }}>
                                <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                    {error.name}: {error.message}
                                    {error.stack && `\n\n${error.stack}`}
                                </pre>
                            </div>
                        }
                        showIcon
                    />
                )}

                {showDetails && errorInfo?.componentStack && (
                    <Alert
                        type="info"
                        closable
                        message={t("errorBoundary.componentStack", "组件堆栈")}
                        description={
                            <div style={{ textAlign: "left", maxHeight: 200, overflow: "auto" }}>
                                <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                    {errorInfo.componentStack}
                                </pre>
                            </div>
                        }
                        showIcon
                    />
                )}

                <div style={{ marginTop: 16 }}>
                    <Button
                        icon={<Copy />}
                        onClick={handleCopyError}
                        type="dashed"
                        size="small"
                    >
                        {t("errorBoundary.copyError", "复制错误信息")}
                    </Button>
                </div>

                <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
                    {t("errorBoundary.reportHint", "错误已自动上报，如问题持续请联系技术支持")}
                </Typography.Paragraph>
            </div>
        </Card>
    );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        this.setState({ error, errorInfo });
        this.props.onError?.(error, errorInfo);
        console.error("[ErrorBoundary] 捕获到错误:", error, errorInfo);
    }

    private handleRetry = (): void => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render(): ReactNode {
        const { hasError, error, errorInfo } = this.state;
        const { fallback, children, showDetails = true } = this.props;

        if (hasError) {
            if (fallback) return fallback;

            return (
                <ErrorBoundaryFallback
                    error={error}
                    errorInfo={errorInfo}
                    showDetails={showDetails}
                    onRetry={this.handleRetry}
                />
            );
        }

        return this.props.children;
    }
}

// 高阶组件：包裹页面级组件
export function withErrorBoundary<P extends object>(
    Component: React.ComponentType<P>,
    errorBoundaryProps?: Omit<ErrorBoundaryProps, "children">
): React.FC<P> {
    return (props: P) => (
        <ErrorBoundary {...errorBoundaryProps}>
            <Component {...props} />
        </ErrorBoundary>
    );
}

// 专用：Canvas 编辑器错误边界（最复杂，单独包裹）
export function CanvasErrorBoundary({ children }: { children: ReactNode }) {
    return (
        <ErrorBoundary
            showDetails={import.meta.env.DEV}
            onError={(error) => {
                console.error("[CanvasErrorBoundary]", error);
            }}
        >
            {children}
        </ErrorBoundary>
    );
}

// 专用：Nova 工作台错误边界
export function NovaWorkbenchErrorBoundary({ children }: { children: ReactNode }) {
    return (
        <ErrorBoundary
            showDetails={import.meta.env.DEV}
            fallback={
                <div style={{ padding: 24, textAlign: "center" }}>
                    <Bug className="mx-auto mb-4 text-4xl text-red-500" />
                    <h3 className="text-lg font-medium text-red-600 dark:text-red-400">工作台加载失败</h3>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">请刷新页面重试</p>
                </div>
            }
        >
            {children}
        </ErrorBoundary>
    );
}

// 专用：Modal 内容错误边界
export function ModalErrorBoundary({ children }: { children: ReactNode }) {
    return (
        <ErrorBoundary
            fallback={
                <div style={{ padding: 16, textAlign: "center" }}>
                    <Bug className="mx-auto mb-2 text-2xl text-red-500" />
                    <p className="text-red-600 dark:text-red-400">弹窗内容加载失败</p>
                    <p className="text-xs text-gray-500">请关闭重试</p>
                </div>
            }
        >
            {children}
        </ErrorBoundary>
    );
}

export default ErrorBoundary;